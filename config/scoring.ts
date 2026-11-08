/**
 * Every scoring knob in one place. Imported by BOTH the ingest script (to compute the
 * stored, time-independent `base_score` and to apply hard drops) and the web app (to apply
 * recency decay and per-source caps at render time). One implementation, two call sites,
 * so the page and the ingester can never disagree.
 *
 *   base_score  = sum(keyword hits, capped) + sourceWeight + signals - softPenalties
 *   hardDrop    = any noise rule with drop:true, or base_score < minStoreScore
 *   renderScore = base_score * max(floor, 2 ** (-ageHours / halfLife[topic]))
 */

export type Topic = 'aws' | 'devops' | 'distsys' | 'engblogs' | 'community';

/**
 * Lane order on the page, in the order the topics were asked for. Reorder this one line to
 * change the page. Community is last deliberately: it is the least targeted lane.
 */
export const TOPICS: readonly Topic[] = ['devops', 'distsys', 'aws', 'engblogs', 'community'];

export const TOPIC_LABELS: Record<Topic, string> = {
  aws: 'AWS',
  devops: 'DevOps & Cloud Native',
  distsys: 'Distributed Systems',
  engblogs: 'Engineering Blogs',
  community: 'Community',
};

type KeywordRule = { re: RegExp; w: number; topics: readonly (Topic | '*')[] };
type NoiseRule = { re: RegExp; w?: number; drop?: true; why: string };

