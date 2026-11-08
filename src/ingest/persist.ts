import type { PoolClient } from 'pg';
import type { Feed } from '../../config/feeds/index';
import { guidKey, urlKeyOf } from './keys';
import { scoreItem } from './score';
import type { NormalizedItem } from './types';

export type PersistResult = {
  inserted: number;
  merged: number;
  dropped: number;
  newestPublished: Date | null;
  droppedSamples: { title: string; why: string }[];
};

type Prepared = {
  item: NormalizedItem;
  guidHash: Buffer;
  urlHash: Buffer;
  baseScore: number;
  scoreDebug: string;
  scoreVersion: number;
};

/**
 * Persist one feed's items in a handful of SET-BASED statements inside one transaction.
 *
 * This is deliberately batched rather than per-item. Per-item queries against a Neon
 * endpoint in another region cost a round trip each; with 8 feeds in flight that both
 * exhausted the connection pool and pushed a full run past five minutes. Five statements
 * per feed keeps a whole run near the dry-run's ~20s.
 *
 * One transaction per FEED, not per run: a single malformed item cannot roll back the
 * other eighty-eight feeds.
 */
export async function persistItems(
  client: PoolClient,
  feed: Feed,
  items: NormalizedItem[],
  opts: { dropDryRun: boolean },
): Promise<PersistResult> {
  const result: PersistResult = {
    inserted: 0, merged: 0, dropped: 0, newestPublished: null, droppedSamples: [],
  };

  // --- score, drop, and de-duplicate within the batch itself ---
  const prepared: Prepared[] = [];
  const seenUrlKey = new Set<string>();

  for (const item of items) {
    if (!result.newestPublished || item.publishedAt > result.newestPublished) {
      result.newestPublished = item.publishedAt;
    }

    const scored = scoreItem({
      title: item.title,
      summary: item.summary,
      topic: item.topic,
      sourceId: item.sourceId,
      hnPoints: item.hnPoints ?? null,
      minScore: feed.minScore,
    });

    if (scored.hardDrop) {
      result.dropped += 1;
      if (result.droppedSamples.length < 8) {
        result.droppedSamples.push({ title: item.title, why: scored.dropReason ?? 'drop' });
      }
      // DROP_DRY_RUN keeps the item and only logs: a dropped item leaves no trace, so this
      // is how you read a week of "would have dropped" before trusting the rules.
      if (!opts.dropDryRun) continue;
    }

    // A feed listing the same article twice would otherwise break the key mapping below.
    if (seenUrlKey.has(item.urlKey)) continue;
    seenUrlKey.add(item.urlKey);

    prepared.push({
      item,
      guidHash: guidKey(item.sourceId, item.guid ?? item.url).hash,
      urlHash: urlKeyOf(item.url).key.hash,
      baseScore: scored.baseScore,
      scoreDebug: JSON.stringify(scored.debug),
      scoreVersion: scored.debug.v,
    });
  }

  if (prepared.length === 0) return result;

  await client.query('begin');
  try {
    // --- 1) which of these does any key already know? ---
    // Includes tombstones (item_id IS NULL) left by the 30-day prune, which is what stops
    // a re-syndicated article coming back as "new".
    const known = await client.query<{ key_hash: Buffer; item_id: string | null; disposition: string }>(
      `select key_hash, item_id, disposition
         from item_keys
        where (key_type = 'guid' and key_hash = any($1::bytea[]))
           or (key_type = 'url'  and key_hash = any($2::bytea[]))`,
      [prepared.map((p) => p.guidHash), prepared.map((p) => p.urlHash)],
    );

    const byHash = new Map<string, { itemId: string | null; disposition: string }>();
    for (const row of known.rows) {
      byHash.set(row.key_hash.toString('hex'), { itemId: row.item_id, disposition: row.disposition });
    }
    const lookup = (p: Prepared) =>
      byHash.get(p.guidHash.toString('hex')) ?? byHash.get(p.urlHash.toString('hex'));

    const fresh = prepared.filter((p) => !lookup(p));
    const existing = prepared.filter((p) => lookup(p));
    result.merged = existing.length;

    // --- 2) touch last_seen_at on every key we just saw ---
    if (existing.length > 0) {
      await client.query(
        `update item_keys set last_seen_at = now()
          where (key_type, key_hash) in (
            select 'guid', h from unnest($1::bytea[]) as g(h)
            union all
            select 'url',  h from unnest($2::bytea[]) as u(h)
          )`,
        [existing.map((p) => p.guidHash), existing.map((p) => p.urlHash)],
      );
    }

    // --- 3) enrich known articles with their Hacker News discussion ---
    // An HN story pointing at a post we already have attaches the discussion link to THAT
    // row rather than inserting a second copy.
    const enrich = existing
      .map((p) => ({ p, hit: lookup(p)! }))
      .filter((x) => x.hit.itemId && x.p.item.hnUrl);
    if (enrich.length > 0) {
      await client.query(
        `update items i set
           hn_url = coalesce(t.hn_url, i.hn_url),
           hn_points = greatest(coalesce(i.hn_points, 0), coalesce(t.hn_points, 0)),
           base_score = i.base_score + case when i.hn_url is null then t.bonus else 0 end
         from unnest($1::bigint[], $2::text[], $3::int[], $4::real[])
              as t(id, hn_url, hn_points, bonus)
        where i.id = t.id`,
        [
          enrich.map((x) => x.hit.itemId),
          enrich.map((x) => x.p.item.hnUrl ?? null),
          enrich.map((x) => x.p.item.hnPoints ?? null),
          enrich.map((x) => hnBonus(x.p.item.hnPoints)),
        ],
      );
    }

    // Backfill images onto rows that were stored before this column existed, and onto any
    // item whose feed only added one later. Only ever fills a NULL, never overwrites.
    const withImage = existing
      .map((p) => ({ p, hit: lookup(p)! }))
      .filter((x) => x.hit.itemId && x.p.item.imageUrl);
    if (withImage.length > 0) {
      await client.query(
        `update items i set image_url = t.image_url
           from unnest($1::bigint[], $2::text[]) as t(id, image_url)
          where i.id = t.id and i.image_url is null`,
        [withImage.map((x) => x.hit.itemId), withImage.map((x) => x.p.item.imageUrl)],
      );
    }

    if (fresh.length === 0) {
      await client.query('commit');
      return result;
    }

    // --- 4) insert the genuinely new articles, one statement ---
    const inserted = await client.query<{ id: string; url_key: string }>(
      `insert into items (
         source_id, source_name, topic, url, url_key, title, summary, author,
         published_at, published_estimated, base_score, score_version, score_debug,
         hn_url, hn_points, read_at, image_url
       )
       select source_id, source_name, topic, url, url_key, title, summary, author,
              published_at, published_estimated, base_score, score_version,
              score_debug::jsonb, hn_url, hn_points, read_at, image_url
         from unnest(
           $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
           $7::text[], $8::text[], $9::timestamptz[], $10::boolean[], $11::real[],
           $12::smallint[], $13::text[], $14::text[], $15::int[], $16::timestamptz[],
           $17::text[]
         ) as t(source_id, source_name, topic, url, url_key, title, summary, author,
                published_at, published_estimated, base_score, score_version, score_debug,
                hn_url, hn_points, read_at, image_url)
        on conflict (url_key) do nothing
        returning id, url_key`,
      [
        fresh.map((p) => p.item.sourceId),
        fresh.map((p) => p.item.sourceName),
        fresh.map((p) => p.item.topic),
        fresh.map((p) => p.item.url),
        fresh.map((p) => p.item.urlKey),
        fresh.map((p) => p.item.title),
        fresh.map((p) => p.item.summary),
        fresh.map((p) => p.item.author),
        fresh.map((p) => p.item.publishedAt),
        fresh.map((p) => p.item.publishedEstimated),
        fresh.map((p) => p.baseScore),
        fresh.map((p) => p.scoreVersion),
        fresh.map((p) => p.scoreDebug),
        fresh.map((p) => p.item.hnUrl ?? null),
        fresh.map((p) => p.item.hnPoints ?? null),
        // A tombstone that remembers you already read this keeps it out of the unread lane.
        fresh.map((p) => (carriesRead(lookup(p)?.disposition) ? new Date() : null)),
        fresh.map((p) => p.item.imageUrl),
      ],
    );

    const idByUrlKey = new Map(inserted.rows.map((r) => [r.url_key, r.id]));
    result.inserted = inserted.rows.length;
    // url_key's unique constraint caught the rest: a live row already existed.
    result.merged += fresh.length - inserted.rows.length;

    // --- 5) register both dedupe keys for each new article, one statement ---
    const keyTypes: string[] = [];
    const keyHashes: Buffer[] = [];
    const keyItemIds: string[] = [];
    const seenKey = new Set<string>();

    for (const p of fresh) {
      const id = idByUrlKey.get(p.item.urlKey);
      if (!id) continue;
      for (const [type, hash] of [['guid', p.guidHash], ['url', p.urlHash]] as const) {
        const dedupe = `${type}:${hash.toString('hex')}`;
        // ON CONFLICT DO UPDATE errors if one statement touches a row twice.
        if (seenKey.has(dedupe)) continue;
        seenKey.add(dedupe);
        keyTypes.push(type);
        keyHashes.push(hash);
        keyItemIds.push(id);
      }
    }

    if (keyTypes.length > 0) {
      await client.query(
        `insert into item_keys (key_type, key_hash, item_id)
         select * from unnest($1::text[], $2::bytea[], $3::bigint[])
            on conflict (key_type, key_hash)
            do update set item_id = excluded.item_id, last_seen_at = now()`,
        [keyTypes, keyHashes, keyItemIds],
      );
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }

  return result;
}

function carriesRead(disposition: string | undefined): boolean {
  return disposition === 'read' || disposition === 'dismissed';
}

function hnBonus(points: number | null | undefined): number {
  if (!points || points <= 0) return 0;
  return Math.min(5, Math.max(0, Math.log2(points / 50)));
}
