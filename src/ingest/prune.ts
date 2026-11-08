import type { PoolClient } from 'pg';
import { RETENTION } from '../../config/retention';

export type PruneResult = { prunedItems: number; prunedKeys: number; overflow: number };

/**
 * The 30-day TTL. Runs as the last step of EVERY ingest run, in the same process -- no
 * extension and no second scheduler, and guaranteed to execute because the job is
 * connected at that moment. Twice-daily runs mean nothing ever exceeds 30 days + ~12h.
 *
 * pg_cron is available on Neon but is deliberately NOT used: the free-tier compute
 * auto-suspends when idle and pg_cron only fires while it is awake, so articles could
 * outlive the TTL unpredictably.
 */
export async function prune(client: PoolClient): Promise<PruneResult> {
  // 1) The TTL itself. Saved and pinned items are exempt forever -- this predicate is the
  //    entire mechanism by which "the ones I want to read" survive.
  //    item_keys.item_id is SET NULL by the FK, leaving a hash-only tombstone behind.
  const items = await client.query(
    `delete from items
      where saved_at is null
        and pinned = false
        and greatest(published_at, first_seen_at) < now() - ($1::int * interval '1 day')`,
    [RETENTION.itemTtlDays],
  );

  // 2) Dedupe memory expires later than the articles, because HN submits things weeks late.
  //    These rows are bare sha256 hashes: no title, no URL, no text.
  const keys = await client.query(
    `delete from item_keys
      where item_id is null
        and last_seen_at < now() - ($1::int * interval '1 day')`,
    [RETENTION.keyTombstoneDays],
  );

  // 3) Safety valve: a feed that suddenly emits 10k items cannot balloon the DB before the
  //    next scheduled prune.
  const overflow = await client.query(
    `delete from items
      where id in (
        select id from items
         where saved_at is null and pinned = false
         order by published_at desc
         offset $1
      )`,
    [RETENTION.maxUnsavedItems],
  );

  return {
    prunedItems: items.rowCount ?? 0,
    prunedKeys: keys.rowCount ?? 0,
    overflow: overflow.rowCount ?? 0,
  };
}
