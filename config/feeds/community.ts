import type { FeedInput } from './types';

/**
 * Aggregators. These are run LAST in each ingest pass so that an HN story pointing at a
 * blog post we already have merges INTO that post (attaching the discussion link) rather
 * than inserting a duplicate row. Running them first would merge the canonical post into
 * the HN row and lose the real source attribution.
 *
 * Anything that does not match an existing article lands in the Community lane.
 */
export const communityFeeds: FeedInput[] = [
  {
    id: 'hn-top',
    name: 'Hacker News',
    topic: 'community',
    // Algolia's free API, no key required. `>` must be percent-encoded. The created_at_i
    // lower bound is 7 days, not 24h, because a story often does not cross 100 points until
    // well after submission -- a 24h window silently misses the slow burners, and dedupe
    // makes the wider window free.
    url: 'https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E100&hitsPerPage=50',
    homepage: 'https://news.ycombinator.com/',
    kind: 'hn',
    expectCadenceDays: 2,
    cap: 6,
  },
  {
    id: 'lobsters',
    name: 'Lobsters',
    topic: 'community',
    url: 'https://lobste.rs/rss',
    homepage: 'https://lobste.rs/',
    expectCadenceDays: 2,
    cap: 4,
  },
  // Deliberately omitted: Reddit. r/devops/.rss returned 200 once and then 429/500 under
  // repeated requests; cloud IPs (GitHub Actions runners) are throttled harder still. If
  // you ever want it back, add it with bestEffort: true so failures never count as health
  // problems.
];
