import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {makeWorker, DAILY_LIMIT} from '../worker.js';
import {hash, randomHex, signSession, verifySession} from '../auth.js';

const ORIGIN='https://codes.example.test';
const TARGET='shared@example.test';
function d1(database,readOnly=false){
 const calls=[];
 return {calls,prepare(sql){
  if(readOnly && !/^\s*SELECT\b/i.test(sql)) throw new Error('Mail database mutation forbidden');
  const statement=database.prepare(sql);
  return {bind(...values){return {async first(){calls.push({sql,values});return statement.get(...values)||null;},async all(){calls.push({sql,values});return {results:statement.all(...values)};},async run(){calls.push({sql,values});return {meta:statement.run(...values)};}};},async all(){calls.push({sql,values:[]});return {results:statement.all()};}};
 }};
}
function fixture(){
 const mail=new DatabaseSync(':memory:');const shares=new DatabaseSync(':memory:');
 mail.exec(`CREATE TABLE account(account_id INTEGER PRIMARY KEY,email TEXT,is_del INTEGER DEFAULT 0);
  CREATE TABLE email(email_id INTEGER PRIMARY KEY,to_email TEXT,type INTEGER DEFAULT 0,is_del INTEGER DEFAULT 0,send_email TEXT,name TEXT,create_time TEXT,subject TEXT,text TEXT,content TEXT);
  CREATE INDEX idx_email_to_email_type_is_del_id ON email(to_email COLLATE NOCASE,type,is_del,email_id DESC);`);
 shares.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 mail.prepare('INSERT INTO account(email) VALUES (?)').run(TARGET);
 mail.prepare('INSERT INTO email(email_id,to_email,subject,text,create_time) VALUES (1,?,?,?,?)').run(TARGET,'验证码 111111','您的验证码是 111111','2026-10-08 01:00:00');
 let now=Date.parse('2026-10-08T02:00:00Z');
 const env={MAIL_DB:d1(mail,true),SHARE_DB:d1(shares),SESSION_SECRET:'session-test-only-'.repeat(4),ADMIN_KEY:'admin-test-only-'.repeat(4),ALLOWED_DOMAINS:'example.test',AUTH_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('fixture page')}};
 const worker=makeWorker({now:()=>now});
 const request=(path,{body,cookie,admin=false,origin=ORIGIN,method}={})=>worker.fetch(new Request(ORIGIN+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{}),...(admin?{Authorization:`Bearer ${env.ADMIN_KEY}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 async function create(){const response=await request('/api/admin/grants',{body:{email:TARGET,label:'Fixture recipient',days:30},admin:true});assert.equal(response.status,201);return response.json();}
 async function login(grant){const response=await request('/api/login',{body:{shareId:grant.grant.id,passcode:grant.passcode}});assert.equal(response.status,200);return response.headers.get('Set-Cookie').split(';')[0];}
 function addMail(id,email=TARGET,{type=0,isDel=0,subject='验证码 482913',text='您的验证码是 482913。',content=null}={}){mail.prepare('INSERT INTO email(email_id,to_email,type,is_del,send_email,name,create_time,subject,text,content) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,email,type,isDel,'login@example.test','Example Login','2026-10-08 02:01:00',subject,text,content);}
 return {mail,shares,env,request,create,login,addMail,tick:ms=>{now+=ms;},now:()=>now};
}

test('admin authorization is required before creating or listing grants',async()=>{
 const f=fixture();assert.equal((await f.request('/api/admin/grants')).status,401);
 assert.equal((await f.request('/api/admin/grants',{body:{email:TARGET}})).status,401);
 assert.equal(f.env.MAIL_DB.calls.length,0);assert.equal(f.env.SHARE_DB.calls.length,0);
});
test('a grant captures the existing mail boundary and stores only a passcode hash',async()=>{
 const f=fixture();const grant=await f.create();
 assert.equal(grant.grant.email,TARGET);assert.equal(grant.grant.cutoffId,1);
 assert.ok(/^[a-f0-9]{24}$/.test(grant.passcode));assert.ok(/^[a-f0-9]{32}$/.test(grant.grant.id));
 assert.ok(grant.shareUrl.startsWith(ORIGIN+'/s/'));assert.ok(!('passcode_hash' in grant.grant));
 const row=f.shares.prepare('SELECT * FROM share_grants').get();assert.notEqual(row.passcode_hash,grant.passcode);
 assert.ok(!JSON.stringify(row).includes(grant.passcode));
 const listed=await (await f.request('/api/admin/grants',{admin:true})).json();
 assert.ok(!JSON.stringify(listed).includes(row.passcode_hash));assert.ok(!JSON.stringify(listed).includes(grant.passcode));
});
test('login uses secure HttpOnly cookies and wrong or unknown credentials fail identically',async()=>{
 const f=fixture();const grant=await f.create();
 const good=await f.request('/api/login',{body:{shareId:grant.grant.id,passcode:grant.passcode}});
 assert.equal(good.status,200);assert.match(good.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const wrong=await f.request('/api/login',{body:{shareId:grant.grant.id,passcode:'wrong'}});
 const unknown=await f.request('/api/login',{body:{shareId:'a'.repeat(32),passcode:'wrong'}});
 assert.equal(wrong.status,401);assert.equal(unknown.status,401);assert.deepEqual(await wrong.json(),await unknown.json());
});
test('only new, received and non-deleted mail for the authorized address can be read',async()=>{
 const f=fixture();const grant=await f.create();const cookie=await f.login(grant);
 f.addMail(2,'private@example.test');f.addMail(3,TARGET,{type:1});f.addMail(4,TARGET,{isDel:1});f.addMail(5,TARGET);
 const response=await f.request('/api/codes',{cookie});assert.equal(response.status,200);
 const value=await response.json();assert.deepEqual(value.messages.map(x=>x.id),[5]);assert.deepEqual(value.messages[0].codes,['482913']);
 for(const name of ['body','text','content','subject','passcode_hash'])assert.ok(!(name in value.messages[0]));
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.ok(f.env.MAIL_DB.calls.every(x=>/^\s*SELECT/i.test(x.sql)));
});
test('client mailbox parameters, forged cookies and cross-origin login are rejected',async()=>{
 const f=fixture();const grant=await f.create();const cookie=await f.login(grant);
 assert.equal((await f.request('/api/codes?email=private@example.test',{cookie})).status,400);
 assert.equal((await f.request('/api/codes',{cookie:cookie.slice(0,-1)+'x'})).status,401);
 assert.equal((await f.request('/api/login',{body:{shareId:grant.grant.id,passcode:grant.passcode,email:'private@example.test'}})).status,400);
 assert.equal((await f.request('/api/login',{body:{shareId:grant.grant.id,passcode:grant.passcode},origin:'https://evil.example'})).status,403);
});
test('revocation and expiry reject already issued sessions',async()=>{
 const f=fixture();const grant=await f.create();const cookie=await f.login(grant);
 assert.equal((await f.request(`/api/admin/grants/${grant.grant.id}/revoke`,{body:{},admin:true})).status,200);
 assert.equal((await f.request('/api/codes',{cookie})).status,403);
 const next=await f.create();const second=await f.login(next);f.tick(901000);
 assert.equal((await f.request('/api/session',{cookie:second})).status,401);
 f.shares.prepare('UPDATE share_grants SET expires_at=? WHERE id=?').run(f.now()-1,next.grant.id);
 assert.equal((await f.request('/api/login',{body:{shareId:next.grant.id,passcode:next.passcode}})).status,401);
});
test('query throttling and daily budget prevent repeated production mail reads',async()=>{
 const f=fixture();const grant=await f.create();const cookie=await f.login(grant);
 assert.equal((await f.request('/api/codes',{cookie})).status,200);
 const reads=f.env.MAIL_DB.calls.length;assert.equal((await f.request('/api/codes',{cookie})).status,429);
 assert.equal(f.env.MAIL_DB.calls.length,reads);f.tick(5000);
 assert.equal((await f.request('/api/codes',{cookie})).status,200);
 const day=new Date(f.now()+8*3600000).toISOString().slice(0,10);
 f.shares.prepare('UPDATE share_grants SET next_poll_at=0,query_day=?,daily_queries=?').run(day,DAILY_LIMIT);
 assert.equal((await f.request('/api/codes',{cookie})).status,429);
});
test('a new Beijing calendar day resets the daily query budget',async()=>{
 const f=fixture();const grant=await f.create();f.tick(86400000);const cookie=await f.login(grant);
 f.shares.prepare("UPDATE share_grants SET query_day='2026-10-08',daily_queries=500").run();
 assert.equal((await f.request('/api/codes',{cookie})).status,200);
 assert.equal(f.shares.prepare('SELECT daily_queries FROM share_grants').get().daily_queries,1);
});
test('missing rate limiter fails closed and does not read a mailbox',async()=>{
 const f=fixture();delete f.env.AUTH_LIMITER;
 const response=await f.request('/api/login',{body:{shareId:'a'.repeat(32),passcode:'wrong'}});
 assert.equal(response.status,503);assert.equal(f.env.MAIL_DB.calls.length,0);
});
test('oversized, malformed or non-object login JSON is rejected',async()=>{
 const f=fixture();const grant=await f.create();
 const oversized=await f.request('/api/login',{body:{shareId:grant.grant.id,passcode:'x'.repeat(5000)}});assert.equal(oversized.status,413);
 const response=await f.request('/api/login',{body:[]});assert.equal(response.status,400);
});
test('grant creation rejects missing or foreign mailboxes and unreasonable expiry',async()=>{
 const f=fixture();
 for(const [email,days,status] of [['missing@example.test',30,404],['x@foreign.test',30,400],[TARGET,100,400],[TARGET,0,400]]){
  assert.equal((await f.request('/api/admin/grants',{body:{email,days},admin:true})).status,status);
 }
 assert.equal(f.shares.prepare('SELECT COUNT(*) AS n FROM share_grants').get().n,0);
});
test('large HTML mail is bounded before extraction and only five messages are returned',async()=>{
 const f=fixture();const grant=await f.create();const cookie=await f.login(grant);
 for(let i=2;i<10;i++) f.addMail(i,TARGET,{text:null,content:'<b>您的验证码是 482913</b>'+'x'.repeat(200000)});
 const value=await (await f.request('/api/codes',{cookie})).json();assert.equal(value.messages.length,5);
 assert.ok(value.messages.every(x=>x.codes[0]==='482913'));assert.ok(JSON.stringify(value).length<3000);
});
test('session signatures are tamper-resistant and expiry is enforced',async()=>{
 const now=Date.now();const secret=randomHex(32);const grant={id:randomHex(16),expires_at:now+600000};
 const signed=await signSession(grant,secret,now);assert.equal((await verifySession(signed.token,secret,now)).gid,grant.id);
 assert.equal(await verifySession(signed.token+'x',secret,now),null);
 assert.equal(await verifySession(signed.token,randomHex(32),now),null);
 assert.equal(await verifySession(signed.token,secret,now+601000),null);assert.equal((await hash('a')).length,64);
});
