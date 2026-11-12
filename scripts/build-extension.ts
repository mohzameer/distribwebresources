/**
 * Builds the notes Chrome extension into extension/dist, ready for chrome://extensions
 * → Developer mode → Load unpacked. It is never published, so there is no zip step.
 *
 *   npm run ext:build          one build
 *   npm run ext:watch          rebuild on change (then hit reload on the extension)
 *
 * The side panel bundles the same NoteEditor and notes.css the site uses for /noteorg.
 */
import { build, context, type BuildOptions } from 'esbuild';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..');
const EXT = join(ROOT, 'extension');
const OUT = join(EXT, 'dist');
const watch = process.argv.includes('--watch');

const options: BuildOptions = {
  entryPoints: {
    background: join(EXT, 'src/background.ts'),
    sidepanel: join(EXT, 'src/sidepanel.tsx'),
    options: join(EXT, 'src/options.ts'),
  },
  outdir: OUT,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  jsx: 'automatic',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  define: { 'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production') },
  logLevel: 'info',
};

// ---------------------------------------------------------------- icons
// app/icon.svg's mark (orange tile, three headline bars), rasterized here so the repo
// carries no binary assets: Chrome wants PNG for extension icons.

type RRect = { x: number; y: number; w: number; h: number; r: number };
const TILE: RRect = { x: 0, y: 0, w: 32, h: 32, r: 7.5 };
const BARS: (RRect & { a: number })[] = [
  { x: 7, y: 9, w: 18, h: 2.8, r: 1.4, a: 1 },
  { x: 7, y: 14.6, w: 12, h: 2.8, r: 1.4, a: 0.92 },
  { x: 7, y: 20.2, w: 15, h: 2.8, r: 1.4, a: 0.84 },
];

function inside(px: number, py: number, b: RRect): boolean {
  const cx = Math.min(Math.max(px, b.x + b.r), b.x + b.w - b.r);
  const cy = Math.min(Math.max(py, b.y + b.r), b.y + b.h - b.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= b.r ** 2 && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function icon(size: number): Buffer {
  const SS = 4; // 4x4 supersampling for clean edges at 16px
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let a = 0, white = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = ((x + (sx + 0.5) / SS) / size) * 32;
          const py = ((y + (sy + 0.5) / SS) / size) * 32;
          if (!inside(px, py, TILE)) continue;
          a += 1;
          const bar = BARS.find((b) => inside(px, py, b));
          if (bar) white += bar.a;
        }
      }
      const n = SS * SS;
      const w = a ? white / a : 0;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(0xff * (1 - w) + 255 * w);
      raw[o + 1] = Math.round(0x67 * (1 - w) + 255 * w);
      raw[o + 2] = Math.round(0x19 * (1 - w) + 255 * w);
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- static files

async function copyStatic(): Promise<void> {
  await mkdir(join(OUT, 'icons'), { recursive: true });
  for (const f of ['manifest.json', 'sidepanel.html', 'options.html']) {
    await copyFile(join(EXT, f), join(OUT, f));
  }
  for (const size of [16, 32, 48, 128]) {
    await writeFile(join(OUT, 'icons', `${size}.png`), icon(size));
  }
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await copyStatic();
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`ext: watching; load ${OUT} unpacked, then reload the extension after changes`);
  } else {
    await build(options);
    console.log(`ext: built ${OUT}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
