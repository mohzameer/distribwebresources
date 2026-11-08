import { createHash } from 'node:crypto';
import { canonicalUrl, normalizeTitle } from './normalize';

export type KeyType = 'guid' | 'url' | 'title';
export type ItemKey = { type: KeyType; hash: Buffer };

function sha256(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

export function hashBody(body: string): Buffer {
  return sha256(body);
}

/**
 * Intra-feed idempotency, and the 99% case across runs.
 *
 * Scoped by sourceId because feed guids are only unique within a feed. arXiv ids carry a
 * revision suffix (`.../abs/2511.01234v2`) which must be stripped, or every revision of a
 * paper inserts a duplicate. GitHub release feeds use a stable `tag:github.com,...` id,
 * which is exactly why we key on it: their <updated> changes whenever someone edits old
 * release notes, and keying on the date would resurface ancient releases as news.
 */
export function guidKey(sourceId: string, rawGuid: string): ItemKey {
  const trimmed = rawGuid.trim();
  // Strip the revision suffix ONLY on arXiv ids; a trailing "v2" is meaningful elsewhere
  // (e.g. a release tag), so this must not be a blanket rule.
  const normalized = /arxiv\.org\/abs\//i.test(trimmed)
    ? trimmed.replace(/v\d+$/, '')
    : trimmed;
  return { type: 'guid', hash: sha256(`${sourceId}\0${normalized}`) };
}

/** The cross-source workhorse: collapses a blog post, its Medium mirror and an HN link. */
export function urlKeyOf(url: string): { key: ItemKey; canonical: string } {
  const canonical = canonicalUrl(url);
  return { key: { type: 'url', hash: sha256(canonical) }, canonical };
}

export function titleKeyOf(title: string): { key: ItemKey; normalized: string } {
  const normalized = normalizeTitle(title);
  return { key: { type: 'title', hash: sha256(normalized) }, normalized };
}
