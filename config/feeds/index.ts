import { FeedSchema, type Feed } from './types';
import { awsFeeds } from './aws';
import { devopsFeeds } from './devops';
import { distsysFeeds } from './distsys';
import { engblogFeeds } from './engblogs';
import { communityFeeds } from './community';

/**
 * Aggregators come last on purpose: see the note in community.ts about HN merging into
 * canonical articles rather than duplicating them.
 */
const raw = [...awsFeeds, ...devopsFeeds, ...distsysFeeds, ...engblogFeeds, ...communityFeeds];

export const FEEDS: Feed[] = raw.map((f, i) => {
  const parsed = FeedSchema.safeParse(f);
  if (!parsed.success) {
    throw new Error(
      `Invalid feed config at index ${i} (${f.id ?? 'no id'}): ${parsed.error.issues.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`,
    );
  }
  return parsed.data;
});

// Fail loudly on duplicate ids: two feeds sharing an id would silently clobber each
// other's health row and dedupe namespace.
const seen = new Set<string>();
for (const f of FEEDS) {
  if (seen.has(f.id)) throw new Error(`Duplicate feed id: ${f.id}`);
  seen.add(f.id);
}

export const ENABLED_FEEDS = FEEDS.filter((f) => f.enabled);

export function feedById(id: string): Feed | undefined {
  return FEEDS.find((f) => f.id === id);
}

export type { Feed };
export { FeedSchema };
