/**
 * Builds the notes Chrome extension into extension/dist.
 *
 *   npm run ext:build          one build; load extension/dist unpacked to try it
 *   npm run ext:watch          rebuild on change (then hit reload on the extension)
 *   npm run ext:zip            build, then package for the Chrome Web Store into
 *                              extension/release/ (zip + 440x280 promo tile)
 *
 * The side panel bundles the same NoteEditor and notes.css the site uses for /noteorg.
 */
import { build, context, type BuildOptions } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..');
const EXT = join(ROOT, 'extension');
const OUT = join(EXT, 'dist');
const RELEASE = join(EXT, 'release');
const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');

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

// ---------------------------------------------------------------- images
// app/icon.svg's mark (orange tile, three headline bars), rasterized here so the repo
// carries no binary assets: Chrome wants PNG for icons, and the store a PNG promo tile.

type RRect = { x: number; y: number; w: number; h: number; r: number };
type RGBA = [number, number, number, number];

const ORANGE: RGBA = [0xff, 0x67, 0x19, 1];
const TILE: RRect = { x: 0, y: 0, w: 32, h: 32, r: 7.5 };
/** In the icon's 32-unit space, with the white's opacity. */
const BARS: (RRect & { a: number })[] = [
  { x: 7, y: 9, w: 18, h: 2.8, r: 1.4, a: 1 },
  { x: 7, y: 14.6, w: 12, h: 2.8, r: 1.4, a: 0.92 },
  { x: 7, y: 20.2, w: 15, h: 2.8, r: 1.4, a: 0.84 },
];

function inside(px: number, py: number, b: RRect): boolean {
  if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return false;
  const cx = Math.min(Math.max(px, b.x + b.r), b.x + b.w - b.r);
  const cy = Math.min(Math.max(py, b.y + b.r), b.y + b.h - b.r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= b.r ** 2;
}

/** Orange with the bars over it; `u`,`v` in the 32-unit mark space. */
function mark(u: number, v: number): RGBA {
  const bar = BARS.find((b) => inside(u, v, b));
  if (!bar) return ORANGE;
  const w = bar.a;
  return [0xff * (1 - w) + 255 * w, 0x67 * (1 - w) + 255 * w, 0x19 * (1 - w) + 255 * w, 1];
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

/** An RGBA PNG from a per-point colour function, 4x4 supersampled for clean edges. */
function png(width: number, height: number, sample: (x: number, y: number) => RGBA | null): Buffer {
  const SS = 4;
  const row = width * 4 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          if (!c) continue;
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = y * row + 1 + x * 4;
      if (a > 0) {
        raw[o] = Math.round(r / a);
        raw[o + 1] = Math.round(g / a);
        raw[o + 2] = Math.round(b / a);
      }
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The toolbar/store icon: the rounded tile, transparent outside it. */
function icon(size: number): Buffer {
  return png(size, size, (x, y) => {
    const u = (x / size) * 32, v = (y / size) * 32;
    return inside(u, v, TILE) ? mark(u, v) : null;
  });
}

/** The store's small promo tile: an orange field with the mark's bars, large. */
function promoTile(): Buffer {
  const W = 440, H = 280, scale = 9;
  // The bars span x 7..25 and y 9..23 in mark space; centre that block.
  const ox = W / 2 - 16 * scale, oy = H / 2 - 16 * scale;
  return png(W, H, (x, y) => mark((x - ox) / scale, (y - oy) / scale));
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

/** Store upload: a zip of dist with manifest.json at its root, plus the promo tile. */
async function packageRelease(): Promise<void> {
  const { version } = JSON.parse(await readFile(join(EXT, 'manifest.json'), 'utf8')) as { version: string };
  await mkdir(RELEASE, { recursive: true });
  const zipPath = join(RELEASE, `news-notes-${version}.zip`);
  await rm(zipPath, { force: true });
  execFileSync('zip', ['-qrX', zipPath, '.', '-x', '.*'], { cwd: OUT });
  await writeFile(join(RELEASE, 'promo-440x280.png'), promoTile());
  await writeFile(join(RELEASE, 'icon-128.png'), icon(128));
  console.log(`ext: packaged ${zipPath}`);
  console.log(`     store images in ${RELEASE}`);
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await copyStatic();
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log(`ext: watching; load ${OUT} unpacked, then reload the extension after changes`);
    return;
  }
  await build(options);
  console.log(`ext: built ${OUT}`);
  if (zip) await packageRelease();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
