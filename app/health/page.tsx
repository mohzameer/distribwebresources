import { getHealth } from '../../src/lanes';
import { FEEDS } from '../../config/feeds/index';

export const revalidate = 60;

/**
 * Two different problems live here, and conflating them is a trap:
 *
 *  - FAILING: the feed does not respond or does not parse. Fixable, usually a changed URL.
 *  - STALE:   the feed returns HTTP 200 forever and simply stopped publishing. High
 *             Scalability last posted in March 2024 and still serves a valid feed. That is
 *             not a failure and must never be counted as one -- it is a retirement
 *             candidate.
 */
export default async function HealthPage() {
  let health;
  try {
    health = await getHealth();
  } catch (err) {
    return (
      <main>
        <div className="top"><h1>Feed health</h1><nav><a href="/">&larr; back</a></nav></div>
        <div className="banner">Database unreachable. {err instanceof Error ? err.message : ''}</div>
      </main>
    );
  }

  const { feeds, lastRun } = health;
  const byId = new Map(FEEDS.map((f) => [f.id, f]));
  const now = Date.now();

  const failing = feeds.filter((f) => f.consecutive_failures >= 6);
  const stale = feeds.filter((f) => {
    const cfg = byId.get(f.source_id);
    if (!cfg || cfg.slow || f.consecutive_failures >= 6) return false;
    if (!f.newest_published_at) return false;
    const ageDays = (now - new Date(f.newest_published_at).getTime()) / 86_400_000;
    return ageDays > cfg.expectCadenceDays * 3;
  });

  return (
    <main>
      <div className="top">
        <h1>Feed health</h1>
        <nav><a href="/">&larr; all lanes</a></nav>
      </div>

      <p className="meta">
        {feeds.length} feeds tracked
        {lastRun
          ? ` · last run ${new Date(lastRun.started_at).toLocaleString('en-GB')} · ${lastRun.feeds_ok}/${lastRun.feeds_total} ok · ${lastRun.items_inserted} new · ${lastRun.pruned_items} pruned`
          : ' · no completed run recorded'}
      </p>

      <section className="lane">
        <div className="lane-head"><h2>Failing</h2><span className="count">{failing.length}</span></div>
        {failing.length === 0 ? (
          <p className="empty">No feed has failed three days running.</p>
        ) : (
          <table className="health">
            <thead>
              <tr><th>feed</th><th>fails</th><th>http</th><th>error</th><th>fix</th></tr>
            </thead>
            <tbody>
              {failing.map((f) => (
                <tr key={f.source_id}>
                  <td>{byId.get(f.source_id)?.name ?? f.source_id}</td>
                  <td><span className="pill bad">{f.consecutive_failures}</span></td>
                  <td>{f.last_status ?? '—'}</td>
                  <td className="err">{f.last_error}</td>
                  <td><code>{f.source_id}</code> in config/feeds/</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="lane">
        <div className="lane-head"><h2>Stale &mdash; consider retiring</h2><span className="count">{stale.length}</span></div>
        {stale.length === 0 ? (
          <p className="empty">Every feed is publishing at roughly its expected cadence.</p>
        ) : (
          <table className="health">
            <thead><tr><th>feed</th><th>newest post</th><th>expected cadence</th></tr></thead>
            <tbody>
              {stale.map((f) => (
                <tr key={f.source_id}>
                  <td>{byId.get(f.source_id)?.name ?? f.source_id}</td>
                  <td>{f.newest_published_at ? new Date(f.newest_published_at).toLocaleDateString('en-GB') : '—'}</td>
                  <td>{byId.get(f.source_id)?.expectCadenceDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="lane">
        <div className="lane-head"><h2>All feeds</h2><span className="count">{feeds.length}</span></div>
        <table className="health">
          <thead><tr><th>feed</th><th>status</th><th>last ok</th><th>newest post</th></tr></thead>
          <tbody>
            {feeds.map((f) => (
              <tr key={f.source_id}>
                <td>{byId.get(f.source_id)?.name ?? f.source_id}</td>
                <td>
                  <span className={`pill${f.consecutive_failures > 0 ? ' bad' : ''}`}>
                    {f.auto_disabled_at ? 'disabled' : f.consecutive_failures > 0 ? `${f.consecutive_failures} fails` : 'ok'}
                  </span>
                </td>
                <td>{f.last_success_at ? new Date(f.last_success_at).toLocaleDateString('en-GB') : '—'}</td>
                <td>{f.newest_published_at ? new Date(f.newest_published_at).toLocaleDateString('en-GB') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