export const SCORING = {
  /** Bump when weights change; stored on each row so you can tell old scores from new. */
  version: 1,

  /**
   * Recency half-life in hours, per lane. This is the setting that makes one mechanism
   * serve both a firehose and a slow blog: AWS decays fast so the lane shows "today",
   * engineering blogs decay slowly so the lane shows "the best of the past fortnight".
   */
  halfLifeHours: {
    aws: 18,
    devops: 60,
    distsys: 120,
    engblogs: 144,
    community: 24,
  } as Record<Topic, number>,

  /** Never let decay reach zero, or old-but-excellent items vanish entirely. */
  recencyFloor: 0.03,

  /**
   * Floor on the STORED score. renderScore is base_score * recency, which only behaves
   * monotonically while base_score is positive: at exactly 0 every item ties forever and
   * recency stops mattering, and below 0 an item would *improve* as it aged. Anything
   * genuinely unwanted is removed by the noise rules, not by arithmetic.
   */
  scoreFloor: 0.5,

  /**
   * Every item starts here. Without a baseline, `minStoreScore` would throw away any
   * perfectly good post that happens to match no keyword -- e.g. a Dropbox write-up whose
   * title mentions none of our terms -- because its score would be 0. With it, the
   * threshold only removes things that earned a NET PENALTY (hiring posts, roundups).
   */
  baseline: 3,

  titleWeight: 2, // a keyword in the title counts double one in the summary
  summaryWeight: 1,
  keywordCap: 14, // ceiling on total keyword contribution

  /**
   * Storage floor, checked against a score that EXCLUDES sourceWeight -- a source weight is
   * a ranking preference, not a judgement about whether an item is worth keeping. Letting
   * it gate storage meant `aws-whats-new` (-2) dropped 92 of 100 items in testing.
   *
   * At 0, this removes only items that earned a NET PENALTY from the noise rules: hiring
   * posts (-6), roundups (-3), "Ask HN" (-4). A title-only item (-1 for no summary) is
   * kept, which matters because Lobsters and several Atom feeds give titles with no
   * description at all.
   */
  minStoreScore: 0,

  /**
   * Backstop on how many items one feed may contribute per run, newest first. Some feeds
   * are enormous archives rather than news: Vercel's atom has 2135 entries, Temporal 454,
   * Shopify 437. The TTL filter already removes anything older than the retention window;
   * this guards against a feed that dumps hundreds of items inside it.
   */
  maxItemsPerRun: 60,

  keywords: [
    // --- distributed systems core ---
    { re: /\b(raft|paxos|consensus|linearizab\w*|crdt|lamport|vector clocks?)\b/i, w: 4, topics: ['distsys', 'engblogs'] },
    { re: /\b(exactly.?once|idempoten\w+|two.phase commit|2pc|saga pattern|quorum)\b/i, w: 4, topics: ['distsys', 'engblogs'] },
    { re: /\b(consistency model|eventual consistency|split.?brain|clock skew|fencing token)\b/i, w: 4, topics: ['distsys'] },
    { re: /\b(sharding|replication lag|multi.?region|failover|partition tolerance|leader election)\b/i, w: 3, topics: ['distsys', 'engblogs', 'devops'] },

    // --- scale and architecture war stories ---
    { re: /\b(scaled? (?:up |down )?(?:to|from)|\d+\s?(?:million|billion|trillion)\s+(?:requests|queries|qps|rps|events|users|rows|messages))\b/i, w: 4, topics: ['*'] },
    { re: /\b(migrat\w+ (?:from|to)|re.?architect\w*|rewrote|rebuilt|lessons learned)\b/i, w: 3, topics: ['engblogs', 'devops', 'distsys'] },
    // "how we" / "what we learned" appear on genuine war stories AND on company-culture
    // posts, so they are a weak signal, not a strong one.
    { re: /\b(how we|what we learned|why we)\b/i, w: 1, topics: ['engblogs', 'devops', 'distsys'] },
    { re: /\b(postmortem|post.mortem|incident (?:review|report)|root cause|outage|degradation)\b/i, w: 4, topics: ['*'] },

    // --- devops / platform ---
    { re: /\b(kubernetes|k8s)\b/i, w: 3, topics: ['devops', 'engblogs'] },
    { re: /\b(ebpf|cilium|service mesh|istio|envoy)\b/i, w: 3, topics: ['devops'] },
    { re: /\b(terraform|opentofu|pulumi|crossplane)\b/i, w: 3, topics: ['devops'] },
    { re: /\b(observability|opentelemetry|otel|slos?|error budget|tracing)\b/i, w: 3, topics: ['devops', 'engblogs'] },
    { re: /\b(platform engineering|sre|gitops|ci\/cd|progressive delivery)\b/i, w: 3, topics: ['devops'] },

    // --- AWS: real use cases and genuinely new primitives, not release notes ---
    { re: /\b(graviton|nitro|firecracker|snapstart|aurora dsql|s3 express|dynamodb streams)\b/i, w: 4, topics: ['aws'] },
    { re: /\b(well.architected|reference architecture|cost optimi[sz]ation|landing zone)\b/i, w: 4, topics: ['aws'] },
    { re: /\b(serverless|event.driven|step functions|eventbridge)\b/i, w: 2, topics: ['aws', 'devops'] },

    // --- generic quality signals ---
    { re: /\b(architecture|case study|deep.?dive|internals|under the hood|how .{0,20}works)\b/i, w: 2, topics: ['*'] },
    { re: /\b(benchmark|performance (?:analysis|regression)|profiling|optimi[sz]ation)\b/i, w: 2, topics: ['*'] },
  ] as readonly KeywordRule[],

  noise: [
    // ===== hard drops: never stored. This is what actually keeps the DB lean. =====
    // The AWS flood. Region expansions are the bulk of What's New volume.
    { re: /\bis now available in (?:the )?[A-Z][\w .,'()-]*\bRegion\b/i, drop: true, why: 'aws-region-expansion' },
    { re: /\b(?:now available|expands?|is available|launches) in (?:\d+|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) (?:additional|new|more)?\s*(?:aws )?regions?\b/i, drop: true, why: 'aws-region-expansion' },
    { re: /\bAWS (?:GovCloud|China) \(/i, drop: true, why: 'aws-partition-notice' },
    { re: /\bnow available in (?:the )?[\w .,'()-]*\b(?:Local Zone|Availability Zone)s?\b/i, drop: true, why: 'aws-zone-expansion' },
    { re: /\b(?:now supports|adds support for) (?:an )?additional instance (?:type|size)s?\b/i, drop: true, why: 'aws-instance-type' },
    // Marketing.
    { re: /\b(?:webinar|register now|join us (?:for|at)|save the date|watch the replay|on.demand session)\b/i, drop: true, why: 'marketing' },
    { re: /\[sponsored\]|\bsponsored (?:post|content)\b/i, drop: true, why: 'sponsored' },
    // Pre-release churn from GitHub release feeds: 3 of the 4 newest k8s entries were these.
    { re: /-(?:alpha|beta|rc|pre)[.\d]*$/i, drop: true, why: 'prerelease' },
    { re: /\bnightly\b|\bsnapshot build\b/i, drop: true, why: 'prerelease' },

    // ===== soft penalties =====
    { re: /\b(?:we(?:'re| are) hiring|join our team|now hiring|open roles?)\b/i, w: -6, why: 'hiring' },
    { re: /\bAsk HN:/i, w: -4, why: 'ask-hn' },
    { re: /\b(?:partner|marketplace|competency|certification|training course)\b/i, w: -3, why: 'partner' },
    { re: /\b(?:roundup|week in review|this week in|newsletter #?\d+|weekly digest)\b/i, w: -3, why: 'roundup' },
    // Community/event write-ups match "here's what we learned" and were topping the DevOps
    // lane ahead of actual engineering content.
    { re: /\b(?:meetup|conference recap|kubecon|re:invent) recap\b|\b(?:community|sustainability|diversity) (?:month|day|week)\b|\bwe organi[sz]ed\b/i, w: -10, why: 'event-recap' },
    { re: /\bShow HN:/i, w: -2, why: 'show-hn' },
    { re: /\b(?:price reduction|new pricing|price cut)\b/i, w: -2, why: 'pricing' },
    { re: /\b(?:happy new year|year in review|holiday)\b/i, w: -2, why: 'seasonal' },
  ] as readonly NoiseRule[],

  /**
   * Additive trust. A negative weight here is how you stop a high-volume source
   * dominating a lane without dropping it entirely.
   */
  sourceWeight: {
    'aws-whats-new': -2,
    'aws-architecture': 2,
    'arxiv-cs-dc': -1,
    'netflix-techblog': 4,
    'meta-engineering': 3,
    'cloudflare-blog': 3,
    'brooker': 4,
    'allthingsdistributed': 3,
    'aphyr': 3,
    'muratbuffalo': 2,
    'danluu': 2,
    'kleppmann': 3,
    'hn-top': 0,
    'lobsters': -1,
  } as Record<string, number>,

  signals: {
    /** HN points as a weak quality prior, log-scaled so 5000 points isn't 50x 100 points. */
    hnPoints: (p: number) => Math.min(5, Math.max(0, Math.log2(p / 50))),
    /** Longform (summary > 1200 chars) tends to be the deep-dive you actually want. */
    longformBonus: 1,
    longformChars: 1200,
    /** A title with no summary at all is unscannable. */
    noSummaryPenalty: -1,
  },

  caps: {
    /** Max items per source within a lane, applied at RENDER time so retuning is free. */
    perSource: { default: 4, 'aws-whats-new': 5, 'hn-top': 6, 'lobsters': 4, 'arxiv-cs-dc': 3 } as Record<string, number>,
    /** Visible per lane; the rest sit behind a <details> with no JavaScript. */
    perLane: 12,
    perLaneMax: 40,
  },
} as const;

/** Recency multiplier applied at render time. */
export function recency(ageHours: number, topic: Topic): number {
  const halfLife = SCORING.halfLifeHours[topic] ?? 48;
  return Math.max(SCORING.recencyFloor, Math.pow(2, -Math.max(0, ageHours) / halfLife));
}
