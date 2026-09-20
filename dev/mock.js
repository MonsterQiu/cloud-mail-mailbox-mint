import { makeController } from '../lib/controller.js';
import { makeStorage } from '../lib/storage.js';
import { DEFAULT_CONFIG } from '../lib/validation.js';
import { ApiError } from '../lib/api.js';
const area = (storage, prefix) => ({
  async get(key) { const data = storage.getItem(`${prefix}:${key}`); return { [key]: data ? JSON.parse(data) : undefined }; },
  async set(values) { for (const [key,value] of Object.entries(values)) storage.setItem(`${prefix}:${key}`,JSON.stringify(value)); },
});
const scene = new URLSearchParams(location.search).get('scene');
const inboxPolls = new Map();
const local = area(localStorage, scene ? `mint-preview-${scene}` : 'mint-preview');
if (!(await local.get('vault')).vault) await local.set({ vault: { version:1, config: { ...DEFAULT_CONFIG, baseUrl:'https://mail.example.test', domains:['example.test','inbox.example.test'], defaultDomain:'example.test', token:'demo-token', testedAt:new Date().toISOString() }, records:[] } });
if (scene === 'setup') await local.set({vault: {version:1,config:{...DEFAULT_CONFIG,token:'',testedAt:null},records:[]}});
if (scene === 'stress' && !(await local.get('stress-seeded'))['stress-seeded']) {
  const domain = 'long-domain-for-layout-check.inbox.example.test';
  const records = Array.from({length:65}, (_,i) => ({id:`stress-${i}`,email:`long-mailbox-name-${String(i).padStart(6,'0')}@${domain}`,
    password:'Synthetic$Passw0rd1234',createdAt:new Date(Date.UTC(2026,8,20,8,0)-i*60000).toISOString(),loginUrl:'https://mail.example.test',
    status:i===1?'uncertain':'created',message:i===1?'连接中断或超时，服务端可能已创建邮箱。请保留凭证并去后台核对，勿自动重试。':''}));
  await local.set({vault:{version:1,config:{...DEFAULT_CONFIG,baseUrl:'https://mail.example.test',token:'demo-token',testedAt:new Date().toISOString(),domains:[domain],defaultDomain:domain},records},'stress-seeded':true});
}
const controller = makeController({ storage:makeStorage(local,area(sessionStorage,'mint-preview')), api:{
  async test(config) { if(config.token!=='demo-token') throw new ApiError('Token 无效或权限不足，请在设置中检查。','auth'); },
  async domains() { return {domainList:['@example.test','@inbox.example.test']}; },
  async token() { return {token:'demo-token'}; },
  async inbox(config, email) {
    const count = (inboxPolls.get(email) || 0) + 1; inboxPolls.set(email, count);
    if (email.startsWith('nomail') || (email.startsWith('wait') && count === 1)) return [];
    const receivedAt = new Date(Date.now() - (email.startsWith('oldcode') ? 11 * 60000 : 0)).toISOString();
    return [
      {emailId:901,sendEmail:'login@example.test',sendName:'Example Login',subject:'Your verification code: 482913',
        toEmail:email,createTime:receivedAt,text:'Use verification code 482913 to continue. It expires in 10 minutes.'},
      {emailId:900,sendEmail:'shop@example.test',sendName:'Example Shop',subject:'Your 2026 order update',
        toEmail:email,createTime:new Date(Date.now()-60000).toISOString(),text:'订单号 123456，客服电话 13800138000，价格 CNY 8253。'},
    ];
  },
  async create(config, mailbox) {
    await new Promise(resolve=>setTimeout(resolve,700));
    if(config.token!=='demo-token') throw new ApiError('Token 无效或权限不足，请在设置中检查。','auth');
    if(mailbox.email.startsWith('taken')) throw new ApiError('这个邮箱地址已存在，请换一个名称。','duplicate');
    if(mailbox.email.startsWith('timeout')) throw new ApiError('模拟超时：凭证已保留，请核对。','uncertain');
  },
} });
globalThis.chrome = { runtime:{
  async sendMessage(message) { try{return{ok:true,value:await controller.dispatch(message)};}catch(error){return{ok:false,error:error.message};} },
  openOptionsPage:async()=>{ window.open('/options/options.html','_blank'); },
},permissions:{ request:async()=>true } };
document.title=`[本地模拟] ${document.title}`;
const label=document.querySelector('footer > span');
label.textContent='本地模拟 · 不会创建真实邮箱';
