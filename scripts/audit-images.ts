/** How many feeds actually carry a usable image per item? Decides whether image-led
 *  layouts are viable or whether half the grid would be empty placeholders. */
import { createRequire } from 'node:module';
import pLimit from 'p-limit';
import { ENABLED_FEEDS } from '../config/feeds/index';
import { fetchFeed } from '../src/ingest/fetch';

const require = createRequire(import.meta.url);
const { parseFeed } = require('@rowanmanning/feed-parser') as { parseFeed: (x: string) => any };

const limit = pLimit(8);
type Row = { id: string; items: number; withImage: number; sources: Set<string> };

function findImage(raw: any): string | null {
  if (raw.image?.url) return raw.image.url;
  for (const m of raw.media ?? []) {
    if (m.image) return m.image;
    if (m.url && /^image\//.test(m.mimeType ?? '')) return m.url;
  }
  const html = `${raw.content ?? ''}${raw.description ?? ''}`;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}

function whereFrom(raw: any): string {
  if (raw.image?.url) return 'image';
  if ((raw.media ?? []).some((m: any) => m.image || /^image\//.test(m.mimeType ?? ''))) return 'media';
  return 'html';
}

const rows = await Promise.all(ENABLED_FEEDS.filter(f => f.kind !== 'hn').map(f => limit(async (): Promise<Row | null> => {
  const r = await fetchFeed(f.url);
  if (r.status !== 'ok') return null;
  try {
    const parsed = parseFeed(r.body);
    const items = parsed.items.slice(0, 12);
    const row: Row = { id: f.id, items: items.length, withImage: 0, sources: new Set() };
    for (const raw of items) {
      if (findImage(raw)) { row.withImage += 1; row.sources.add(whereFrom(raw)); }
    }
    return row;
  } catch { return null; }
})));

const ok = rows.filter((r): r is Row => r !== null && r.items > 0);
const full = ok.filter(r => r.withImage === r.items);
const some = ok.filter(r => r.withImage > 0 && r.withImage < r.items);
const none = ok.filter(r => r.withImage === 0);
const totalItems = ok.reduce((a, r) => a + r.items, 0);
const totalImg = ok.reduce((a, r) => a + r.withImage, 0);

console.log(`\nfeeds sampled: ${ok.length}   items: ${totalItems}   with an image: ${totalImg} (${Math.round(totalImg/totalItems*100)}%)\n`);
console.log(`every item has one : ${full.length} feeds`);
console.log(`some items have one: ${some.length} feeds`);
console.log(`none at all        : ${none.length} feeds\n`);
console.log('NO IMAGES:', none.map(r => r.id).join(', '), '\n');
console.log('PARTIAL  :', some.map(r => `${r.id}(${r.withImage}/${r.items})`).join(', '), '\n');
