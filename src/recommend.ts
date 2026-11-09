/**
 * The recommender: TF-IDF over the window, a Rocchio taste profile from what you opened
 * and kept, and maximal marginal relevance for diversity. No model, no API, no AI.
 *
 * It runs in TypeScript over the rows `getWindow()` already loaded, for the same reason
 * lane ranking does: a thousand documents is a sub-millisecond job, and keeping it out of
 * SQL means retuning `config/recommend.ts` needs no migration and no duplicated logic.
 *
 * Everything here is deterministic and inspectable, which is what lets every row on the
 * page say why it is there.
 */
import { SCORING, TOPIC_LABELS, type Topic } from '../config/scoring';
import { RECOMMEND } from '../config/recommend';
import { RETENTION } from '../config/retention';
import type { Item } from './lanes';

/** A document as a sparse, L2-normalized TF-IDF vector: stem -> weight. */
export type Vector = Map<string, number>;

/**
 * Function words plus the handful of words every feed headline contains ("introducing",
 * "announcing", "new"). IDF would discount these anyway; removing them keeps them out of
 * the human-readable explanations, which is the real reason they are here.
 */
const STOPWORDS = new Set(
  `a about above after all also an and any are as at be been before being below best but by
   can could did do does doing done down during each else even every few for from further
   get gets got had has have having he her here hers him his how i if in into is it its
   just like made make makes making many may me might more most much must my need needs no
   nor not now of off on once one only onto or other our out over own per said same see
   she should since so some such than that the their them then there these they this those
   through to too under until up upon us use used uses using very was way we well were what
   when where which while who whom why will with within without would you your
   announcing announces announcement available blog guide introducing news post posts
   release released series update updates version week`
    .trim()
    .split(/\s+/),
);

const WORD = /[a-z0-9][a-z0-9.+#]*/g;

/** Words, lowercased, with trailing punctuation shed. Keeps "s3", "node.js", "ec2". */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const match of text.toLowerCase().matchAll(WORD)) {
    const token = match[0].replace(/[.+#]+$/, '');
    if (token.length < RECOMMEND.minTokenLength) continue;
    if (/^\d+$/.test(token)) continue; // bare numbers: years, counts, versions
    if (STOPWORDS.has(token)) continue;
    out.push(token);
  }
  return out;
}

/**
 * A deliberately crude suffix stripper. It only has to be *consistent* -- "shards" and
 * "sharding" landing on the same key is the entire job, and a real Porter stemmer would
 * add a dependency to do the same thing to engineering vocabulary.
 */
export function stem(token: string): string {
  if (/\d/.test(token)) return token; // s3, ec2, k8s, http2
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 5 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('es') && !token.endsWith('ses')) return token.slice(0, -1);
  if (token.length > 3 && token.endsWith('s') && !/(?:ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

export type Corpus = {
  /** stem -> inverse document frequency over the whole window. */
  idf: Map<string, number>;
  /** stem -> the commonest surface form, so explanations read as English. */
  surface: Map<string, string>;
  /** item id -> normalized vector. */
  vectors: Map<string, Vector>;
  size: number;
};

function normalize(tf: Map<string, number>, idf: Map<string, number>): Vector {
  const vector: Vector = new Map();
  let sumSquares = 0;
  for (const [term, count] of tf) {
    // Sublinear TF: the fifth mention of "kubernetes" says much less than the first.
    const weight = (1 + Math.log(count)) * (idf.get(term) ?? 0);
    if (weight <= 0) continue;
    vector.set(term, weight);
    sumSquares += weight * weight;
  }
  const length = Math.sqrt(sumSquares);
  if (length > 0) for (const [term, weight] of vector) vector.set(term, weight / length);
  return vector;
}

/**
 * Vectorize every item once. IDF is computed over exactly the documents we hold, which is
 * what makes "distributed" an unremarkable word here and "fencing" a loud one -- the
 * corpus is already narrow, so the statistics do the topic-spotting for free.
 */
export function buildCorpus(items: Item[]): Corpus {
  const docs = new Map<string, Map<string, number>>();
  const documentFreq = new Map<string, number>();
  const forms = new Map<string, Map<string, number>>();

  for (const item of items) {
    if (docs.has(item.id)) continue;
    const tf = new Map<string, number>();
    const add = (text: string, weight: number) => {
      for (const token of tokenize(text)) {
        const key = stem(token);
        tf.set(key, (tf.get(key) ?? 0) + weight);
        let seen = forms.get(key);
        if (!seen) forms.set(key, (seen = new Map()));
        seen.set(token, (seen.get(token) ?? 0) + 1);
      }
    };
    add(item.title, RECOMMEND.titleWeight);
    if (item.summary) add(item.summary, RECOMMEND.summaryWeight);
    docs.set(item.id, tf);
    for (const term of tf.keys()) documentFreq.set(term, (documentFreq.get(term) ?? 0) + 1);
  }

  const size = docs.size;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFreq) idf.set(term, Math.log(1 + size / df));

  const surface = new Map<string, string>();
  for (const [key, seen] of forms) {
    let best = key;
    let bestCount = -1;
    for (const [form, count] of seen) {
      if (count > bestCount || (count === bestCount && form.length < best.length)) {
        best = form;
        bestCount = count;
      }
    }
    surface.set(key, best);
  }

  const vectors = new Map<string, Vector>();
  for (const [id, tf] of docs) vectors.set(id, normalize(tf, idf));

  return { idf, surface, vectors, size };
}

/** Both vectors are unit length, so the dot product *is* the cosine. */
export function cosine(a: Vector, b: Vector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) dot += weight * other;
  }
  return dot;
}

