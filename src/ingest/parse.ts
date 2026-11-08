import { createRequire } from 'node:module';
import type { Feed } from '../../config/feeds/index';
import { RETENTION } from '../../config/retention';
import { SCORING } from '../../config/scoring';
import { cleanTitle, htmlToText, stripBoilerplate, truncate } from './normalize';
import { urlKeyOf } from './keys';
import { parseHnJson } from './adapters/hn';
import type { NormalizedItem } from './types';

// The parser is CommonJS; createRequire keeps this file ESM.
const require = createRequire(import.meta.url);
const { parseFeed } = require('@rowanmanning/feed-parser') as {
  parseFeed: (xml: string) => {
    items: Array<{
      id: string | null;
      title: string | null;
      description: string | null;
      content: string | null;
      url: string | null;
      published: Date | null;
      updated: Date | null;
      authors: Array<{ name: string | null }>;
    }>;
  };
};

export const SUMMARY_MAX = 600;

/**
 * Turn a fetched body into normalized items.
 *
 * arXiv's API and GitHub's releases.atom are both plain Atom, so they go through the same
 * parser as everything else; only Hacker News needs its own adapter because it is JSON.
 */
export function parseItems(feed: Feed, body: string): NormalizedItem[] {
  if (feed.kind === 'hn') return parseHnJson(feed, body);

  const parsed = parseFeed(body);
  const out: NormalizedItem[] = [];

  for (const raw of parsed.items) {
    const url = raw.url?.trim();
    const title = raw.title ? cleanTitle(raw.title) : null;
    // An item with no link or no title is not something we can show or dedupe.
    if (!url || !title) continue;

    const { canonical } = urlKeyOf(url);

    // description first (usually a real summary), content as fallback (often the whole post)
    const summaryText = htmlToText(raw.description) ?? htmlToText(raw.content);

    // For GitHub release feeds the <updated> changes when someone edits old release notes,
    // so prefer `published` and only fall back to `updated`.
    const date = raw.published ?? raw.updated;
    const valid = date instanceof Date && !Number.isNaN(date.getTime());
    // Guard against feeds with absurd future dates pinning themselves to the top forever.
    const notFuture = valid && date.getTime() <= Date.now() + 36 * 3600 * 1000;

    out.push({
      sourceId: feed.id,
      sourceName: feed.name,
      topic: feed.topic,
      guid: raw.id?.trim() || url,
      url,
      urlKey: canonical,
      title,
      summary: truncate(stripBoilerplate(summaryText), SUMMARY_MAX),
      author: raw.authors?.[0]?.name?.trim() || null,
      publishedAt: notFuture ? (date as Date) : new Date(),
      publishedEstimated: !notFuture,
    });
  }

  // Anything already past the retention window would be deleted by the very next prune, so
  // there is no point storing it. This is also what tames the archive-shaped feeds: Vercel's
  // atom carries 2135 entries going back years, Temporal 454, Shopify 437.
  const cutoff = Date.now() - RETENTION.itemTtlDays * 86_400_000;
  const fresh = out.filter((i) => i.publishedAt.getTime() >= cutoff);

  // Backstop for a feed that dumps hundreds of items inside the window.
  fresh.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return fresh.slice(0, SCORING.maxItemsPerRun);
}
