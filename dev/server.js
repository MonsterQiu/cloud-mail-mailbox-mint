import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const root = new URL('../', import.meta.url);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') { res.writeHead(302, { Location: '/popup/popup.html' }); res.end(); return; }
  const resource = pathname === '/' ? '/popup/popup.html' : pathname;
  if (!/^\/(popup|options|assets|lib|dev)\/[a-zA-Z0-9/_\-.]+$/.test(resource) || resource.includes('..')) { res.writeHead(404); res.end(); return; }
  try {
    let data = await readFile(new URL(resource.slice(1), root));
    if (resource.endsWith('.html')) data = Buffer.from(data.toString().replace(/src="(popup|options)\.js"/, (_, page) => `src="/dev/${page}-entry.js"`));
    res.writeHead(200, { 'Content-Type': `${mime[extname(resource)] || 'text/plain'}; charset=utf-8`, 'Cache-Control':'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Synthetic-only preview: http://127.0.0.1:4173/ — all API calls are mocked.'));
