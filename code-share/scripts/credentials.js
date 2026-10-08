// Generate and save owner-only access artifacts. Never print server secrets.
import {mkdir,readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const directory=new URL('../private/',import.meta.url);
await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
const secretsPath=new URL('secrets.local.json',directory);
let secrets;
try{secrets=JSON.parse(await readFile(secretsPath,'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;secrets={ADMIN_KEY:randomBytes(32).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex')};await writeFile(secretsPath,JSON.stringify(secrets,null,2)+'\n',{mode:0o600,flag:'wx'});}
if(!/^[a-f0-9]{64}$/.test(secrets.ADMIN_KEY)||!/^[a-f0-9]{64}$/.test(secrets.SESSION_SECRET))throw new Error('Invalid private secrets file');
if(process.argv[2]==='create'){
 const origin=new URL(process.argv[3]).origin;const email=process.argv[4];if(!email)throw new Error('Provide the target mailbox');
 const response=await fetch(origin+'/api/admin/grants',{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${secrets.ADMIN_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email,label:'独立取码授权',days:30}),redirect:'error'});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Grant creation failed');
 const saved={mailbox:result.grant.email,shareUrl:result.shareUrl,passcode:result.passcode,expiresAt:result.grant.expiresAt,grantId:result.grant.id,adminUrl:origin+'/admin'};
 const filename=new URL(`share-${result.grant.id}.local.json`,directory);
 await writeFile(filename,JSON.stringify(saved,null,2)+'\n',{mode:0o600,flag:'wx'});
 const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(saved.expiresAt);
 await writeFile(new URL(`share-${result.grant.id}.txt`,directory),`邮箱：${saved.mailbox}\n取码链接：${saved.shareUrl}\n访问口令：${saved.passcode}\n有效期至：${date} 北京时间\n\n只显示授权后收到的新验证码。\n`,{mode:0o600,flag:'wx'});
 await writeFile(new URL('owner-access.txt',directory),`仅供管理员本人保存，不要发给取码使用者。\n\n管理页面：${saved.adminUrl}\n管理口令：${secrets.ADMIN_KEY}\n\n撤销授权：登录管理页面，找到对应邮箱，点击“撤销授权”。\n`,{mode:0o600});
 console.log(JSON.stringify({shareUrl:saved.shareUrl,expiresAt:saved.expiresAt,grantId:saved.grantId,credentialFile:filename.pathname,ownerFile:new URL('owner-access.txt',directory).pathname}));
}else if(process.argv[2]==='origin'){
 const origin=new URL(process.argv[3]).origin;
 for(const name of (await readdir(directory)).filter(name=>/^share-[a-f0-9]{32}\.local\.json$/.test(name))){
  const filename=new URL(name,directory);const saved=JSON.parse(await readFile(filename,'utf8'));
  saved.shareUrl=origin+'/s/'+saved.grantId;saved.adminUrl=origin+'/admin';
  await writeFile(filename,JSON.stringify(saved,null,2)+'\n',{mode:0o600});
  const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium',timeStyle:'short'}).format(saved.expiresAt);
  await writeFile(new URL(`share-${saved.grantId}.txt`,directory),`邮箱：${saved.mailbox}\n取码链接：${saved.shareUrl}\n访问口令：${saved.passcode}\n有效期至：${date} 北京时间\n\n只显示授权后收到的新验证码。\n`,{mode:0o600});
  await writeFile(new URL('owner-access.txt',directory),`仅供管理员本人保存，不要发给取码使用者。\n\n管理页面：${saved.adminUrl}\n管理口令：${secrets.ADMIN_KEY}\n\n撤销授权：登录管理页面，找到对应邮箱，点击“撤销授权”。\n`,{mode:0o600});
  console.log(JSON.stringify({shareUrl:saved.shareUrl,credentialFile:filename.pathname}));
 }
}else console.log(JSON.stringify({secretsFile:secretsPath.pathname,ready:true}));
