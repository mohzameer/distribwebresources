/**
 * One-off: re-derive url_key for rows stored before the TRACKING_PARAM fix in
 * src/ingest/normalize.ts, when `utm_*` / `mc_*` / `at_*` params were never stripped.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-url-keys.ts            -- report only
 *   npx tsx --env-file-if-exists=.env.local scripts/backfill-url-keys.ts --apply    -- write
 *
 * Per stale item, in ONE transaction:
 *   - items.url_key  <- canonicalUrl(url)
 *   - item_keys      <- add the new ('url', sha256) key for that item, or claim a tombstone
 *                       already holding it (keeping its disposition). The old hash is left
 *                       alone: it still points at the item and dies with it on prune.
 *   - note_pages.url_key <- canonicalUrl(url_key)
 *
 * Anything that would collide (the new key already belongs to a different live item or
 * page) is reported and skipped, never merged: that is a real duplicate and needs a human.
 * Safe to re-run; a second run finds nothing to do.
 */
import { getPool, closePool } from '../src/db/pool';
import { canonicalUrl } from '../src/ingest/normalize';
import { urlKeyOf } from '../src/ingest/keys';

type ItemRow = { id: string; url: string; url_key: string };
type PageRow = { id: string; url_key: string };

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const client = await getPool().connect();
  try {
    await client.query(apply ? 'begin' : 'begin transaction read only');

    // --- items ---
    const items = (await client.query<ItemRow>('select id, url, url_key from items')).rows;
    const ownerOfKey = new Map(items.map((r) => [r.url_key, r.id]));
    const plan: { id: string; from: string; to: string; hash: Buffer }[] = [];
    const skipped: string[] = [];
    const claimed = new Set<string>();

    for (const r of items) {
      const { canonical, key } = urlKeyOf(r.url);
      if (canonical === r.url_key) continue;
      const owner = ownerOfKey.get(canonical);
      if ((owner && owner !== r.id) || claimed.has(canonical)) {
        skipped.push(`item ${r.id}: ${canonical} already used by item ${owner ?? '(another stale row)'}`);
        continue;
      }
      claimed.add(canonical);
      plan.push({ id: r.id, from: r.url_key, to: canonical, hash: key.hash });
    }

    // A new url hash already registered to a DIFFERENT live item means the duplicate was
    // inserted already; don't touch it. A tombstone (item_id null) is fine to claim.
    if (plan.length > 0) {
      const taken = await client.query<{ key_hash: Buffer; item_id: string }>(
        `select key_hash, item_id from item_keys
          where key_type = 'url' and item_id is not null and key_hash = any($1::bytea[])`,
        [plan.map((p) => p.hash)],
      );
      const takenBy = new Map(taken.rows.map((t) => [t.key_hash.toString('hex'), t.item_id]));
      for (let i = plan.length - 1; i >= 0; i--) {
        const other = takenBy.get(plan[i]!.hash.toString('hex'));
        if (other && other !== plan[i]!.id) {
          skipped.push(`item ${plan[i]!.id}: url hash of ${plan[i]!.to} already keys item ${other}`);
          plan.splice(i, 1);
        }
      }
    }

    // --- note_pages (absent on a database that predates migration 003) ---
    const hasPages = (await client.query(`select to_regclass('note_pages') as t`)).rows[0].t;
    const pages = hasPages
      ? (await client.query<PageRow>('select id, url_key from note_pages')).rows
      : [];
    const pageOwner = new Map(pages.map((p) => [p.url_key, p.id]));
    const pagePlan: { id: string; from: string; to: string }[] = [];
    for (const p of pages) {
      const to = canonicalUrl(p.url_key);
      if (to === p.url_key) continue;
      const owner = pageOwner.get(to);
      if (owner && owner !== p.id) {
        skipped.push(`note_page ${p.id}: ${to} already used by note_page ${owner}`);
        continue;
      }
      pagePlan.push({ id: p.id, from: p.url_key, to });
    }

    for (const p of plan.slice(0, 15)) console.log(`item ${p.id}\n  ${p.from}\n  -> ${p.to}`);
    if (plan.length > 15) console.log(`... and ${plan.length - 15} more items`);
    for (const p of pagePlan) console.log(`note_page ${p.id}\n  ${p.from}\n  -> ${p.to}`);
    for (const s of skipped) console.log(`SKIP ${s}`);
    console.log(
      `\n${items.length} items, ${plan.length} to rewrite; ${pages.length} note pages, ` +
        `${pagePlan.length} to rewrite; ${skipped.length} skipped`,
    );

    if (!apply) {
      await client.query('rollback');
      console.log('Report only. Re-run with --apply to write.');
      return;
    }

    if (plan.length > 0) {
      await client.query(
        `update items i set url_key = t.url_key
           from unnest($1::bigint[], $2::text[]) as t(id, url_key)
          where i.id = t.id`,
        [plan.map((p) => p.id), plan.map((p) => p.to)],
      );
      await client.query(
        `insert into item_keys (key_type, key_hash, item_id)
         select 'url', h, id from unnest($1::bytea[], $2::bigint[]) as t(h, id)
             on conflict (key_type, key_hash) do update
                set item_id = excluded.item_id, last_seen_at = now()
              where item_keys.item_id is null`,
        [plan.map((p) => p.hash), plan.map((p) => p.id)],
      );
    }
    if (pagePlan.length > 0) {
      await client.query(
        `update note_pages n set url_key = t.url_key
           from unnest($1::bigint[], $2::text[]) as t(id, url_key)
          where n.id = t.id`,
        [pagePlan.map((p) => p.id), pagePlan.map((p) => p.to)],
      );
    }
    await client.query('commit');
    console.log('Applied.');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
