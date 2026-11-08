import { SCORING, TOPICS, TOPIC_LABELS, recency, type Topic } from '../config/scoring';
import { RETENTION } from '../config/retention';
import { sql } from './db/client';

export type Item = {
  id: string;
  sourceId: string;
  sourceName: string;
  topic: Topic;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date;
  baseScore: number;
  hnUrl: string | null;
  hnPoints: number | null;
  readAt: Date | null;
  savedAt: Date | null;
  /** base_score * recency, computed here rather than in SQL. */
  renderScore: number;
};

export type Lane = {
  topic: Topic;
  label: string;
  visible: Item[];
  overflow: Item[];
  total: number;
};

type Row = {
  id: string;
  source_id: string;
  source_name: string;
  topic: Topic;
  title: string;
  url: string;
  summary: string | null;
  published_at: string;
  base_score: number;
  hn_url: string | null;
  hn_points: number | null;
  read_at: string | null;
  saved_at: string | null;
};

/**
 * The whole render window in one query. Ranking happens in TypeScript because
 * `base_score * recency(age)` is not index-friendly anyway, a few thousand rows is a
 * sub-millisecond sort, and keeping it out of SQL means retuning the scoring config needs
 * no migration and no duplicated logic.
 */
export async function getWindow(): Promise<Item[]> {
  const rows = (await sql()`
    select id, source_id, source_name, topic, title, url, summary, published_at,
           base_score, hn_url, hn_points, read_at, saved_at
      from items
     where published_at > now() - (${RETENTION.itemTtlDays}::int * interval '1 day')
     order by topic, base_score desc
  `) as Row[];

  const now = Date.now();
  return rows.map((r) => {
    const publishedAt = new Date(r.published_at);
    const ageHours = (now - publishedAt.getTime()) / 3_600_000;
    const baseScore = Number(r.base_score);
    return {
      id: r.id,
      sourceId: r.source_id,
      sourceName: r.source_name,
      topic: r.topic,
      title: r.title,
      url: r.url,
      summary: r.summary,
      publishedAt,
      baseScore,
      hnUrl: r.hn_url,
      hnPoints: r.hn_points === null ? null : Number(r.hn_points),
      readAt: r.read_at ? new Date(r.read_at) : null,
      savedAt: r.saved_at ? new Date(r.saved_at) : null,
      renderScore: baseScore * recency(ageHours, r.topic),
    };
  });
}

/**
 * Build the topic lanes.
 *
 * Lanes rank over the WHOLE window rather than a fixed time box. That matters: AWS
 * publishes ~9 items/day while Netflix publishes one to three posts a week, so a "last 24
 * hours" lane would leave Engineering Blogs empty most days and make the AWS lane a wall.
 * The per-topic half-lives in scoring.ts turn one mechanism into "today's AWS" and "the
 * best engineering posts of the past fortnight".
 */
export function buildLanes(items: Item[], opts: { unreadOnly?: boolean } = {}): Lane[] {
  const lanes: Lane[] = [];

  for (const topic of TOPICS) {
    let pool = items.filter((i) => i.topic === topic);
    if (opts.unreadOnly) pool = pool.filter((i) => !i.readAt);
    pool.sort((a, b) => b.renderScore - a.renderScore);

    // Per-source caps, so one loud feed cannot crowd out a single excellent post.
    const perSource = new Map<string, number>();
    const capped: Item[] = [];
    for (const item of pool) {
      const cap = SCORING.caps.perSource[item.sourceId] ?? SCORING.caps.perSource.default ?? 4;
      const used = perSource.get(item.sourceId) ?? 0;
      if (used >= cap) continue;
      perSource.set(item.sourceId, used + 1);
      capped.push(item);
    }

    lanes.push({
      topic,
      label: TOPIC_LABELS[topic],
      visible: capped.slice(0, SCORING.caps.perLane),
      overflow: capped.slice(SCORING.caps.perLane, SCORING.caps.perLaneMax),
      total: capped.length,
    });
  }

  return lanes;
}

export type FeedHealthRow = {
  source_id: string;
  consecutive_failures: number;
  last_error: string | null;
  last_status: number | null;
  last_success_at: string | null;
  newest_published_at: string | null;
  auto_disabled_at: string | null;
};

export async function getHealth(): Promise<{
  feeds: FeedHealthRow[];
  lastRun: { started_at: string; feeds_ok: number; feeds_total: number; items_inserted: number; pruned_items: number } | null;
}> {
  const feeds = (await sql()`
    select source_id, consecutive_failures, last_error, last_status,
           last_success_at, newest_published_at, auto_disabled_at
      from feed_health
     order by consecutive_failures desc, source_id
  `) as FeedHealthRow[];

  const runs = (await sql()`
    select started_at, feeds_ok, feeds_total, items_inserted, pruned_items
      from ingest_runs
     where finished_at is not null
     order by started_at desc
     limit 1
  `) as { started_at: string; feeds_ok: number; feeds_total: number; items_inserted: number; pruned_items: number }[];

  return { feeds, lastRun: runs[0] ?? null };
}

export async function getSaved(): Promise<Item[]> {
  const rows = (await sql()`
    select id, source_id, source_name, topic, title, url, summary, published_at,
           base_score, hn_url, hn_points, read_at, saved_at
      from items
     where saved_at is not null
     order by saved_at desc
     limit 300
  `) as Row[];

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    topic: r.topic,
    title: r.title,
    url: r.url,
    summary: r.summary,
    publishedAt: new Date(r.published_at),
    baseScore: Number(r.base_score),
    hnUrl: r.hn_url,
    hnPoints: r.hn_points === null ? null : Number(r.hn_points),
    readAt: r.read_at ? new Date(r.read_at) : null,
    savedAt: r.saved_at ? new Date(r.saved_at) : null,
    renderScore: 0,
  }));
}
