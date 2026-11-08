import { z } from 'zod';
import type { Topic } from '../scoring';

/**
 * Feed definitions live in git, not the database, because BOTH processes need them: the
 * ingester wants URLs and parse hints, the app wants display names, lane order and caps.
 * One typed import removes any chance of the two disagreeing. It also means adding a feed
 * is a reviewable diff with history, and no admin UI is needed for a single user.
 *
 * The only DB counterpart is `feed_health`, keyed by `id` with NO foreign key -- so
 * deleting a feed from this config can never fail on a constraint.
 */
export const FeedSchema = z.object({
  /** Stable; never reuse an id for a different source. */
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  topic: z.enum(['aws', 'devops', 'distsys', 'engblogs', 'community']),
  url: z.string().url(),
  homepage: z.string().url(),
  kind: z.enum(['feed', 'arxiv', 'hn', 'gh-releases']).default('feed'),
  enabled: z.boolean().default(true),
  /** Scopes title-key merging, e.g. a blog and its Medium mirror share a group. */
  sourceGroup: z.string().optional(),
  /** Max items from this source within its lane (render-time). */
  cap: z.number().int().positive().optional(),
  /**
   * Per-feed storage floor, overriding SCORING.minStoreScore. Used where a feed is
   * on-topic by definition but high-volume, e.g. arXiv cs.DC publishes 20-40 papers a
   * weekday and we only want the ones whose title or abstract actually matches.
   */
  minScore: z.number().optional(),
  /** Staleness threshold: warn if nothing new in 3x this. */
  expectCadenceDays: z.number().int().positive().default(30),
  /** Known low-volume: never warn about it being quiet. */
  slow: z.boolean().default(false),
  /** Failures are expected and must not count against health (e.g. rate-limited hosts). */
  bestEffort: z.boolean().default(false),
  notes: z.string().optional(),
});

export type Feed = z.output<typeof FeedSchema>;
export type FeedInput = z.input<typeof FeedSchema>;
export type { Topic };

/** A GitHub release feed: plain Atom, no auth, no API rate limit. */
export function ghReleases(
  repo: string,
  name: string,
  extra: Partial<FeedInput> = {},
): FeedInput {
  return {
    id: `gh-${repo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: `${name} releases`,
    topic: 'devops',
    url: `https://github.com/${repo}/releases.atom`,
    homepage: `https://github.com/${repo}/releases`,
    kind: 'gh-releases',
    expectCadenceDays: 60,
    ...extra,
  };
}
