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
 *
 * Merit ranking is not the whole page, though. Two seats go to the aggregator lane and
 * two to whatever the profile has the least vocabulary for, both rotating every twelve
 * hours, because a recommender trained only on what it chose to show you is a closed
 * loop. The reserved-seat block in `config/recommend.ts` is the argument for why.
 */
import { SCORING, TOPICS, TOPIC_LABELS, type Topic } from '../config/scoring';
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

/**
 * How much of an article the profile has no vocabulary for at all: the share of its
 * squared vector weight sitting on terms the centroid has never seen. Vectors are unit
 * length, so this is 0 when every term is familiar and 1 when none of them is.
 *
 * This is the exploration signal, and it exists because cosine affinity cannot do the
 * job. Over a thousand-item window the affinities run 0.00 to 0.13 with a median of
 * 0.02, so "low affinity" is true of almost everything and selects nothing in
 * particular. Novelty over the same window runs 0.42 to 1.00.
 */
export function novelty(vector: Vector, profile: Vector): number {
  if (profile.size === 0) return 1;
  let familiar = 0;
  for (const [term, weight] of vector) if (profile.has(term)) familiar += weight * weight;
  return Math.max(0, Math.min(1, 1 - familiar));
}

/** Which rotation window a timestamp falls in. */
function epochOf(now: number, hours: number): number {
  return Math.floor(now / (hours * 3_600_000));
}

/**
 * A deterministic sliding window into a pool: `count` items, advancing by `count` each
 * epoch and wrapping round. No randomness anywhere, so two renders inside the same
 * window are byte-identical, and over enough epochs the whole pool has been past the
 * reader exactly once per cycle.
 */
