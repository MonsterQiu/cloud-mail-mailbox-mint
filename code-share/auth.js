const encoder = new TextEncoder();
export const COOKIE_NAME = '__Host-mailcode';
export const SESSION_SECONDS = 900;

export function randomHex(bytes = 16) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function equalSecret(left, right) {
  const a = await hash(String(left)); const b = await hash(String(right));
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const passcodeHash = (id, passcode) => hash(`mailcode:${id}:${passcode}`);
const encode = value => btoa(String.fromCharCode(...value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const decode = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const key = secret => crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);

export async function signSession(grant, secret, now) {
  const exp = Math.min(Math.floor(now / 1000) + SESSION_SECONDS, Math.floor(grant.expires_at / 1000));
  const payload = encode(encoder.encode(JSON.stringify({gid:grant.id,exp})));
  const signed = `v1.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(signed)));
  return {token:`${signed}.${encode(signature)}`,seconds:Math.max(0,exp - Math.floor(now / 1000))};
}

export async function verifySession(token, secret, now) {
  try {
    if (!token || token.length > 1024) return null;
    const [version,payload,signature,...extra] = token.split('.');
    if (version !== 'v1' || !payload || !signature || extra.length) return null;
    if (!await crypto.subtle.verify('HMAC',await key(secret),decode(signature),encoder.encode(`${version}.${payload}`))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(payload)));
    return /^[a-f0-9]{32}$/.test(value.gid) && Number.isInteger(value.exp) && value.exp > Math.floor(now / 1000) ? value : null;
  } catch { return null; }
}

export function readCookie(request) {
  const values = (request.headers.get('Cookie') || '').split(';').map(value => value.trim());
  return values.find(value => value.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || '';
}
export const cookie = (token, seconds) => `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
