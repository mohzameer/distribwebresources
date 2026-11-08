import type { FeedInput } from './types';

export const engblogFeeds: FeedInput[] = [
  { id: 'netflix-techblog', name: 'Netflix Tech Blog', topic: 'engblogs', url: 'https://netflixtechblog.com/feed', homepage: 'https://netflixtechblog.com/', sourceGroup: 'netflix', expectCadenceDays: 30, notes: 'Medium-hosted: only the latest 10 items are exposed.' },
  { id: 'meta-engineering', name: 'Engineering at Meta', topic: 'engblogs', url: 'https://engineering.fb.com/feed/', homepage: 'https://engineering.fb.com/', expectCadenceDays: 21 },
  { id: 'cloudflare-blog', name: 'Cloudflare', topic: 'engblogs', url: 'https://blog.cloudflare.com/rss/', homepage: 'https://blog.cloudflare.com/', expectCadenceDays: 5, cap: 3, notes: 'Sends no cache validator at all; relies on the body-hash fallback.' },
  { id: 'dropbox', name: 'Dropbox Tech', topic: 'engblogs', url: 'https://dropbox.tech/feed', homepage: 'https://dropbox.tech/', expectCadenceDays: 45 },
  { id: 'stripe', name: 'Stripe', topic: 'engblogs', url: 'https://stripe.com/blog/feed.rss', homepage: 'https://stripe.com/blog', expectCadenceDays: 30 },
  { id: 'shopify', name: 'Shopify Engineering', topic: 'engblogs', url: 'https://shopify.engineering/blog.atom', homepage: 'https://shopify.engineering/', expectCadenceDays: 30 },
  { id: 'spotify', name: 'Spotify Engineering', topic: 'engblogs', url: 'https://engineering.atspotify.com/feed/', homepage: 'https://engineering.atspotify.com/', expectCadenceDays: 45 },
  { id: 'github-blog', name: 'GitHub Engineering', topic: 'engblogs', url: 'https://github.blog/engineering/feed/', homepage: 'https://github.blog/engineering/', expectCadenceDays: 21 },
  { id: 'pinterest', name: 'Pinterest Engineering', topic: 'engblogs', url: 'https://medium.com/feed/pinterest-engineering', homepage: 'https://medium.com/pinterest-engineering', expectCadenceDays: 30 },
  { id: 'discord', name: 'Discord', topic: 'engblogs', url: 'https://discord.com/blog/rss.xml', homepage: 'https://discord.com/blog', expectCadenceDays: 30 },
  { id: 'airbnb', name: 'Airbnb Engineering', topic: 'engblogs', url: 'https://medium.com/feed/airbnb-engineering', homepage: 'https://medium.com/airbnb-engineering', expectCadenceDays: 45 },
  { id: 'grab', name: 'Grab Engineering', topic: 'engblogs', url: 'https://engineering.grab.com/feed.xml', homepage: 'https://engineering.grab.com/', expectCadenceDays: 45 },
  { id: 'zalando', name: 'Zalando Engineering', topic: 'engblogs', url: 'https://engineering.zalando.com/atom.xml', homepage: 'https://engineering.zalando.com/', expectCadenceDays: 45, notes: '2.4 MB feed document.' },
  { id: 'canva', name: 'Canva Engineering', topic: 'engblogs', url: 'https://www.canva.dev/blog/engineering/feed.xml', homepage: 'https://www.canva.dev/blog/engineering/', expectCadenceDays: 60, slow: true },
  { id: 'etsy', name: 'Etsy Code as Craft', topic: 'engblogs', url: 'https://www.etsy.com/codeascraft/rss', homepage: 'https://www.etsy.com/codeascraft', expectCadenceDays: 90, slow: true },
  { id: 'google-research', name: 'Google Research', topic: 'engblogs', url: 'https://research.google/blog/rss/', homepage: 'https://research.google/blog/', expectCadenceDays: 21, notes: 'The old blog.research.google feed is stale since 2024; this is the live one.' },
  { id: 'slack-engineering', name: 'Slack Engineering', topic: 'engblogs', url: 'https://slack.engineering/feed/', homepage: 'https://slack.engineering/', expectCadenceDays: 120, slow: true },
  { id: 'lyft', name: 'Lyft Engineering', topic: 'engblogs', url: 'https://eng.lyft.com/feed', homepage: 'https://eng.lyft.com/', expectCadenceDays: 90, slow: true },
  { id: 'instacart', name: 'Instacart Engineering', topic: 'engblogs', url: 'https://tech.instacart.com/feed', homepage: 'https://tech.instacart.com/', expectCadenceDays: 120, slow: true },
];
