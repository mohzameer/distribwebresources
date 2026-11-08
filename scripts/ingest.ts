/**
 * Fetch every feed, normalize, score, store, prune. Run twice daily by GitHub Actions.
 *
 *   npm run ingest              -- full run
 *   npm run ingest -- --dry-run -- fetch + parse + score, print, touch NO database
 *
 * --dry-run needs no DATABASE_URL at all, which makes it the fast way to confirm that all
 * ~70 feeds still parse.
 */
import pLimit, { type LimitFunction } from 'p-limit';
import type { PoolClient } from 'pg';
import { ENABLED_FEEDS, type Feed } from '../config/feeds/index';
import { RETENTION } from '../config/retention';
import { TOPIC_LABELS } from '../config/scoring';
import { getPool, closePool } from '../src/db/pool';
import { fetchFeed } from '../src/ingest/fetch';
import { parseItems } from '../src/ingest/parse';
import { persistItems } from '../src/ingest/persist';
import { prune } from '../src/ingest/prune';
import { scoreItem } from '../src/ingest/score';
import type { FeedRunResult } from '../src/ingest/types';
import { pendingMigrations } from './migrate';

const DRY_RUN = process.argv.includes('--dry-run');
const DROP_DRY_RUN = process.env.DROP_DRY_RUN === '1';
const GLOBAL_CONCURRENCY = 8;
const PER_HOST_CONCURRENCY = 2;
const RUN_BUDGET_MS = 8 * 60_000;
/** consecutive_failures at which we stop fetching a feed (2 runs/day => ~14 days). */
const AUTO_DISABLE_AFTER = 28;

type HealthRow = {
  source_id: string;
  etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
  auto_disabled_at: Date | null;
};

async function main(): Promise<number> {
  const startedAt = Date.now();
  const budget = AbortSignal.timeout(RUN_BUDGET_MS);

  const hostLimits = new Map<string, LimitFunction>();
  const globalLimit = pLimit(GLOBAL_CONCURRENCY);
  const hostLimit = (url: string): LimitFunction => {
    let host = 'unknown';
    try {
      host = new URL(url).hostname;
    } catch { /* keep 'unknown' */ }
    let limit = hostLimits.get(host);
    if (!limit) {
      limit = pLimit(PER_HOST_CONCURRENCY);
      hostLimits.set(host, limit);
    }
    return limit;
  };

  let health = new Map<string, HealthRow>();
  let runId: string | null = null;

  if (!DRY_RUN) {
    const pending = await pendingMigrations();
    if (pending.length > 0) {
      console.error(`ingest: refusing to run, ${pending.length} pending migration(s): ${pending.join(', ')}`);
      console.error('ingest: run `npm run migrate` first');
      return 1;
    }
    health = await loadHealth();
    await reconcileRemovedFeeds();
    runId = await openRun();
  }

  // Aggregators run in a SECOND pass, after the blog feeds, so that an HN story pointing at
  // a post we already stored merges INTO it (attaching the discussion link) instead of
  // inserting a duplicate. Running them first would keep the HN row and lose the real
  // source attribution.
  const primary = ENABLED_FEEDS.filter((f) => f.topic !== 'community');
  const aggregators = ENABLED_FEEDS.filter((f) => f.topic === 'community');

  const results: FeedRunResult[] = [];
  for (const group of [primary, aggregators]) {
    const settled = await Promise.allSettled(
      group.map((feed) =>
        globalLimit(() => hostLimit(feed.url)(() => runFeed(feed, health.get(feed.id), budget))),
      ),
    );
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        // A bug that escaped runFeed's own try/catch must still not abort its siblings.
        results.push({
          sourceId: group[i]!.id,
          status: 'failed',
          error: s.reason instanceof Error ? s.reason.message : String(s.reason),
          phase: 'persist',
          seen: 0, inserted: 0, merged: 0, dropped: 0,
          durationMs: 0,
        });
      }
    });
  }

  const totals = results.reduce(
    (acc, r) => ({
      seen: acc.seen + r.seen,
      inserted: acc.inserted + r.inserted,
      merged: acc.merged + r.merged,
      dropped: acc.dropped + r.dropped,
    }),
    { seen: 0, inserted: 0, merged: 0, dropped: 0 },
  );
  const failed = results.filter((r) => r.status === 'failed');
  const ok = results.filter((r) => r.status === 'ok' || r.status === 'notmodified');

  let pruned = { prunedItems: 0, prunedKeys: 0, overflow: 0 };
  if (!DRY_RUN) {
    const client = await getPool().connect();
    try {
      pruned = await prune(client);
    } finally {
      client.release();
    }
    await closeRun(runId!, {
      feedsTotal: results.length,
      feedsOk: ok.length,
      feedsFailed: failed.length,
      ...totals,
      prunedItems: pruned.prunedItems,
      prunedKeys: pruned.prunedKeys,
      durationMs: Date.now() - startedAt,
    });
  }

  printSummary(results, totals, pruned, Date.now() - startedAt);

  // Exit policy: a handful of rotted feeds must NOT make the run red, or you learn to
  // ignore red runs. Only a systemic problem is worth failing on.
  const threshold = Math.max(5, Math.floor(results.length * 0.2));
  if (failed.length > threshold) {
    console.error(`\ningest: ${failed.length} feeds failed (threshold ${threshold}) -- looks systemic`);
    return 1;
  }
  return 0;
}