/** The terms two vectors actually share, strongest first, as readable words. */
function sharedTerms(a: Vector, b: Vector, corpus: Corpus, count: number): string[] {
  const scored: [string, number][] = [];
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other !== undefined) scored.push([term, weight * other]);
  }
  scored.sort((x, y) => y[1] - x[1]);
  return scored.slice(0, count).map(([term]) => corpus.surface.get(term) ?? term);
}

export type Profile = {
  vector: Vector;
  seedCount: number;
  savedCount: number;
  readCount: number;
  /** 0..1 -- how far the feedback has got towards `confidenceSeeds`. */
  confidence: number;
  terms: string[];
};

/**
 * Rocchio, positive examples only. The centroid of what you kept and opened IS the
 * profile; there is nothing to train.
 *
 * Negative examples are deliberately absent. The obvious implicit negative -- "shown on
 * the front page and never clicked" -- needs an impression log, which this site has no
 * way to write: the homepage is served from the ISR cache and touches Postgres zero
 * times. The ingest job could snapshot what each edition showed, and that is the honest
 * way to add negatives later.
 */
export function buildProfile(corpus: Corpus, saved: Item[], read: Item[]): Profile {
  const seeds: { item: Item; weight: number }[] = [];
  const seen = new Set<string>();
  for (const item of saved) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    seeds.push({ item, weight: RECOMMEND.savedSeedWeight });
  }
  for (const item of read) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    seeds.push({ item, weight: RECOMMEND.readSeedWeight });
  }

  const used = seeds.slice(0, RECOMMEND.maxProfileSeeds);
  const centroid: Vector = new Map();
  for (const { item, weight } of used) {
    const vector = corpus.vectors.get(item.id);
    if (!vector) continue;
    for (const [term, value] of vector) centroid.set(term, (centroid.get(term) ?? 0) + value * weight);
  }

  let sumSquares = 0;
  for (const value of centroid.values()) sumSquares += value * value;
  const length = Math.sqrt(sumSquares);
  if (length > 0) for (const [term, value] of centroid) centroid.set(term, value / length);

  const terms = [...centroid.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECOMMEND.profileTerms)
    .map(([term]) => corpus.surface.get(term) ?? term);

  return {
    vector: centroid,
    seedCount: used.length,
    savedCount: used.filter((s) => s.weight === RECOMMEND.savedSeedWeight).length,
    readCount: used.filter((s) => s.weight === RECOMMEND.readSeedWeight).length,
    confidence: Math.min(1, used.length / RECOMMEND.confidenceSeeds),
    terms,
  };
}

