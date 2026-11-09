/**
 * Every knob of the recommender in one place, in the same spirit as `scoring.ts`.
 *
 * There is no model here and no API call. The whole thing is 1960s information
 * retrieval -- TF-IDF vectors, cosine similarity, a Rocchio centroid of what you kept,
 * and maximal marginal relevance for diversity -- run over the ~1000 rows that are
 * already in memory for the page render. That is a deliberate choice, not a compromise:
 *
 *   - Collaborative filtering ("readers like you also read") is meaningless on a
 *     single-user site. There is no "users like you".
 *   - A hosted recommendations API would mean paying for it, shipping the catalogue and
 *     a click stream to a third party, and getting back a score nobody can explain.
 *   - Every number below is explicable, so every row on the page can state WHY it is
 *     there. That is the feature, not a consolation prize.
 *
 * The one honest weakness is cold start, and it is handled by `confidenceSeeds` rather
 * than hidden: the personal signal is scaled by how much feedback actually exists, so a
 * profile built from three clicks tilts the page by a few percent instead of taking it
 * over. It strengthens on its own as you read.
 */
export const RECOMMEND = {
  /** A keyword in the title says more about an article than one in the summary. */
  titleWeight: 2,
  summaryWeight: 1,
  /** "s3", "k8s" and "go" matter; single characters never do. */
  minTokenLength: 2,

  /**
   * How the taste profile is built. Saving something is a much louder signal than
   * opening it, so it counts for three times as much.
   */
  savedSeedWeight: 3,
  readSeedWeight: 1,
  /** Only the most recent seeds, so a profile tracks what you read *now*. */
  maxProfileSeeds: 40,

  /**
   * Feedback needed before the personal signal is trusted at full strength. Below it the
   * tilt is scaled linearly, so the page degrades to plain editorial ranking when there
   * is nothing to learn from instead of amplifying three accidental clicks.
   */
  confidenceSeeds: 25,

  /**
   * Personal affinity MULTIPLIES the editorial score rather than replacing it:
   *
   *   score = renderScore * (1 + affinityBoost * cosine(profile, item) * confidence)
   *
   * So a perfect topical match on a fully-trained profile is worth 2.5x, and a mediocre
   * article about your favourite subject still cannot outrank a genuinely excellent one.
   */
  affinityBoost: 1.5,
  /** Below this cosine the match is noise and the row explains itself editorially. */
  minAffinity: 0.04,

  /**
   * Maximal marginal relevance. 1.0 ranks purely by score and will happily show you five
   * write-ups of the same outage; 0 ranks purely by novelty. 0.72 keeps the strongest
   * items while refusing near-duplicates.
   */
  lambda: 0.72,
  /** MMR is O(pool x picks); the pool is capped so the page stays sub-millisecond. */
  candidatePool: 150,

  /** The lead story plus this many ranked picks. */
  picks: 11,
  /** Diversity floors, enforced during selection rather than after it. */
  maxPerSource: 2,
  maxPerTopic: 4,

  /** "Because you saved X" blocks. */
  because: {
    seeds: 2,
    items: 4,
    /**
     * Nearest neighbours of one article are very often four posts from the same vendor
     * blog -- it writes about one subject all week, so its posts are each other's closest
     * matches. Capping the block keeps it a recommendation rather than a feed.
     */
    maxPerSource: 2,
    /** Under this cosine there is no honest "because", so the block is dropped. */
    minSimilarity: 0.07,
  },

  /** Strong, still unread, and about to be deleted by the 30-day prune. */
  leavingSoon: {
    withinDays: 5,
    count: 6,
  },

  /** Terms shown in the profile strip, so the engine's state is always visible. */
  profileTerms: 9,
} as const;
