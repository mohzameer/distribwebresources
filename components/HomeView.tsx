import { LaneSection } from './Lane';
import { buildLanes, getWindow, getHealth } from '../src/lanes';
import { RETENTION } from '../config/retention';
import { toView } from '../src/view';

/**
 * Shared by / and /unread.
 *
 * These are two separate ROUTES rather than one route with a `?unread=1` search param,
 * because reading searchParams makes a route dynamic -- which would mean every first visit
 * of the day pays a Neon cold start, exactly what the caching is meant to avoid. Two
 * static routes keep both views in the ISR cache and need no client JavaScript.
 */
export async function HomeView({ unreadOnly }: { unreadOnly: boolean }) {
  let items;
  let health;
  try {
    [items, health] = await Promise.all([getWindow(), getHealth()]);
  } catch (err) {
    return (
      <main>
        <div className="top"><h1>Daily Engineering News</h1></div>
        <div className="banner">
          Could not reach the database. {err instanceof Error ? err.message : ''}
        </div>
      </main>
    );
  }

  const lanes = buildLanes(items, { unreadOnly });
  const now = Date.now();
  const unreadCount = items.filter((i) => !i.readAt).length;
  const { lastRun, feeds } = health;
  const broken = feeds.filter((f) => f.consecutive_failures >= 6);

  return (
    <main>
      <div className="top">
        <h1>{unreadOnly ? 'Unread' : 'Daily Engineering News'}</h1>
        <nav>
          <a href={unreadOnly ? '/' : '/unread'}>{unreadOnly ? 'show all' : 'unread only'}</a>
          <a href="/saved">saved</a>
          <a href="/health">health</a>
        </nav>
      </div>

      <p className="meta">
        {items.length} articles from the last {RETENTION.itemTtlDays} days
        {' · '}
        {unreadCount} unread
        {lastRun
          ? ` · last fetch ${new Date(lastRun.started_at).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}`
          : ' · no ingest recorded yet'}
      </p>

      {broken.length > 0 ? (
        <div className="banner">
          {broken.length} feed{broken.length === 1 ? '' : 's'} failing for 3+ days.{' '}
          <a href="/health">See health &rarr;</a>
        </div>
      ) : null}

      {lanes.map((lane) => (
        <LaneSection
          key={lane.topic}
          label={lane.label}
          topic={lane.topic}
          total={lane.total}
          visible={lane.visible.map((i) => toView(i, now))}
          overflow={lane.overflow.map((i) => toView(i, now))}
        />
      ))}
    </main>
  );
}
