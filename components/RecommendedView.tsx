import { ForYou, type ForYouData, type RecView } from './variants/ForYou';
import { getWindow, getSaved, getHealth } from '../src/lanes';
import { recommend, type Pick, type Reason } from '../src/recommend';
import { RECOMMEND } from '../config/recommend';
import { RETENTION } from '../config/retention';
import { toView } from '../src/view';

/**
 * The homepage: a recommended edition, built from what you have read and saved.
 *
 * Three queries on a cache miss (window, saved, health) and none on a hit -- the same
 * bargain the front page makes. Saved articles are fetched separately from the window
 * because they are exempt from the 30-day prune and so can reach back further than it.
 */

/** The reason, as the chip the reader sees. It has to be literally true. */
function whyText(reason: Reason): string {
  if (reason.kind === 'affinity') {
    return reason.terms.length > 0 ? `Matches ${reason.terms.join(' · ')}` : 'Matches your reading';
  }
  if (reason.kind === 'similar') {
    return reason.terms.length > 0 ? `Shares ${reason.terms.join(' · ')}` : 'Similar wording';
  }
  return reason.label;
}

function toRec(pick: Pick, now: number): RecView {
  return { item: toView(pick.item, now), why: whyText(pick.reason), whyKind: pick.reason.kind };
}

export async function RecommendedView() {
  let items;
  let saved;
  let health;
  try {
    [items, saved, health] = await Promise.all([getWindow(), getSaved(), getHealth()]);
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
  const recs = recommend(items, saved, now);

  const data: ForYouData = {
    lead: recs.lead ? toRec(recs.lead, now) : null,
    picks: recs.picks.map((p) => toRec(p, now)),
    bench: recs.bench.map((p) => toRec(p, now)),
    because: recs.because.map((block) => ({
      seedTitle: block.seed.title,
      seedUrl: block.seed.url,
      seedSaved: block.seed.savedAt !== null,
      items: block.items.map((p) => toRec(p, now)),
    })),
    leavingSoon: recs.leavingSoon.map((i) => ({
      item: toView(i, now),
      // The prune runs at the end of each ingest, so an item is gone within half a day of
      // crossing the TTL. Rounding down is the honest direction for a countdown.
      daysLeft: Math.floor(
        RETENTION.itemTtlDays - (now - i.publishedAt.getTime()) / 86_400_000,
      ),
    })),
    rotation: {
      hours: recs.rotation.hours,
      nextLabel: recs.rotation.nextAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      news: RECOMMEND.news.slots,
      explore: RECOMMEND.explore.slots,
    },
    profile: {
      terms: recs.profile.terms,
      seedCount: recs.profile.seedCount,
      savedCount: recs.profile.savedCount,
      readCount: recs.profile.readCount,
      confidence: recs.profile.confidence,
      target: RECOMMEND.confidenceSeeds,
    },
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
        <span>Recommended</span>
        <nav>
          <a href="/front">front page</a>
          <a href="/unread">unread</a>
          <a href="/sources">sources</a>
          <a href="/saved">saved</a>
          <a href="/noteorg">notes</a>
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
          Recommended &middot; {recs.candidates} unread candidates of {items.length} in the{' '}
          {RETENTION.itemTtlDays}-day window
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

      <ForYou data={data} />

      {unreadCount === 0 ? <p className="empty">Everything in the window has been read.</p> : null}
    </main>
  );
}
