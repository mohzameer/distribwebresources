import { ItemActions, OpenLink } from '../ItemActions';
import type { ItemView } from '../ItemRow';
import type { Lane } from '../../src/lanes';

/**
 * Maximum density: two columns, titles only, no summaries and no images. Built for
 * scanning ~60 headlines in one screen and opening three of them. The source and age are
 * dimmed to the right so the titles form a single readable column of text.
 */
export function Compact({
  lanes,
}: {
  lanes: (Omit<Lane, 'visible' | 'overflow'> & { visible: ItemView[]; overflow: ItemView[] })[];
}) {
  return (
    <div className="compact-page">
      {lanes.map((lane) => (
        <section className="lane" key={lane.topic}>
          <div className="lane-head">
            <h2>{lane.label}</h2>
            <span className="count">{lane.total}</span>
            <a href={`/t/${lane.topic}`}>all &rarr;</a>
          </div>
          <ul className="compact-list">
            {lane.visible.map((i) => (
              <li key={i.id} className={i.read ? 'read' : ''}>
                <OpenLink id={i.id} url={i.url} read={i.read} className="c-title">
                  {i.title}
                </OpenLink>
                <span className="c-meta">
                  <span className="src">{i.sourceName}</span>
                  {i.hnUrl ? (
                    <a className="hn" href={i.hnUrl} target="_blank" rel="noopener noreferrer">
                      {i.hnPoints ?? 'HN'}
                    </a>
                  ) : null}
                  <span className="age">{i.ageLabel}</span>
                </span>
                <ItemActions id={i.id} read={i.read} saved={i.saved} compact />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
