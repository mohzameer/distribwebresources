import { ItemActions, OpenLink } from '../ItemActions';
import { SourceLink } from '../SourceLink';
import { TOPIC_LABELS, type Topic } from '../../config/scoring';
import type { ItemView } from '../ItemRow';

export type BroadsheetData = {
  lead: ItemView | null;
  second: ItemView[];
  briefs: ItemView[];
  bands: { topic: Topic; label: string; total: number; featured: ItemView | null; rest: ItemView[] }[];
};

function Byline({ item }: { item: ItemView }) {
  return (
    <p className="byline">
      By <SourceLink item={item} className="src" /> <span className="when">&middot; {item.ageLabel}</span>
      {item.hnUrl ? (
        <>
          {' '}
          <a className="hn" href={item.hnUrl} target="_blank" rel="noopener noreferrer">
            HN{item.hnPoints ? ` ${item.hnPoints}` : ''}
          </a>
        </>
      ) : null}
    </p>
  );
}

/**
 * Broadsheet front page: one lead story, a second column, a column of text-only briefs,
 * then a band per topic.
 *
 * The briefs rail exists because only about half of all items carry an image and the split
 * is lopsided -- 88% for engineering blogs, 1% for community. Giving the image-less items
 * a column of their own is what stops the page reading as a grid full of holes.
 */
export function Broadsheet({ data }: { data: BroadsheetData }) {
  const { lead, second, briefs, bands } = data;

  return (
    <>
      {lead ? (
        <div className="front">
          <article className={`lead${lead.read ? ' read' : ''}`}>
            <span className="kicker">{TOPIC_LABELS[lead.topic as Topic]}</span>
            <h2>
              <OpenLink id={lead.id} url={lead.url} read={lead.read}>{lead.title}</OpenLink>
            </h2>
            <Byline item={lead} />
            {lead.imageUrl ? (
              <figure>
                <img src={lead.imageUrl} alt="" />
              </figure>
            ) : null}
            {lead.summary ? <p className="standfirst">{lead.summary}</p> : null}
            <ItemActions id={lead.id} read={lead.read} saved={lead.saved} compact />
          </article>

          <div className="second">
            {second.map((i, n) => (
              <article key={i.id} className={n > 0 ? 'ruled' : undefined}>
                <span className="kicker">{TOPIC_LABELS[i.topic as Topic]}</span>
                <h3>
                  <OpenLink id={i.id} url={i.url} read={i.read}>{i.title}</OpenLink>
                </h3>
                <Byline item={i} />
                {i.imageUrl && n === 0 ? (
                  <figure>
                    <img src={i.imageUrl} alt="" />
                  </figure>
                ) : null}
                {i.summary ? <p className="standfirst">{i.summary}</p> : null}
              </article>
            ))}
          </div>

          <aside className="rail">
            <div className="rail-head">In Brief</div>
            {briefs.map((i) => (
              <div className="brief" key={i.id}>
                <span className="kicker">{TOPIC_LABELS[i.topic as Topic]}</span>
                <h4>
                  <OpenLink id={i.id} url={i.url} read={i.read}>{i.title}</OpenLink>
                </h4>
                <p>
                  <SourceLink item={i} className="src" /> &middot; {i.ageLabel}
                </p>
              </div>
            ))}
          </aside>
        </div>
      ) : null}

      {bands.map((band) => (
        <section className="band" key={band.topic}>
          <div className="band-head">
            <h2>{band.label}</h2>
            <span className="count">{band.total} articles</span>
            <a className="more" href={`/t/${band.topic}`}>All &rarr;</a>
          </div>
          <div className="cols">
            {band.featured ? (
              <article className={`story${band.featured.read ? ' read' : ''}`}>
                {band.featured.imageUrl ? (
                  <figure>
                    <img src={band.featured.imageUrl} alt="" />
                  </figure>
                ) : null}
                <h3>
                  <OpenLink id={band.featured.id} url={band.featured.url} read={band.featured.read}>
                    {band.featured.title}
                  </OpenLink>
                </h3>
                <Byline item={band.featured} />
                {band.featured.summary ? <p className="standfirst">{band.featured.summary}</p> : null}
              </article>
            ) : null}

            {[0, 1].map((col) => (
              <div className="stack" key={col}>
                {band.rest.filter((_, idx) => idx % 2 === col).map((i) => (
                  <article className={`story${i.read ? ' read' : ''}`} key={i.id}>
                    <h3>
                      <OpenLink id={i.id} url={i.url} read={i.read}>{i.title}</OpenLink>
                    </h3>
                    <Byline item={i} />
                    {i.summary ? <p className="standfirst">{i.summary}</p> : null}
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
