import { extractCodeCandidates, plainText } from '../lib/code-extractor.js';
import { validateMailboxAddress } from '../lib/validation.js';
import { randomHex, equalSecret, passcodeHash, signSession, verifySession, readCookie, cookie } from './auth.js';

export const DAILY_LIMIT = 500;
export const POLL_INTERVAL_MS = 5000;
const DAY_MS = 86400000;
const headers = {
  'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
};
class HttpError extends Error {
  constructor(status, message, retryAfter) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
function json(value, status = 200, more = {}) { return Response.json(value, {status,headers:{...headers,...more}}); }
function fail(status, message, retryAfter) { throw new HttpError(status,message,retryAfter); }
function fields(body, allowed) { if (Object.keys(body).some(name => !allowed.includes(name))) fail(400,'请求参数不正确。'); }
async function bodyJson(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415,'请使用 JSON 请求。');
  if (Number(request.headers.get('Content-Length')) > 4096) fail(413,'请求内容过长。');
  const reader = request.body?.getReader(); if (!reader) fail(400,'缺少请求内容。');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 4096) { await reader.cancel(); fail(413,'请求内容过长。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { fail(400,'请求内容不正确。'); }
}
function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') fail(403,'此请求来源未授权。');
}
async function rate(env, name) {
  if (!env.AUTH_LIMITER) fail(503,'服务限流配置未就绪。');
  if (!(await env.AUTH_LIMITER.limit({key:name})).success) fail(429,'请求过于频繁，请稍后再试。',60);
}
function active(grant, now) { return grant && grant.revoked_at === null && grant.expires_at > now; }
function safeGrant(grant) {
  return {id:grant.id,email:grant.email,label:grant.label,createdAt:grant.created_at,expiresAt:grant.expires_at,
    revoked:grant.revoked_at !== null,cutoffId:grant.cutoff_id};
}
async function sessionGrant(request, env, now) {
  const value = await verifySession(readCookie(request),env.SESSION_SECRET,now);
  if (!value) fail(401,'请先输入访问口令。');
  const grant = await env.SHARE_DB.prepare('SELECT * FROM share_grants WHERE id = ?').bind(value.gid).first();
  if (!active(grant,now)) fail(403,'此入口已过期或已被管理员撤销。');
  return grant;
}
async function admin(request, env) {
  await rate(env,`admin:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const supplied = request.headers.get('Authorization') || '';
  if (!env.ADMIN_KEY || env.ADMIN_KEY.length < 32 || !await equalSecret(supplied,`Bearer ${env.ADMIN_KEY}`)) fail(401,'管理口令不正确。');
}
export function makeWorker({now = () => Date.now()} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url); const path = url.pathname;
      if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
      try {
        if (url.search) fail(400,'此接口不接受邮箱或其他查询参数。');
        if (path === '/api/health' && request.method === 'GET') return json({service:'mail-code-share',ok:true});
        if (!env.MAIL_DB || !env.SHARE_DB || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) fail(503,'服务尚未完成配置。');
        if (request.method !== 'GET') sameOrigin(request);
        const timestamp = now();
        if (path === '/api/login' && request.method === 'POST') {
          await rate(env,`login-ip:${request.headers.get('CF-Connecting-IP') || 'local'}`);
          const body = await bodyJson(request); fields(body,['shareId','passcode']);
          if (typeof body.shareId !== 'string' || !/^[a-f0-9]{32}$/.test(body.shareId) ||
              typeof body.passcode !== 'string' || body.passcode.length > 128) fail(401,'链接或访问口令不正确。');
          await rate(env,`login-share:${body.shareId}`);
          const grant = await env.SHARE_DB.prepare('SELECT * FROM share_grants WHERE id = ?').bind(body.shareId).first();
          const candidate = await passcodeHash(body.shareId,body.passcode);
          if (!grant || !await equalSecret(candidate,grant.passcode_hash) || !active(grant,timestamp)) fail(401,'链接或访问口令不正确，或授权已失效。');
          const signed = await signSession(grant,env.SESSION_SECRET,timestamp);
          return json({grant:safeGrant(grant)},200,{'Set-Cookie':cookie(signed.token,signed.seconds)});
        }
        if (path === '/api/logout' && request.method === 'POST') return json({ok:true},200,{'Set-Cookie':cookie('',0)});
        if (path === '/api/session' && request.method === 'GET') return json({grant:safeGrant(await sessionGrant(request,env,timestamp))});
        if (path === '/api/codes' && request.method === 'GET') {
          const grant = await sessionGrant(request,env,timestamp);
          const day = new Date(timestamp + 8 * 3600000).toISOString().slice(0,10);
          const permit = await env.SHARE_DB.prepare(`UPDATE share_grants SET next_poll_at = ?, query_day = ?,
            daily_queries = CASE WHEN query_day = ? THEN daily_queries + 1 ELSE 1 END
            WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND next_poll_at <= ?
            AND (query_day != ? OR daily_queries < ?) RETURNING id`)
            .bind(timestamp + POLL_INTERVAL_MS,day,day,grant.id,timestamp,timestamp,day,DAILY_LIMIT).first();
          if (!permit) fail(429,'查询太快或已达到今日上限，请稍后再试。',5);
          const result = await env.MAIL_DB.prepare(`SELECT email_id, send_email, name, create_time,
            substr(subject,1,500) AS subject, substr(CASE WHEN text IS NOT NULL AND text != '' THEN text ELSE content END,1,12000) AS body
            FROM email WHERE to_email COLLATE NOCASE = ? AND type = 0 AND is_del = 0 AND email_id > ?
            ORDER BY email_id DESC LIMIT 5`).bind(grant.email,grant.cutoff_id).all();
          const messages = result.results.map(row => ({id:row.email_id,
            sender:plainText(row.name || row.send_email).slice(0,100),receivedAt:row.create_time,
            codes:extractCodeCandidates({subject:row.subject,text:row.body}).filter(code => code.confidence === 'high').map(code => code.value),
          }));
          return json({email:grant.email,messages,checkedAt:timestamp,nextPollSeconds:5});
        }
        if (path.startsWith('/api/admin/')) {
          await admin(request,env);
          if (path === '/api/admin/grants' && request.method === 'GET') {
            const result = await env.SHARE_DB.prepare('SELECT * FROM share_grants ORDER BY created_at DESC LIMIT 100').all();
            return json({grants:result.results.map(safeGrant)});
          }
          if (path === '/api/admin/grants' && request.method === 'POST') {
            const body = await bodyJson(request); fields(body,['email','label','days']);
            let email; try { email = validateMailboxAddress(body.email,(env.ALLOWED_DOMAINS || '').split(',').filter(Boolean)); }
            catch { fail(400,'请填写可用域名的完整邮箱地址。'); }
            const days = Number(body.days ?? 30); const label = String(body.label || '').trim();
            if (!Number.isInteger(days) || days < 1 || days > 90 || label.length > 60) fail(400,'有效期须为 1–90 天，备注最多 60 字。');
            const account = await env.MAIL_DB.prepare('SELECT account_id FROM account WHERE email COLLATE NOCASE = ? AND is_del = 0').bind(email).first();
            if (!account) fail(404,'这个邮箱不存在或已停用。');
            const latest = await env.MAIL_DB.prepare('SELECT email_id FROM email WHERE to_email COLLATE NOCASE = ? AND type = 0 ORDER BY email_id DESC LIMIT 1').bind(email).first();
            const id = randomHex(16); const passcode = randomHex(12);
            const grant = {id,email,label,created_at:timestamp,expires_at:timestamp + days * DAY_MS,cutoff_id:latest?.email_id || 0,revoked_at:null};
            await env.SHARE_DB.prepare(`INSERT INTO share_grants (id,email,label,passcode_hash,created_at,expires_at,cutoff_id)
              VALUES (?,?,?,?,?,?,?)`).bind(id,email,label,await passcodeHash(id,passcode),timestamp,grant.expires_at,grant.cutoff_id).run();
            return json({grant:safeGrant(grant),passcode,shareUrl:`${url.origin}/s/${id}`},201);
          }
          const match = path.match(/^\/api\/admin\/grants\/([a-f0-9]{32})\/revoke$/);
          if (match && request.method === 'POST') {
            await env.SHARE_DB.prepare('UPDATE share_grants SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(timestamp,match[1]).run();
            return json({ok:true});
          }
        }
        fail(404,'没有这个接口。');
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        return json({error:status === 500 ? '服务暂时不可用，请稍后再试。' : error.message},status,
          error.retryAfter ? {'Retry-After':String(error.retryAfter)} : {});
      }
    },
  };
}
export default makeWorker();
