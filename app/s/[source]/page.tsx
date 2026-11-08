import { notFound } from 'next/navigation';
import { ItemActions, OpenLink } from '../../../components/ItemActions';
import { getBySource } from '../../../src/lanes';
import { feedById, ENABLED_FEEDS } from '../../../config/feeds/index';
import { TOPIC_LABELS, type Topic } from '../../../config/scoring';
import { RETENTION } from '../../../config/retention';
import { toView } from '../../../src/view';

export const revalidate = 300;

export function generateStaticParams() {
  return ENABLED_FEEDS.map((f) => ({ source: f.id }));
}

/** Everything we hold from one publication, newest first. */
export default async function SourcePage({ params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const feed = feedById(source);
  const items = await getBySource(source);
  if (!feed && items.length === 0) notFound();

  const now = Date.now();
  const name = feed?.name ?? items[0]?.sourceName ?? source;
  const oldest = items.at(-1)?.publishedAt;

  return (
    <main>
      <div className="ears">
        <span>Publication</span>
        <nav><a href="/">&larr; front page</a><a href="/sources">all sources</a></nav>
      </div>

      <header className="masthead">
        <h1>{name}</h1>
      </header>
      <div className="dateline">
        <span>{feed ? TOPIC_LABELS[feed.topic as Topic] : 'Archive'}</span>
        <span>{items.length} articles held</span>
        {oldest ? <span>Back to {oldest.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span> : null}
        {feed ? (
          <span>
            <a className="more" href={feed.homepage} target="_blank" rel="noopener noreferrer">
              Visit site &rarr;
            </a>
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="note">
          Nothing held from this source yet. Feeds only expose their most recent items, so
          this fills out over the next few days.
        </p>
      ) : (
        <section className="band">
          <div className="archive">
            {items.map((raw) => {
              const i = toView(raw, now);
              return (
                <article className={`story${i.read ? ' read' : ''}`} key={i.id}>
                  {i.imageUrl ? (
                    <figure className="thumb">
                      <img src={i.imageUrl} alt="" loading="lazy" />
                    </figure>
                  ) : null}
                  <div className="archive-body">
                    <h3>
                      <OpenLink id={i.id} url={i.url} read={i.read}>{i.title}</OpenLink>
                    </h3>
                    <p className="byline">
                      {raw.publishedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      <span className="when">&middot; {i.ageLabel}</span>
                      {i.hnUrl ? (
                        <>
                          {' '}
                          <a className="hn" href={i.hnUrl} target="_blank" rel="noopener noreferrer">
                            HN{i.hnPoints ? ` ${i.hnPoints}` : ''}
                          </a>
                        </>
                      ) : null}
                    </p>
                    {i.summary ? <p className="standfirst">{i.summary}</p> : null}
                  </div>
                  <ItemActions id={i.id} read={i.read} saved={i.saved} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      <p className="note">
        Articles are kept for {RETENTION.itemTtlDays} days unless you save them.
      </p>
    </main>
  );
}
