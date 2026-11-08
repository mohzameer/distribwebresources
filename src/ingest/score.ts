import { SCORING, type Topic } from '../../config/scoring';

export type ScoreResult = {
  /** Stored for ranking: includes sourceWeight. */
  baseScore: number;
  /** Used for the storage decision only: excludes sourceWeight. */
  storeScore: number;
  hardDrop: boolean;
  dropReason?: string;
  debug: {
    kw: [string, number][];
    noise: [string, number][];
    src: number;
    sig: [string, number][];
    base: number;
    v: number;
  };
};

/**
 * Compute the stored, TIME-INDEPENDENT score. Recency decay is applied at render time by
 * `recency()` in config/scoring.ts, which is why no rescore job is ever needed and why
 * lane order is correct at any hour.
 */
export function scoreItem(input: {
  title: string;
  summary: string | null;
  topic: Topic;
  sourceId: string;
  hnPoints?: number | null;
  /** Per-feed storage floor, e.g. arXiv requires at least one keyword hit. */
  minScore?: number;
}): ScoreResult {
  const title = input.title ?? '';
  const summary = input.summary ?? '';
  const both = `${title}\n${summary}`;

  // --- keywords: each counts once, title hits worth double, total capped ---
  const kw: [string, number][] = [];
  let kwSum = 0;
  for (const rule of SCORING.keywords) {
    const applies = rule.topics.includes('*') || rule.topics.includes(input.topic);
    if (!applies) continue;
    const inTitle = rule.re.test(title);
    const inSummary = !inTitle && rule.re.test(summary);
    if (!inTitle && !inSummary) continue;
    const points = rule.w * (inTitle ? SCORING.titleWeight : SCORING.summaryWeight);
    kw.push([rule.re.source.slice(0, 40), points]);
    kwSum += points;
  }
  const kwCapped = Math.min(kwSum, SCORING.keywordCap);

  // --- noise: hard drops short-circuit, soft penalties accumulate ---
  //
  // Hard-drop rules are matched against the TITLE ONLY. Matching them against the body too
  // deletes substantive posts for incidental mentions -- in testing, an EC2 Capacity Blocks
  // announcement was dropped purely because "GovCloud" appeared in its summary. Soft
  // penalties still consider both, since mis-ranking is recoverable and deletion is not.
  const noise: [string, number][] = [];
  let noiseSum = 0;
  let dropReason: string | undefined;
  for (const rule of SCORING.noise) {
    if (rule.drop) {
      if (!rule.re.test(title)) continue;
      dropReason ??= rule.why;
      noise.push([rule.why, Number.NEGATIVE_INFINITY]);
      continue;
    }
    if (!rule.re.test(both)) continue;
    noise.push([rule.why, rule.w ?? 0]);
    noiseSum += rule.w ?? 0;
  }

  const src = SCORING.sourceWeight[input.sourceId] ?? 0;

  // --- signals ---
  const sig: [string, number][] = [];
  let sigSum = 0;
  if (input.hnPoints && input.hnPoints > 0) {
    const v = SCORING.signals.hnPoints(input.hnPoints);
    if (v > 0) {
      sig.push(['hn', round(v)]);
      sigSum += v;
    }
  }
  if (summary.length > SCORING.signals.longformChars) {
    sig.push(['longform', SCORING.signals.longformBonus]);
    sigSum += SCORING.signals.longformBonus;
  }
  if (!summary) {
    sig.push(['nosummary', SCORING.signals.noSummaryPenalty]);
    sigSum += SCORING.signals.noSummaryPenalty;
  }

  // The storage decision deliberately ignores sourceWeight: whether an item is worth
  // keeping is about the item, not about how much we like the feed it came from.
  const storeScore = round(SCORING.baseline + kwCapped + noiseSum + sigSum);
  const baseScore = round(Math.max(SCORING.scoreFloor, storeScore + src));
  const floor = input.minScore ?? SCORING.minStoreScore;
  const belowFloor = storeScore < floor;

  return {
    baseScore,
    storeScore,
    hardDrop: dropReason !== undefined || belowFloor,
    dropReason: dropReason ?? (belowFloor ? 'below-min-score' : undefined),
    debug: { kw, noise, src, sig, base: SCORING.baseline, v: SCORING.version },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
