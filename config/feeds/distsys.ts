import type { FeedInput } from './types';

export const distsysFeeds: FeedInput[] = [
  { id: 'allthingsdistributed', name: 'All Things Distributed (Werner Vogels)', topic: 'distsys', url: 'https://www.allthingsdistributed.com/atom.xml', homepage: 'https://www.allthingsdistributed.com/', expectCadenceDays: 60, slow: true },
  { id: 'brooker', name: 'Marc Brooker', topic: 'distsys', url: 'https://brooker.co.za/blog/rss.xml', homepage: 'https://brooker.co.za/blog/', expectCadenceDays: 45 },
  { id: 'muratbuffalo', name: 'Metadata (Murat Demirbas)', topic: 'distsys', url: 'https://muratbuffalo.blogspot.com/feeds/posts/default', homepage: 'https://muratbuffalo.blogspot.com/', expectCadenceDays: 21 },
  { id: 'aphyr', name: 'Aphyr / Jepsen', topic: 'distsys', url: 'https://aphyr.com/posts.atom', homepage: 'https://aphyr.com/', expectCadenceDays: 90, slow: true },
  { id: 'danluu', name: 'Dan Luu', topic: 'distsys', url: 'https://danluu.com/atom.xml', homepage: 'https://danluu.com/', expectCadenceDays: 60, slow: true, notes: '6.6 MB feed document: relies on the fetcher response-size cap.' },
  { id: 'kleppmann', name: 'Martin Kleppmann', topic: 'distsys', url: 'https://martin.kleppmann.com/feed.rss', homepage: 'https://martin.kleppmann.com/', expectCadenceDays: 180, slow: true },
  { id: 'surfingcomplexity', name: 'Surfing Complexity', topic: 'distsys', url: 'https://surfingcomplexity.blog/feed/', homepage: 'https://surfingcomplexity.blog/', expectCadenceDays: 45 },
  { id: 'decentralizedthoughts', name: 'Decentralized Thoughts', topic: 'distsys', url: 'https://decentralizedthoughts.github.io/feed.xml', homepage: 'https://decentralizedthoughts.github.io/', expectCadenceDays: 45 },
  { id: 'warpstream', name: 'WarpStream', topic: 'distsys', url: 'https://www.warpstream.com/blog/rss.xml', homepage: 'https://www.warpstream.com/blog', expectCadenceDays: 30 },
  { id: 'eli-bendersky', name: 'Eli Bendersky', topic: 'distsys', url: 'https://eli.thegreenplace.net/feeds/all.atom.xml', homepage: 'https://eli.thegreenplace.net/', expectCadenceDays: 45 },
  { id: 'transactional-blog', name: 'The Transactional Blog', topic: 'distsys', url: 'https://transactional.blog/feed.xml', homepage: 'https://transactional.blog/', expectCadenceDays: 120, slow: true },
  { id: 'smalldatum', name: 'Small Datum', topic: 'distsys', url: 'https://smalldatum.blogspot.com/feeds/posts/default', homepage: 'https://smalldatum.blogspot.com/', expectCadenceDays: 90, slow: true },
  { id: 'infoq', name: 'InfoQ', topic: 'distsys', url: 'https://feed.infoq.com/', homepage: 'https://www.infoq.com/', expectCadenceDays: 3, cap: 3 },
  { id: 'bytebytego', name: 'ByteByteGo', topic: 'distsys', url: 'https://blog.bytebytego.com/feed', homepage: 'https://blog.bytebytego.com/', expectCadenceDays: 10 },
  { id: 'pragmaticengineer', name: 'The Pragmatic Engineer', topic: 'distsys', url: 'https://newsletter.pragmaticengineer.com/feed', homepage: 'https://newsletter.pragmaticengineer.com/', expectCadenceDays: 10 },
  {
    id: 'arxiv-cs-dc',
    name: 'arXiv cs.DC',
    topic: 'distsys',
    // The RSS feed declares skipDays for Sat/Sun and returns ZERO items on weekends, so we
    // use the API query endpoint instead. max_results=100 because cs.DC runs 20-40
    // submissions on a weekday and 25 would clip.
    url: 'https://export.arxiv.org/api/query?search_query=cat:cs.DC&sortBy=submittedDate&sortOrder=descending&max_results=100',
    homepage: 'https://arxiv.org/list/cs.DC/recent',
    kind: 'arxiv',
    expectCadenceDays: 3,
    cap: 3,
    // On-topic by definition but 20-40 papers/weekday, so require at least one keyword hit
    // (baseline 2 + a summary hit of w>=2). Without this we would store ~100 rows/day of
    // which only 3 are ever rendered.
    minScore: 4,
  },
];
