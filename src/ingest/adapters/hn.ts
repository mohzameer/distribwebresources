import type { Feed } from '../../../config/feeds/index';
import { cleanTitle, truncate } from '../normalize';
import { urlKeyOf } from '../keys';
import type { NormalizedItem } from '../types';

type AlgoliaHit = {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  author: string | null;
  story_text: string | null;
  created_at: string | null;
};

/**
 * Hacker News via the free Algolia API (no key). Self-posts (no `url`) point at the HN
 * discussion itself. Every item carries hn_url/hn_points so that when persist() finds this
 * URL already present from a blog feed, it enriches that row with the discussion link
 * instead of inserting a duplicate.
 */
export function parseHnJson(feed: Feed, body: string): NormalizedItem[] {
  let payload: { hits?: AlgoliaHit[] };
  try {
    payload = JSON.parse(body) as { hits?: AlgoliaHit[] };
  } catch (err) {
    throw new Error(`HN: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }

  const hits = payload.hits ?? [];
  const out: NormalizedItem[] = [];

  for (const hit of hits) {
    if (!hit.title || !hit.objectID) continue;
    const discussion = `https://news.ycombinator.com/item?id=${hit.objectID}`;
    const target = hit.url?.trim() || discussion;
    const { canonical } = urlKeyOf(target);
    const created = hit.created_at ? new Date(hit.created_at) : null;
    const valid = created && !Number.isNaN(created.getTime());

    out.push({
      sourceId: feed.id,
      sourceName: feed.name,
      topic: feed.topic,
      guid: `hn-${hit.objectID}`,
      url: target,
      urlKey: canonical,
      title: cleanTitle(hit.title),
      summary: truncate(hit.story_text?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null, 600),
      author: hit.author ?? null,
      publishedAt: valid ? created : new Date(),
      publishedEstimated: !valid,
      hnUrl: discussion,
      hnPoints: hit.points ?? null,
    });
  }

  return out;
}