/** Why a row is on the page. Rendered verbatim as a chip, so it has to be true. */
export type Reason =
  | { kind: 'affinity'; terms: string[] }
  | { kind: 'similar'; terms: string[] }
  | { kind: 'editorial'; label: string };

export type Pick = { item: Item; score: number; affinity: number; reason: Reason };

export type Recommendations = {
  lead: Pick | null;
  picks: Pick[];
  because: { seed: Item; items: Pick[] }[];
  leavingSoon: Item[];
  profile: Profile;
  candidates: number;
};

/**
 * The fallback explanation, for when the profile had nothing to say. Every one of these
 * is a fact about the item that is already on the page somewhere, which is the point: the
 * chip never claims a personal reason that does not exist.
 */
function editorialReason(item: Item): Reason {
  if (item.hnPoints !== null && item.hnPoints >= 100) {
    return { kind: 'editorial', label: `${item.hnPoints} points on HN` };
  }
  if ((SCORING.sourceWeight[item.sourceId] ?? 0) >= 2) {
    return { kind: 'editorial', label: `${item.sourceName} rates highly` };
  }
  return { kind: 'editorial', label: `Top of ${TOPIC_LABELS[item.topic as Topic] ?? item.topic}` };
}

/**
 * Maximal marginal relevance. Greedily take the item with the best blend of score and
 * dissimilarity to everything already chosen, under hard per-source and per-topic caps.
 *
 * This is what stops the page being five accounts of the same AWS outage: those five
 * items have near-identical vectors, so the first one chosen suppresses the rest without
 * any rule naming the event.
 */
function selectDiverse(
  ranked: { item: Item; score: number; affinity: number }[],
  corpus: Corpus,
  count: number,
): { item: Item; score: number; affinity: number }[] {
  const pool = ranked.slice(0, RECOMMEND.candidatePool);
  const best = pool[0]?.score ?? 1;
  const chosen: { item: Item; score: number; affinity: number }[] = [];
  const taken = new Set<string>();
  const perSource = new Map<string, number>();
  const perTopic = new Map<string, number>();

  while (chosen.length < count) {
    let winner: (typeof pool)[number] | null = null;
    let winnerValue = -Infinity;

    for (const candidate of pool) {
      if (taken.has(candidate.item.id)) continue;
      if ((perSource.get(candidate.item.sourceId) ?? 0) >= RECOMMEND.maxPerSource) continue;
      if ((perTopic.get(candidate.item.topic) ?? 0) >= RECOMMEND.maxPerTopic) continue;

      const vector = corpus.vectors.get(candidate.item.id);
      let closest = 0;
      if (vector) {
        for (const picked of chosen) {
          const other = corpus.vectors.get(picked.item.id);
          if (!other) continue;
          const similarity = cosine(vector, other);
          if (similarity > closest) closest = similarity;
        }
      }

      const relevance = best > 0 ? candidate.score / best : 0;
      const value = RECOMMEND.lambda * relevance - (1 - RECOMMEND.lambda) * closest;
      if (value > winnerValue) {
        winnerValue = value;
        winner = candidate;
      }
    }

    if (!winner) break;
    taken.add(winner.item.id);
    perSource.set(winner.item.sourceId, (perSource.get(winner.item.sourceId) ?? 0) + 1);
    perTopic.set(winner.item.topic, (perTopic.get(winner.item.topic) ?? 0) + 1);
    chosen.push(winner);
  }

  return chosen;
}

/**
 * The whole front page, in one pass.
 *
 * `window` is the 30-day render window; `saved` is every saved article, which may reach
 * back further than the window because saved items are exempt from the prune. Saved items
 * are therefore seeds for the profile but never candidates -- you have already dealt with
 * them.
 */
