import { ItemActions, OpenLink } from '../ItemActions';
import type { ItemView } from '../ItemRow';
import type { Lane } from '../../src/lanes';

/**
 * Image-led grid, grouped by topic.
 *
 * Only half our items have an image and Community has almost none, so a card without one
 * is a first-class layout rather than a hole: it drops the media box and gives the title
 * more room, which reads as intentional.
 */
export function Cards({
  lanes,
}: {
  lanes: (Omit<Lane, 'visible' | 'overflow'> & { visible: ItemView[]; overflow: ItemView[] })[];
}) {
  return (
    <div className="cards-page">
      {lanes.map((lane) => (
        <section className="lane" key={lane.topic}>
          <div className="lane-head">
            <h2>{lane.label}</h2>
            <span className="count">{lane.total}</span>
            <a href={`/t/${lane.topic}`}>all &rarr;</a>
          </div>
          <div className="card-grid">
            {lane.visible.slice(0, 8).map((i) => (
              <article key={i.id} className={`card${i.read ? ' read' : ''}${i.imageUrl ? '' : ' no-img'}`}>
                {i.imageUrl ? (
                  <div className="card-img">
                    <img src={i.imageUrl} alt="" loading="lazy" />
                  </div>
                ) : null}
                <div className="card-body">
                  <OpenLink id={i.id} url={i.url} read={i.read} className="card-title">
                    {i.title}
                  </OpenLink>
                  {i.summary ? <p className="card-summary">{i.summary}</p> : null}
                  <div className="item-sub">
                    <span className="src">{i.sourceName}</span>
                    <span className="dot">·</span>
                    <span>{i.ageLabel}</span>
                    {i.hnUrl ? (
                      <>
                        <span className="dot">·</span>
                        <a className="hn" href={i.hnUrl} target="_blank" rel="noopener noreferrer">
                          HN{i.hnPoints ? ` ${i.hnPoints}` : ''}
                        </a>
                      </>
                    ) : null}
                    <ItemActions id={i.id} read={i.read} saved={i.saved} compact />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
