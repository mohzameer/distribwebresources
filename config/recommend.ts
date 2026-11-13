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

  /**
   * The lead story plus this many ranked picks.
   *
   * Nineteen rather than eleven because the page was too thin to carry a quota: at
   * twelve rows, giving the aggregators a quarter of the page meant three of the twelve
   * best engineering articles losing their slot. A longer page buys the density to do
   * both. `columnPicks` decides where it breaks over two blocks.
   */
  picks: 19,
  /**
   * How many picks sit in the narrow column beside the lead. The rest continue below in
   * two columns, because a column long enough to hold nineteen rows leaves most of the
   * lead's half of the grid empty.
   */
  columnPicks: 7,

  /**
   * Spare picks, computed in the same render and shipped with the page so the rotate
   * button can swap a row without a round trip.
   *
   * This is why rotation is instant and costs nothing: the whole point of the ISR cache
   * here is that a page view touches Postgres zero times, and Neon's free compute
   * auto-suspends when idle. A server action per click would wake it every time and
   * undo that. The bench refills on the next render.
   *
   * Sized against the page: at twenty visible rows, ten spares ran out after rotating
   * half of them, so it rises with `picks` rather than staying at the count that suited
   * a twelve-row page.
   */
  bench: 16,
  /**
   * Diversity caps, enforced during selection rather than after it. Both rise with the
   * page: holding `maxPerTopic` at 4 across twenty rows plus a ten-deep bench would
   * leave the later selections unable to fill at all, since five lanes x 4 is thirty
   * items and the page and bench together want thirty.
   */
  maxPerSource: 3,
  maxPerTopic: 7,
  /**
   * ...and a floor. Five topics, twenty slots and a cap of seven means three lanes can
   * legally own the entire page. This guarantees every lane a seat, which is the
   * difference between a newspaper and a mirror.
   */
  minPerTopic: 1,

  /**
   * RESERVED SEATS, and why they have to exist.
   *
   * Everything above ranks by merit, and merit is exactly where a feedback loop starts:
   * the profile is built only from what you clicked, and you can only click what the
   * page showed you. Left alone that closes -- the ranking narrows, a narrower page
   * produces narrower clicks, and the recommender ends up extremely confident about a
   * shrinking slice of the world. Nothing in the arithmetic above can notice this
   * happening, because from the inside it looks like improving relevance.
   *
   * The aggregator lane also cannot win a seat on merit even today. Measured over the
   * live window: the best Hacker News item scores 3.6, the best Lobsters item 3.0 and
   * the best Slashdot item 1.5, against 6.9 for the best item on the page. Slashdot
   * carries a -1 source weight, the community half-life is 24h, and consumer-tech news
   * matches none of the topic keywords. News does not rank badly here; it cannot rank at
   * all. A quota is the only thing that will ever put it in front of you.
   */
  news: {
    /** This lane is exactly the three aggregators: Hacker News, Lobsters, Slashdot. */
    topic: 'community',
    /**
     * Five of twenty rows, up from two of twelve. With only three aggregators this is
     * more seats than sources, so the quota round-robins: the sources cycle and each one
     * hands over its next story when its turn comes round again.
     */
    slots: 5,
    /**
     * Overall ranks on the page; the lead is rank 1. Spread the length of the ranking
     * rather than parked in a band at the bottom, because a seat nobody scrolls to
     * gathers no feedback, and feedback is the entire reason the seat exists. Two of
     * these land in the column beside the lead, so the density is visible before any
     * scrolling at all.
     */
    positions: [3, 7, 11, 15, 19],
    /**
     * The seat also rotates through each source's top few, not just its single best
     * item. Without this, Slashdot's seat showed the same story every time its turn came
     * round, which is a quota being filled rather than news being read. Deep enough that
     * a source can fill two seats in one edition and still have somewhere to go when a
     * story duplicates one already seated.
     */
    perSourcePool: 6,
  },

  /**
   * The experimentation window: seats that go to whatever the profile has the least
   * vocabulary for, so there is always something on the page capable of teaching the
   * engine something it does not already believe. Open one and it becomes an ordinary
   * seed, which is how a new subject gets into the fold instead of being locked out for
   * never having been shown.
   */
  explore: {
    slots: 3,
    /** Overall ranks, as above. */
    positions: [5, 13, 20],
    /**
     * Novelty is the share of an article's vector weight sitting on terms the profile
     * has no weight for at all -- "how much of this is about something you have never
     * read about". Cosine affinity cannot do this job: over the live window it runs 0.00
     * to 0.13 with a median of 0.02, so filtering for LOW affinity selects nothing in
     * particular. Novelty runs 0.42 to 1.00.
     *
     * It is a GATE, not the ranking. With a young profile novelty saturates -- the median
     * item scores 0.93, because a centroid built from a dozen articles is unfamiliar with
     * nearly everything -- so sorting by it just ranks by how obscure an article's
     * vocabulary is, which is how "v1.33.0-167.2" and "The Utah Teapot" took seats in
     * testing. The pool is ranked by editorial score instead, and novelty decides who is
     * allowed into it.
     */
    minNovelty: 0.75,
    /** Unfamiliar is no excuse for weak: a seat still needs this share of the best score. */
    minScoreRatio: 0.45,
    /**
     * Small on purpose. Rotation walks the pool two at a time, so a pool of 20 is ten
     * epochs -- five days -- before anything repeats, and every one of those twenty is an
     * article strong enough to have been a contender anyway. A deeper pool just means the
     * back half of it is filler.
     */
    pool: 20,
  },

  /**
   * How often the reserved seats move on.
   *
   * Without rotation the experiment is static: the same two unfamiliar articles sit
   * there until they age out of the window, and a seat you have already decided against
   * is a wasted seat. Rotating walks the whole pool past you over a couple of weeks.
   *
   * Epochs are anchored to the Unix epoch, so at twelve hours they fall at 00:00 and
   * 12:00 UTC -- 05:30 and 17:30 in Asia/Colombo, about twenty-five minutes before each
   * ingest run. A rotation therefore lands next to a new batch of articles rather than
   * reshuffling a page you are halfway through reading.
   *
   * This is the only time-dependent thing here besides recency decay, and it is
   * deterministic in the same way: the page is a pure function of the window and the
   * clock, so every render inside the same twelve hours is identical.
   */
  rotateHours: 12,

  /**
   * Reserved seats skip the ranking, and therefore skip maximal marginal relevance along
   * with it -- so nothing stops two quotas spending their slots on the same story. They
   * did exactly that on the first run: Slashdot and Hacker News both led with "Jensen
   * Huang said to have had relationship with executive who reports to him", at ranks 4
   * and 9 of twelve. Above this cosine a seat moves down to its source's next story.
   */
  maxSeatSimilarity: 0.35,

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
