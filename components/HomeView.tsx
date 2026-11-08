import { Broadsheet, type BroadsheetData } from './variants/Broadsheet';
import { buildLanes, getWindow, getHealth, type Item } from '../src/lanes';
import { TOPICS, TOPIC_LABELS, type Topic } from '../config/scoring';
import { RETENTION } from '../config/retention';
import { toView } from '../src/view';

/**
 * The homepage: a broadsheet front page, then a band per topic.
 *
 * Shared by / and /unread as two separate ROUTES rather than one route with `?unread=1`,
 * because reading searchParams makes a route dynamic -- which would mean every first visit
 * of the day pays a Neon cold start.
 */
export async function HomeView({ unreadOnly }: { unreadOnly: boolean }) {
  let items;
  let health;
  try {
    [items, health] = await Promise.all([getWindow(), getHealth()]);
  } catch (err) {
    return (
      <main>
        <header className="masthead"><h1>Daily Engineering News</h1></header>
        <div className="banner">
          Could not reach the database. {err instanceof Error ? err.message : ''}
        </div>
      </main>
    );
  }

  const now = Date.now();
  const lanes = buildLanes(items, { unreadOnly });
  const used = new Set<string>();
  const take = (pool: Item[], n: number) => {
    const out: Item[] = [];
    for (const i of pool) {
      if (out.length >= n) break;
      if (used.has(i.id)) continue;
      used.add(i.id);
      out.push(i);
    }
    return out;
  };

  // Front page is drawn from the best of every lane, ranked together.
  const ranked = lanes.flatMap((l) => l.visible).sort((a, b) => b.renderScore - a.renderScore);

  // The lead wants a picture. Fall back to the top story if nothing near the top has one,
  // rather than promoting something weak just because it is illustrated.
  const leadPool = ranked.slice(0, 8).filter((i) => i.imageUrl);
  const lead = take(leadPool.length > 0 ? leadPool : ranked, 1)[0] ?? null;
  const second = take(ranked, 2);
  const briefs = take(ranked, 5);

  const bands = TOPICS.map((topic: Topic) => {
    const lane = lanes.find((l) => l.topic === topic);
    const pool = (lane?.visible ?? []).filter((i) => !used.has(i.id));
    const featured = pool.find((i) => i.imageUrl) ?? pool[0] ?? null;
    const rest = pool.filter((i) => i !== featured).slice(0, 6);
    for (const i of [featured, ...rest]) if (i) used.add(i.id);
    return {
      topic,
      label: TOPIC_LABELS[topic],
      total: lane?.total ?? 0,
      featured: featured ? toView(featured, now) : null,
      rest: rest.map((i) => toView(i, now)),
    };
  }).filter((b) => b.featured !== null);

  const data: BroadsheetData = {
    lead: lead ? toView(lead, now) : null,
    second: second.map((i) => toView(i, now)),
    briefs: briefs.map((i) => toView(i, now)),
    bands,
  };

  const unreadCount = items.filter((i) => !i.readAt).length;
  const { lastRun, feeds } = health;
  const broken = feeds.filter((f) => f.consecutive_failures >= 6);
  const today = new Date(now).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main>
      <div className="ears">
        <span>{unreadOnly ? 'Unread only' : 'All articles'}</span>
        <nav>
          <a href={unreadOnly ? '/' : '/unread'}>{unreadOnly ? 'show all' : 'unread'}</a>
          <a href="/sources">sources</a>
          <a href="/saved">saved</a>
          <a href="/health">health</a>
          <a href="/v/compact">compact</a>
        </nav>
      </div>

      <header className="masthead">
        <h1>Daily Engineering News</h1>
      </header>

      <div className="dateline">
        <span>{today}</span>
        <span>
          {items.length} articles &middot; {RETENTION.itemTtlDays}-day window &middot; {unreadCount} unread
        </span>
        <span>
          {lastRun
            ? `Last filed ${new Date(lastRun.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : 'No edition filed yet'}
        </span>
      </div>

      {broken.length > 0 ? (
        <div className="banner">
          {broken.length} feed{broken.length === 1 ? '' : 's'} failing for 3+ days.{' '}
          <a href="/health">See health &rarr;</a>
        </div>
      ) : null}

      <Broadsheet data={data} />
    </main>
  );
}
