import {readdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const scripts=['auth.js','worker.js','dev.js','public/app.js','public/admin.js','scripts/check.js','scripts/credentials.js'];
for(const path of scripts)execFileSync(process.execPath,['--check',new URL(path,root).pathname],{stdio:'inherit'});
const allowed=['index.html','admin.html','app.js','admin.js','style.css','icon.svg','_headers'];
const files=await readdir(new URL('public/',root));
if(files.some(file=>!allowed.includes(file)))throw new Error('Unexpected public asset');
for(const path of ['index.html','admin.html']){
 const html=await readFile(new URL('public/'+path,root),'utf8');
 if(/\son\w+\s*=|<script(?![^>]*\bsrc=)[^>]*>/i.test(html))throw new Error('Inline script is not allowed');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 if(new Set(ids).size!==ids.length)throw new Error('Duplicate HTML id');
}
console.log('Code-share syntax, static asset allowlist and HTML checks passed.');
