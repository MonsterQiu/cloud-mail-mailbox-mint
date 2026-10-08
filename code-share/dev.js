import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {makeWorker} from './worker.js';
import {passcodeHash} from './auth.js';

const mail=new DatabaseSync(':memory:');const shares=new DatabaseSync(':memory:');
mail.exec(`CREATE TABLE account(account_id INTEGER PRIMARY KEY,email TEXT,is_del INTEGER DEFAULT 0);
CREATE TABLE email(email_id INTEGER PRIMARY KEY,to_email TEXT,type INTEGER DEFAULT 0,is_del INTEGER DEFAULT 0,send_email TEXT,name TEXT,create_time TEXT,subject TEXT,text TEXT,content TEXT);
INSERT INTO account VALUES(1,'shared@example.test',0);`);
shares.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
const id='a'.repeat(32);const now=Date.now();
shares.prepare('INSERT INTO share_grants(id,email,label,passcode_hash,created_at,expires_at,cutoff_id) VALUES(?,?,?,?,?,?,?)').run(id,'shared@example.test','仅供本地演示',await passcodeHash(id,'demo-access-only'),now,now+86400000,0);
mail.prepare('INSERT INTO email(email_id,to_email,send_email,name,create_time,subject,text) VALUES(1,?,?,?,?,?,?)').run('shared@example.test','login@example.test','Example Login',new Date().toISOString(),'Your verification code: 482913','Your verification code is 482913.');
const d1=db=>({prepare(sql){const statement=db.prepare(sql);return {bind(...params){return {first:async()=>statement.get(...params)||null,all:async()=>({results:statement.all(...params)}),run:async()=>({meta:statement.run(...params)})};},all:async()=>({results:statement.all()})};}});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const env={MAIL_DB:d1(mail),SHARE_DB:d1(shares),ADMIN_KEY:'demo-admin-only-'.repeat(4),SESSION_SECRET:'demo-session-only-'.repeat(4),ALLOWED_DOMAINS:'example.test',AUTH_LIMITER:{limit:async()=>({success:true})},ASSETS:{async fetch(request){
 const path=new URL(request.url).pathname;const file=path==='/admin'?'admin.html':/^\/(app\.js|admin\.js|style\.css|icon\.svg)$/.test(path)?path.slice(1):'index.html';
 const ext=file.slice(file.lastIndexOf('.'));return new Response(readFileSync(new URL('./public/'+file,import.meta.url)),{headers:{'Content-Type':mime[ext]+'; charset=utf-8','Cache-Control':'no-store'}});
}}};
const worker=makeWorker();const server=createServer(async(req,res)=>{
 try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const input=Buffer.concat(chunks);
 const request=new Request('http://127.0.0.1:4174'+req.url,{method:req.method,headers:req.headers,...(input.length?{body:input}: {})});
 const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Preview error');}
});server.listen(4174,'127.0.0.1',()=>console.log('Synthetic-only: http://127.0.0.1:4174/s/'+id+' | demo-access-only | no production data'));
