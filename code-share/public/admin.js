const $=value=>document.querySelector(value); let adminKey='',credentials='';
function notice(message='',success=false){$('#notice').textContent=message;$('#notice').hidden=!message;$('#notice').classList.toggle('success',success);}
function logout(){adminKey='';credentials='';$('#credentials').textContent='';$('#created').hidden=true;$('#admin-content').hidden=true;$('#admin-login').hidden=false;$('#grants').replaceChildren();}
async function api(path,body){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${adminKey}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),credentials:'omit',cache:'no-store',redirect:'error'});
 const value=await response.json(); if(!response.ok){if(response.status===401)logout();throw new Error(value.error||'操作失败，请重试。');}return value;
}
async function reload(){const value=await api('/api/admin/grants');const list=$('#grants');list.replaceChildren();
 for(const grant of value.grants){const row=document.createElement('article');row.className='grant';const top=document.createElement('div');top.className='grant-top';const email=document.createElement('p');email.textContent=grant.email;top.append(email);
 const inactive=grant.revoked||grant.expiresAt<=Date.now();const action=document.createElement('button');action.type='button';action.className='text-button danger';action.textContent=inactive?'已失效':'撤销授权';action.disabled=inactive;
 action.addEventListener('click',async()=>{if(!confirm(`撤销 ${grant.label||grant.email} 的取码权限？`))return;try{await api(`/api/admin/grants/${grant.id}/revoke`,{});await reload();notice('已撤销，对方将无法继续取码。',true);}catch(error){notice(error.message);}});top.append(action);
 const note=document.createElement('p');note.className='hint';const date=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium'}).format(grant.expiresAt);note.textContent=`${grant.label||'未填写备注'} · 有效期至 ${date} 北京时间`;
 const link=document.createElement('p');link.className='hint';link.textContent=`${location.origin}/s/${grant.id}`;row.append(top,note,link);list.append(row);}
 if(!value.grants.length){const hint=document.createElement('p');hint.className='hint';hint.textContent='还没有分享入口，先创建一份授权。';list.append(hint);}
}
$('#admin-login-form').addEventListener('submit',async event=>{event.preventDefault();adminKey=$('#admin-key').value;$('#admin-key').value='';try{await reload();$('#admin-content').hidden=false;$('#admin-login').hidden=true;notice();}catch(error){adminKey='';notice(error.message);}});
$('#create-form').addEventListener('submit',async event=>{event.preventDefault();$('#create-button').disabled=true;try{const value=await api('/api/admin/grants',{email:$('#email').value.trim(),label:$('#label').value.trim(),days:Number($('#days').value)});credentials=`邮箱：${value.grant.email}\n取码链接：${value.shareUrl}\n访问口令：${value.passcode}\n有效期：${new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'medium'}).format(value.grant.expiresAt)}（北京时间）`;$('#credentials').textContent=credentials;$('#created').hidden=false;await reload();notice('分享入口已创建。',true);}catch(error){notice(error.message);}finally{$('#create-button').disabled=false;}});
$('#copy-share').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(credentials);notice('链接和口令已复制。',true);}catch{notice('复制失败，请手动选择文字复制。');}});
$('#reload-grants').addEventListener('click',()=>reload().catch(error=>notice(error.message)));
$('#admin-logout').addEventListener('click',()=>{logout();notice();});