async function runFeed(
  feed: Feed,
  health: HealthRow | undefined,
  budget: AbortSignal,
): Promise<FeedRunResult> {
  const t0 = Date.now();
  const base = { sourceId: feed.id, seen: 0, inserted: 0, merged: 0, dropped: 0 };

  if (health?.auto_disabled_at) {
    return { ...base, status: 'skipped', durationMs: 0, error: 'auto-disabled' };
  }
  // Out of time: mark as skipped, NOT failed, so a slow run never inflates failure counts.
  if (budget.aborted) {
    return { ...base, status: 'skipped', durationMs: 0, error: 'run budget exhausted' };
  }

  // --- fetch ---
  const fetched = await fetchFeed(
    feed.url,
    { etag: health?.etag, lastModified: health?.last_modified },
    budget,
  );

  if (fetched.status === 'failed') {
    if (!DRY_RUN) await recordFailure(feed, fetched.httpStatus, fetched.error);
    return { ...base, status: 'failed', httpStatus: fetched.httpStatus, error: fetched.error, phase: 'fetch', durationMs: Date.now() - t0 };
  }
  if (fetched.status === 'notmodified') {
    if (!DRY_RUN) await recordSuccess(feed, 304, null, null, null, null);
    return { ...base, status: 'notmodified', httpStatus: 304, durationMs: Date.now() - t0 };
  }

  // --- parse ---
  let items;
  try {
    items = parseItems(feed, fetched.body);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (!DRY_RUN) await recordFailure(feed, fetched.httpStatus, `parse: ${error}`);
    return { ...base, status: 'failed', httpStatus: fetched.httpStatus, error, phase: 'parse', durationMs: Date.now() - t0 };
  }

  // --- dry run stops here ---
  if (DRY_RUN) {
    let dropped = 0;
    for (const item of items) {
      const s = scoreItem({ title: item.title, summary: item.summary, topic: item.topic, sourceId: item.sourceId, hnPoints: item.hnPoints ?? null, minScore: feed.minScore });
      if (s.hardDrop) dropped += 1;
    }
    return { ...base, status: 'ok', httpStatus: fetched.httpStatus, seen: items.length, dropped, durationMs: Date.now() - t0 };
  }

  // --- persist ---
  const client: PoolClient = await getPool().connect();
  try {
    const persisted = await persistItems(client, feed, items, { dropDryRun: DROP_DRY_RUN });
    await recordSuccess(
      feed,
      fetched.httpStatus,
      fetched.etag,
      fetched.lastModified,
      fetched.bodyHash,
      persisted.newestPublished,
      persisted.inserted > 0,
    );
    if (DROP_DRY_RUN && persisted.droppedSamples.length > 0) {
      for (const s of persisted.droppedSamples) {
        console.log(`  [would drop: ${s.why}] ${s.title.slice(0, 90)}`);
      }
    }
    return {
      ...base,
      status: 'ok',
      httpStatus: fetched.httpStatus,
      seen: items.length,
      inserted: persisted.inserted,
      merged: persisted.merged,
      dropped: persisted.dropped,
      newestPublished: persisted.newestPublished,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordFailure(feed, fetched.httpStatus, `persist: ${error}`).catch(() => {});
    return { ...base, status: 'failed', httpStatus: fetched.httpStatus, error, phase: 'persist', durationMs: Date.now() - t0 };
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- health bookkeeping

async function loadHealth(): Promise<Map<string, HealthRow>> {
  const { rows } = await getPool().query<HealthRow>(
    'select source_id, etag, last_modified, consecutive_failures, auto_disabled_at from feed_health',
  );
  return new Map(rows.map((r) => [r.source_id, r]));
}

/** A feed removed from config leaves its health row and UNSAVED items behind. */
async function reconcileRemovedFeeds(): Promise<void> {
  const ids = ENABLED_FEEDS.map((f) => f.id);
  const pool = getPool();
  await pool.query('delete from feed_health where not (source_id = any($1::text[]))', [ids]);
  await pool.query(
    `delete from items
      where not (source_id = any($1::text[]))
        and saved_at is null and pinned = false`,
    [ids],
  );
}

async function recordSuccess(
  feed: Feed,
  httpStatus: number,
  etag: string | null,
  lastModified: string | null,
  bodyHash: Buffer | null,
  newestPublished: Date | null,
  gotNewItems = false,
): Promise<void> {
  await getPool().query(
    `insert into feed_health (
       source_id, last_attempt_at, last_success_at, last_new_item_at, newest_published_at,
       consecutive_failures, last_status, last_error, etag, last_modified, last_body_hash
     ) values ($1, now(), now(), case when $2 then now() else null end, $3, 0, $4, null, $5, $6, $7)
     on conflict (source_id) do update set
       last_attempt_at = now(),
       last_success_at = now(),
       last_new_item_at = case when $2 then now() else feed_health.last_new_item_at end,
       newest_published_at = greatest(feed_health.newest_published_at, excluded.newest_published_at),
       consecutive_failures = 0,
       last_status = excluded.last_status,
       last_error = null,
       etag = coalesce(excluded.etag, feed_health.etag),
       last_modified = coalesce(excluded.last_modified, feed_health.last_modified),
       last_body_hash = coalesce(excluded.last_body_hash, feed_health.last_body_hash),
       auto_disabled_at = null,
       auto_disabled_reason = null`,
    [feed.id, gotNewItems, newestPublished, httpStatus, etag, lastModified, bodyHash],
  );
}

async function recordFailure(feed: Feed, httpStatus: number | null, error: string): Promise<void> {
  // bestEffort feeds (rate-limited hosts) must never accumulate failures.
  const increment = feed.bestEffort ? 0 : 1;
  await getPool().query(
    `insert into feed_health (source_id, last_attempt_at, consecutive_failures, last_status, last_error)
     values ($1, now(), $2, $3, $4)
     on conflict (source_id) do update set
       last_attempt_at = now(),
       consecutive_failures = feed_health.consecutive_failures + $2,
       last_status = excluded.last_status,
       last_error = excluded.last_error,
       auto_disabled_at = case
         when feed_health.consecutive_failures + $2 >= $5 then now()
         else feed_health.auto_disabled_at end,
       auto_disabled_reason = case
         when feed_health.consecutive_failures + $2 >= $5
           then 'auto-disabled after ' || (feed_health.consecutive_failures + $2) || ' consecutive failures'
         else feed_health.auto_disabled_reason end`,
    [feed.id, increment, httpStatus, error.slice(0, 500), AUTO_DISABLE_AFTER],
  );
}

// ---------------------------------------------------------------- run log

async function openRun(): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into ingest_runs (trigger, git_sha) values ($1, $2) returning id`,
    [process.env.INGEST_TRIGGER ?? 'local', process.env.GIT_SHA ?? null],
  );
  return rows[0]!.id;
}

async function closeRun(id: string, v: Record<string, number>): Promise<void> {
  await getPool().query(
    `update ingest_runs set
       finished_at = now(), feeds_total = $2, feeds_ok = $3, feeds_failed = $4,
       items_seen = $5, items_inserted = $6, items_merged = $7, items_dropped = $8,
       pruned_items = $9, pruned_keys = $10, duration_ms = $11
     where id = $1`,
    [id, v.feedsTotal, v.feedsOk, v.feedsFailed, v.seen, v.inserted, v.merged, v.dropped, v.prunedItems, v.prunedKeys, v.durationMs],
  );
}

// ---------------------------------------------------------------- reporting

function printSummary(
  results: FeedRunResult[],
  totals: { seen: number; inserted: number; merged: number; dropped: number },
  pruned: { prunedItems: number; prunedKeys: number; overflow: number },
  durationMs: number,
): void {
  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(`\n${DRY_RUN ? 'DRY RUN' : 'INGEST'} ${new Date().toISOString()}`);
  console.log('-'.repeat(96));
  console.log(`${pad('feed', 26)} ${pad('status', 12)} ${pad('http', 5)} ${pad('seen', 5)} ${pad('new', 5)} ${pad('dup', 5)} ${pad('drop', 5)} ms`);
  console.log('-'.repeat(96));

  for (const r of [...results].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    const mark = r.status === 'failed' ? 'FAILED' : r.status;
    console.log(
      `${pad(r.sourceId, 26)} ${pad(mark, 12)} ${pad(String(r.httpStatus ?? '-'), 5)} ` +
      `${pad(String(r.seen), 5)} ${pad(String(r.inserted), 5)} ${pad(String(r.merged), 5)} ` +
      `${pad(String(r.dropped), 5)} ${r.durationMs}`,
    );
  }

  const failures = results.filter((r) => r.status === 'failed');
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  ${f.sourceId} [${f.phase}] ${f.error}`);
    }
  }

  const empty = results.filter((r) => r.status === 'ok' && r.seen === 0);
  if (empty.length > 0) {
    console.log(`\nParsed but returned zero items: ${empty.map((e) => e.sourceId).join(', ')}`);
  }

  console.log('-'.repeat(96));
  console.log(
    `feeds ${results.length} | ok ${results.filter((r) => r.status === 'ok').length} | ` +
    `304 ${results.filter((r) => r.status === 'notmodified').length} | ` +
    `skipped ${results.filter((r) => r.status === 'skipped').length} | failed ${failures.length}`,
  );
  console.log(
    `items seen ${totals.seen} | new ${totals.inserted} | known ${totals.merged} | ` +
    `dropped ${totals.dropped}${DROP_DRY_RUN ? ' (DRY: kept)' : ''}`,
  );
  if (!DRY_RUN) {
    console.log(
      `pruned ${pruned.prunedItems} items past ${RETENTION.itemTtlDays}d | ` +
      `${pruned.prunedKeys} tombstones past ${RETENTION.keyTombstoneDays}d` +
      (pruned.overflow > 0 ? ` | overflow ${pruned.overflow}` : ''),
    );
  }
  console.log(`duration ${(durationMs / 1000).toFixed(1)}s`);
  void TOPIC_LABELS;
}

main()
  .then(async (code) => {
    await closePool().catch(() => {});
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('ingest: fatal:', err instanceof Error ? err.message : err);
    await closePool().catch(() => {});
    process.exit(1);
  });
