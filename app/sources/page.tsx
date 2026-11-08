import { getSources } from '../../src/lanes';
import { TOPICS, TOPIC_LABELS, type Topic } from '../../config/scoring';
import { feedById } from '../../config/feeds/index';

export const revalidate = 300;

/** Index of every publication we hold anything from. */
export default async function SourcesPage() {
  const sources = await getSources();
  const now = Date.now();

  return (
    <main>
      <div className="ears">
        <span>Index</span>
        <nav><a href="/">&larr; front page</a></nav>
      </div>
      <header className="masthead"><h1>Sources</h1></header>
      <div className="dateline">
        <span>{sources.length} publications</span>
        <span>{sources.reduce((a, s) => a + s.count, 0)} articles held</span>
      </div>

      {TOPICS.map((topic: Topic) => {
        const group = sources.filter((s) => s.topic === topic);
        if (group.length === 0) return null;
        return (
          <section className="band" key={topic}>
            <div className="band-head">
              <h2>{TOPIC_LABELS[topic]}</h2>
              <span className="count">{group.length} sources</span>
            </div>
            <ul className="source-list">
              {group.map((s) => {
                const days = Math.round((now - new Date(s.newest).getTime()) / 86_400_000);
                return (
                  <li key={s.sourceId}>
                    <a className="s-name" href={`/s/${s.sourceId}`}>{s.sourceName}</a>
                    <span className="s-meta">
                      <span className="s-count">{s.count}</span>
                      <span className="s-when">
                        {days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`}
                      </span>
                      {feedById(s.sourceId)?.slow ? <span className="s-tag">slow</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