function rotate<T>(pool: T[], count: number, epoch: number): T[] {
  if (pool.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const item = pool[(epoch * count + i) % pool.length];
    if (item !== undefined) out.push(item);
  }
  return out;
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
  | { kind: 'editorial'; label: string }
  /** Here on the news quota, not on merit. */
  | { kind: 'news'; label: string }
  /** Here because the profile knows nothing about it. */
  | { kind: 'explore'; label: string };

export type Pick = { item: Item; score: number; affinity: number; reason: Reason };

/** An item with its merit score, before a reason is attached. */
type Entry = { item: Item; score: number; affinity: number };

/** An explore candidate, carrying the novelty its chip quotes. */
type Seat = { item: Item; novelty: number };

export type Recommendations = {
  lead: Pick | null;
  picks: Pick[];
  /**
   * Spare picks the page ships but does not show, so the rotate button can replace a row
   * client-side. Chosen by the same diversity pass as the visible ones, with everything
   * already on the page treated as taken, so a spare is never a near-duplicate of a row
   * it might be swapped in beside.
   */
  bench: Pick[];
  because: { seed: Item; items: Pick[] }[];
  leavingSoon: Item[];
  profile: Profile;
  candidates: number;
  /** When the reserved seats next move on, so the page can say so out loud. */
  rotation: { hours: number; nextAt: Date };
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
function selectDiverse(ranked: Entry[], corpus: Corpus, count: number, reserved: Entry[] = []): Entry[] {
  const pool = ranked.slice(0, RECOMMEND.candidatePool);
  const best = pool[0]?.score ?? 1;
  const chosen: Entry[] = [];
  const taken = new Set(reserved.map((entry) => entry.item.id));
  const perSource = new Map<string, number>();
  const perTopic = new Map<string, number>();

  // The reserved seats are already on the page, so they count against the caps and they
  // count as competition for the novelty term. Skip this and a news seat plus four
  // ranked community picks is five items from one lane.
  const against: Entry[] = [...reserved];
  for (const entry of reserved) {
    perSource.set(entry.item.sourceId, (perSource.get(entry.item.sourceId) ?? 0) + 1);
    perTopic.set(entry.item.topic, (perTopic.get(entry.item.topic) ?? 0) + 1);
  }

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
        for (const picked of against) {
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
    against.push(winner);
    chosen.push(winner);
  }

  return chosen;
}

/**
 * Guarantee every lane a seat. The caps stop one lane dominating; they do nothing to stop
 * a lane vanishing, and a recommender quietly dropping a whole subject is the first
 * visible symptom of the loop the reserved seats exist to break.
 *
 * The weakest pick from the most over-represented lane gives up its slot. The lead is
 * never touched: it is the page's editorial statement and it earned its place.
 */
function enforceTopicFloor(chosen: Entry[], reserved: Entry[], pool: Entry[]): Entry[] {
  const out = [...chosen];
  const counts = new Map<string, number>();
  for (const entry of [...reserved, ...out]) {
    counts.set(entry.item.topic, (counts.get(entry.item.topic) ?? 0) + 1);
  }

  for (const topic of TOPICS) {
    if ((counts.get(topic) ?? 0) >= RECOMMEND.minPerTopic) continue;
    const replacement = pool.find(
      (entry) => entry.item.topic === topic && !out.some((picked) => picked.item.id === entry.item.id),
    );
    if (!replacement) continue;

    // Walking backwards finds the weakest pick first, since `out` is score-ordered.
    let loser: Entry | undefined;
    let victim = -1;
    let victimCount: number = RECOMMEND.minPerTopic;
    for (let i = out.length - 1; i >= 1; i--) {
      const entry = out[i];
      if (!entry) continue;
      const count = counts.get(entry.item.topic) ?? 0;
      if (count > victimCount) {
        victimCount = count;
        victim = i;
        loser = entry;
      }
    }
    if (victim < 0 || !loser) continue;

    counts.set(loser.item.topic, (counts.get(loser.item.topic) ?? 0) - 1);
    out[victim] = replacement;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  return out;
}

/**
 * Is this item effectively a repeat of one already seated? The reserved seats bypass the
 * ranking, so they bypass MMR with it, and two aggregators carrying the same story is the
 * normal case rather than an edge one.
 */
function tooSimilar(item: Item, chosen: Item[], corpus: Corpus): boolean {
  const vector = corpus.vectors.get(item.id);
  if (!vector) return false;
  for (const other of chosen) {
    const otherVector = corpus.vectors.get(other.id);
    if (otherVector && cosine(vector, otherVector) >= RECOMMEND.maxSeatSimilarity) return true;
  }
  return false;
}

/**
 * The news quota. Which SOURCES hold the seats rotates, rather than which items: taking
 * the two best community items would mean Hacker News and Lobsters every single time,
 * because Slashdot's ceiling sits below their floor. Rotating the sources puts each of
 * the three on the page two epochs in every three.
 */
function pickNews(candidates: Item[], corpus: Corpus, epoch: number): Item[] {
  const bySource = new Map<string, Item[]>();
  for (const item of candidates) {
    if (item.topic !== RECOMMEND.news.topic) continue;
    const list = bySource.get(item.sourceId);
    if (list) list.push(item);
    else bySource.set(item.sourceId, [item]);
  }

  // Sorted so the rotation is a function of the clock alone, never of row order.
  const sources = [...bySource.keys()].sort();
  const picked: Item[] = [];
  for (const source of rotate(sources, RECOMMEND.news.slots, epoch)) {
    const best = (bySource.get(source) ?? [])
      .slice()
      .sort((a, b) => b.renderScore - a.renderScore)
      .slice(0, RECOMMEND.news.perSourcePool);
    if (best.length === 0) continue;
    // Rotate within the source as well, so a seat shows that source's news rather than
    // its one highest-scoring story over and over. Walking forward from the rotated
    // offset also gives somewhere to go when the first choice duplicates another seat.
    const order = best.map((_, k) => best[(epoch + k) % best.length]!);
    const item = order.find((candidate) => !tooSimilar(candidate, picked, corpus)) ?? order[0]!;
    picked.push(item);
  }
  return picked;
}

/**
 * The experimentation window: the strongest items the profile has no vocabulary for,
 * rotated so the reader eventually sees the whole pool rather than the same two articles
 * until they age out.
 */
function pickExplore(
  candidates: Item[],
  corpus: Corpus,
  profile: Profile,
  seated: Item[],
  epoch: number,
): Seat[] {
  const exclude = new Set(seated.map((item) => item.id));
  let bestScore = 0;
  for (const item of candidates) if (item.renderScore > bestScore) bestScore = item.renderScore;
  const floor = bestScore * RECOMMEND.explore.minScoreRatio;

  const pool = candidates
    .filter(
      (item) =>
        !exclude.has(item.id) &&
        item.renderScore >= floor &&
        // The aggregator lane has its own quota two seats up. Letting it into this pool
        // as well put four community items on a twelve-item page in testing.
        item.topic !== RECOMMEND.news.topic,
    )
    .map((item) => {
      const vector = corpus.vectors.get(item.id);
      return { item, novelty: vector ? novelty(vector, profile.vector) : 1 };
    })
    .filter((seat) => seat.novelty >= RECOMMEND.explore.minNovelty)
    // Ranked by editorial score, GATED on novelty -- see the note in the config. An
    // unfamiliar subject still has to arrive attached to an article worth reading.
    .sort((a, b) => b.item.renderScore - a.item.renderScore)
    .slice(0, RECOMMEND.explore.pool);
  if (pool.length === 0) return [];

  // Walk the pool from this epoch's offset, skipping anything that repeats a seat
  // already taken -- including the news seats, which were drawn first.
  const order = pool.map((_, k) => pool[(epoch * RECOMMEND.explore.slots + k) % pool.length]!);
  const seats: Seat[] = [];
  for (const seat of order) {
    if (seats.length >= RECOMMEND.explore.slots) break;
    const against = [...seated, ...seats.map((taken) => taken.item)];
    if (tooSimilar(seat.item, against, corpus)) continue;
    seats.push(seat);
  }
  return seats;
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

  const epoch = epochOf(now, RECOMMEND.rotateHours);

  // Reserved seats are drawn FIRST, so merit ranking fills what is left rather than the
  // other way round. A quota that only applies when the ranking happens to leave room is
  // not a quota, and it is the ranking that the feedback loop runs through.
  const newsSeats = pickNews(candidates, corpus, epoch);
  const exploreSeats = pickExplore(candidates, corpus, profile, newsSeats, epoch);
  const held = new Set([...newsSeats, ...exploreSeats.map((seat) => seat.item)].map((item) => item.id));

  const scored = candidates
    .filter((item) => !held.has(item.id))
    .map((item) => {
      const vector = corpus.vectors.get(item.id);
      const affinity = vector && profile.vector.size > 0 ? cosine(vector, profile.vector) : 0;
      const tilt = 1 + RECOMMEND.affinityBoost * affinity * profile.confidence;
      return { item, score: item.renderScore * tilt, affinity };
    })
    .sort((a, b) => b.score - a.score);

  const explain = (entry: Entry): Pick => {
    const vector = corpus.vectors.get(entry.item.id);
    const reason: Reason =
      entry.affinity >= RECOMMEND.minAffinity && vector
        ? { kind: 'affinity', terms: sharedTerms(vector, profile.vector, corpus, 3) }
        : editorialReason(entry.item);
    return { ...entry, reason };
  };

  // Each reserved pick, with the rank it would like and its place in its own quota.
  const reserved: { pick: Pick; positions: readonly number[]; order: number }[] = [
    ...newsSeats.map((item, order) => ({
      pick: {
        item,
        score: item.renderScore,
        affinity: 0,
        reason: { kind: 'news' as const, label: 'News seat' },
      },
      positions: RECOMMEND.news.positions,
      order,
    })),
    ...exploreSeats.map((seat, order) => ({
      pick: {
        item: seat.item,
        score: seat.item.renderScore,
        affinity: 0,
        reason: {
          kind: 'explore' as const,
          label: `New ground \u00b7 ${Math.round(seat.novelty * 100)}%`,
        },
      },
      positions: RECOMMEND.explore.positions,
      order,
    })),
  ];
  const reservedEntries: Entry[] = reserved.map((seat) => ({
    item: seat.pick.item,
    score: seat.pick.score,
    affinity: 0,
  }));

  // One slot for the lead plus `picks` for the column, less whatever the quotas hold.
  const meritCount = Math.max(1, RECOMMEND.picks + 1 - reserved.length);
  const merit = enforceTopicFloor(
    selectDiverse(scored, corpus, meritCount, reservedEntries),
    reservedEntries,
    scored,
  );

  const strongest = merit[0];
  const lead = strongest ? explain(strongest) : null;
  const ranked = merit.slice(1).map(explain);

  // Weave the reserved seats into the column at their configured ranks. Spread through
  // the list rather than parked in a band at the bottom: a seat nobody scrolls to
  // gathers no feedback, and feedback is the entire reason the seat exists.
  const column: (Pick | null)[] = new Array(RECOMMEND.picks).fill(null);
  for (const { pick, positions, order } of reserved) {
    const wanted = positions[order];
    if (wanted === undefined) continue;
    // `positions` are overall ranks and the lead is rank 1, so the column starts at 2.
    const index = Math.min(Math.max(wanted, 2), RECOMMEND.picks + 1) - 2;
    const slot = column[index] === null ? index : column.indexOf(null);
    if (slot >= 0) column[slot] = pick;
  }
  let nextRanked = 0;
  for (let i = 0; i < column.length; i++) {
    if (column[i] === null) column[i] = ranked[nextRanked++] ?? null;
  }

  const picks = column.filter((pick): pick is Pick => pick !== null);
  const shown = new Set([...(lead ? [lead.item.id] : []), ...picks.map((p) => p.item.id)]);

  // Spares for the rotate button. Passing everything already chosen as `reserved` both
  // excludes it and keeps it in the diversity arithmetic, so a spare cannot be the fifth
  // account of a story already on the page.
  const seated: Entry[] = [...merit, ...reservedEntries];
  const bench = selectDiverse(scored, corpus, RECOMMEND.bench, seated).map(explain);
  for (const spare of bench) shown.add(spare.item.id);

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
    lead,
    picks,
    bench,
    because,
    leavingSoon,
    profile,
    candidates: candidates.length,
    rotation: {
      hours: RECOMMEND.rotateHours,
      nextAt: new Date((epoch + 1) * RECOMMEND.rotateHours * 3_600_000),
    },
  };
}
