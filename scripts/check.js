import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
const popupCss = await readFile(new URL('popup/popup.css', root), 'utf8');
// Guard the intrinsic-size regression that was invisible in normal full-width tabs.
assert.match(popupCss, /html\s*\{[^}]*min-width:\s*420px/);
assert.match(popupCss, /body\s*\{[^}]*min-width:\s*420px/);
assert.ok(!/max-width:\s*100vw/.test(popupCss), 'Popup must not clamp to its initial viewport width');
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage', 'clipboardWrite']);
assert.ok(!manifest.content_scripts && !manifest.externally_connectable && !manifest.web_accessible_resources);
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page, ...Object.values(manifest.icons)]) await access(new URL(file, root));
let scripts = 0;
for (const dir of ['background','lib','popup','options','tests','scripts','dev']) {
  for (const file of await readdir(new URL(`${dir}/`, root))) {
    if (!file.endsWith('.js')) continue;
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(`${dir}/${file}`, root))]); scripts++;
  }
}
for (const page of ['popup/popup.html', 'options/options.html']) {
  const source = await readFile(new URL(page, root), 'utf8');
  assert.ok(!/\son\w+=|javascript:|<script(?![^>]*\bsrc=)/i.test(source), `Inline script in ${page}`);
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); assert.equal(ids.length, new Set(ids).size);
  for (const match of source.matchAll(/(?:src|href)="([^"#]+)"/g)) if (!match[1].includes('://')) await access(new URL(match[1], new URL(page, root)));
}
console.log(`Manifest, packaged references, HTML safety and ${scripts} JavaScript syntax checks passed.`);
