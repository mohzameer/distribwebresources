/**
 * Every retention knob in one place.
 *
 * Articles get a 30-day TTL and are deleted by the prune step at the end of each ingest
 * run (twice daily), so nothing ever exceeds 30 days + ~12 hours.
 *
 * Dedupe memory has to outlive the articles: if an item is deleted at 30 days and someone
 * submits it to Hacker News in week six, it would come back as "new". So item_keys rows
 * survive as tombstones for 90 days -- bare sha256 hashes, 32 bytes, with no title, URL or
 * text, so nothing about the article itself is retained past 30 days.
 */
export const RETENTION = {
  /** Articles older than this are deleted. Saved and pinned items are exempt. */
  itemTtlDays: 30,
  /** Hash-only dedupe tombstones are garbage-collected after this. */
  keyTombstoneDays: 90,
  /** Safety valve: a runaway feed cannot balloon the DB before the next prune. */
  maxUnsavedItems: 15_000,
} as const;
