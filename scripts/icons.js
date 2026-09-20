import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// Deterministic, dependency-free rasterization of our own vector envelope mark.
function crc32(buffer) { let crc = -1; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ -1) >>> 0; }
function chunk(type, data) { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, crc]); }
function segment(x, y, ax, ay, bx, by, thickness) { const dx = bx-ax, dy = by-ay; const t = Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy))); return Math.hypot(x-ax-t*dx, y-ay-t*dy) <= thickness/2; }
function pixel(x, y) {
  const rounded = (x,y,l,t,r,b,radius) => Math.hypot(Math.max(l+radius-x,0,x-r+radius), Math.max(t+radius-y,0,y-b+radius)) <= radius;
  if (!rounded(x,y,0,0,128,128,30)) return [0,0,0,0];
  let color = [37,99,235,255];
  if ((rounded(x,y,21.5,32.5,106.5,96.5,10.5) && !rounded(x,y,28.5,39.5,99.5,89.5,3.5)) || segment(x,y,28,40,64,68,7) || segment(x,y,64,68,100,40,7)) color = [255,255,255,255];
  if (Math.hypot(x-100,y-29) <= 17) color = [36,169,132,255];
  if (segment(x,y,92,29,98,35,5) || segment(x,y,98,35,109,23,5)) color = [255,255,255,255];
  return color;
}
export async function generateIcons(directory) {
  await mkdir(directory, { recursive: true });
  for (const size of [16,32,48,128]) {
    const raw = Buffer.alloc(size*(size*4+1));
    for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
      const sums = [0,0,0,0];
      for (let sy=0;sy<4;sy++) for (let sx=0;sx<4;sx++) { const values=pixel((x+(sx+.5)/4)*128/size,(y+(sy+.5)/4)*128/size); for(let c=0;c<4;c++) sums[c]+=values[c]; }
      const start=y*(size*4+1)+1+x*4; for(let c=0;c<4;c++) raw[start+c]=Math.round(sums[c]/16);
    }
    const header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
    await writeFile(new URL(`icon-${size}.png`, directory), png);
  }
}
if (process.argv[1]?.endsWith('/scripts/icons.js')) await generateIcons(new URL('../assets/', import.meta.url));