export function recommend(window: Item[], saved: Item[], now = Date.now()): Recommendations {
  const corpus = buildCorpus([...window, ...saved]);
  const read = window.filter((i) => i.readAt !== null).sort((a, b) => +(b.readAt ?? 0) - +(a.readAt ?? 0));
  const profile = buildProfile(corpus, saved, read);

  const seedIds = new Set(profile.vector.size > 0 ? saved.concat(read).map((i) => i.id) : []);
  const candidates = window.filter((i) => i.readAt === null && i.savedAt === null && !seedIds.has(i.id));

  const scored = candidates
    .map((item) => {
      const vector = corpus.vectors.get(item.id);
      const affinity = vector && profile.vector.size > 0 ? cosine(vector, profile.vector) : 0;
      const tilt = 1 + RECOMMEND.affinityBoost * affinity * profile.confidence;
      return { item, score: item.renderScore * tilt, affinity };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = selectDiverse(scored, corpus, RECOMMEND.picks + 1);

  const explain = (entry: { item: Item; score: number; affinity: number }): Pick => {
    const vector = corpus.vectors.get(entry.item.id);
    const reason: Reason =
      entry.affinity >= RECOMMEND.minAffinity && vector
        ? { kind: 'affinity', terms: sharedTerms(vector, profile.vector, corpus, 3) }
        : editorialReason(entry.item);
    return { ...entry, reason };
  };

  const picks = chosen.map(explain);
  const shown = new Set(picks.map((p) => p.item.id));

  // "Because you saved X": nearest neighbours of one article, which is a different and
  // much sharper question than "near your average taste".
  const because: Recommendations['because'] = [];
  const seedsUsed = new Set<string>();
  for (const seed of saved.concat(read)) {
    if (because.length >= RECOMMEND.because.seeds) break;
    // A saved article is usually also a read one, so the two lists overlap.
    if (seedsUsed.has(seed.id)) continue;
    seedsUsed.add(seed.id);
    const seedVector = corpus.vectors.get(seed.id);
    if (!seedVector) continue;

    const ranked = candidates
      .filter((i) => !shown.has(i.id))
      .map((item) => {
        const vector = corpus.vectors.get(item.id);
        return { item, similarity: vector ? cosine(vector, seedVector) : 0, vector };
      })
      .filter((n) => n.similarity >= RECOMMEND.because.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity);

    const perSource = new Map<string, number>();
    const neighbours: typeof ranked = [];
    for (const neighbour of ranked) {
      if (neighbours.length >= RECOMMEND.because.items) break;
      const used = perSource.get(neighbour.item.sourceId) ?? 0;
      if (used >= RECOMMEND.because.maxPerSource) continue;
      perSource.set(neighbour.item.sourceId, used + 1);
      neighbours.push(neighbour);
    }

    if (neighbours.length === 0) continue;
    for (const n of neighbours) shown.add(n.item.id);
    because.push({
      seed,
      items: neighbours.map((n) => ({
        item: n.item,
        score: n.similarity,
        affinity: n.similarity,
        reason: {
          kind: 'similar' as const,
          terms: n.vector ? sharedTerms(n.vector, seedVector, corpus, 3) : [],
        },
      })),
    });
  }

  // Strong, unread, and inside the last few days of its 30-day life. Nothing else on the
  // site surfaces these: recency decay is exactly what buried them.
  const cutoff = now - (RETENTION.itemTtlDays - RECOMMEND.leavingSoon.withinDays) * 86_400_000;
  const usedSources = new Set<string>();
  const leavingSoon: Item[] = [];
  for (const item of [...candidates].sort((a, b) => b.baseScore - a.baseScore)) {
    if (leavingSoon.length >= RECOMMEND.leavingSoon.count) break;
    if (item.publishedAt.getTime() > cutoff) continue;
    if (shown.has(item.id) || usedSources.has(item.sourceId)) continue;
    usedSources.add(item.sourceId);
    leavingSoon.push(item);
  }

  return {
    lead: picks[0] ?? null,
    picks: picks.slice(1),
    because,
    leavingSoon,
    profile,
    candidates: candidates.length,
  };
}
