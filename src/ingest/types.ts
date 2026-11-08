import type { Topic } from '../../config/scoring';

/** One item after parsing and normalization, before scoring or storage. */
export type NormalizedItem = {
  sourceId: string;
  sourceName: string;
  topic: Topic;
  /** Raw guid/id from the feed, used for intra-feed idempotency. */
  guid: string | null;
  url: string;
  urlKey: string;
  title: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date;
  /** True when the feed gave no usable date and we fell back to "now". */
  publishedEstimated: boolean;
  hnUrl?: string | null;
  hnPoints?: number | null;
};

export type FetchOutcome =
  | { status: 'ok'; httpStatus: number; body: string; etag: string | null; lastModified: string | null; bodyHash: Buffer }
  | { status: 'notmodified'; httpStatus: number }
  | { status: 'failed'; httpStatus: number | null; error: string; phase: 'fetch' };

export type FeedRunResult = {
  sourceId: string;
  status: 'ok' | 'notmodified' | 'skipped' | 'failed';
  httpStatus?: number | null;
  error?: string;
  phase?: 'fetch' | 'parse' | 'persist';
  seen: number;
  inserted: number;
  merged: number;
  dropped: number;
  newestPublished?: Date | null;
  durationMs: number;
};
