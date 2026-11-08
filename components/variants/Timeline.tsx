import { ItemActions, OpenLink } from '../ItemActions';
import { TOPIC_LABELS } from '../../config/scoring';
import type { ItemView } from '../ItemRow';

export type DayGroup = { label: string; items: ItemView[] };

/**
 * Chronological river grouped by day, ignoring score entirely.
 *
 * This is the one layout that answers "what happened since I last looked?" rather than
 * "what is best?" -- so it is the only one where a low-scoring item can appear above a
 * high-scoring one. Per-source caps still apply, or AWS would swamp each day.
 */
export function Timeline({ days }: { days: DayGroup[] }) {
  if (days.length === 0) return <p className="empty">Nothing to show.</p>;

  return (
    <div className="timeline">
      {days.map((day) => (
        <section key={day.label} className="day">
          <div className="day-head">
            <h2>{day.label}</h2>
            <span className="count">{day.items.length}</span>
          </div>
          <ul className="tl-list">
            {day.items.map((i) => (
              <li key={i.id} className={i.read ? 'read' : ''}>
                <span className="tl-time">{i.ageLabel}</span>
                <div className="tl-body">
                  <OpenLink id={i.id} url={i.url} read={i.read} className="tl-title">
                    {i.title}
                  </OpenLink>
                  <div className="item-sub">
                    <span className={`tag t-${i.topic}`}>{TOPIC_LABELS[i.topic as keyof typeof TOPIC_LABELS]}</span>
                    <span className="src">{i.sourceName}</span>
                    {i.hnUrl ? (
                      <>
                        <span className="dot">·</span>
                        <a className="hn" href={i.hnUrl} target="_blank" rel="noopener noreferrer">
                          HN{i.hnPoints ? ` ${i.hnPoints}` : ''}
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
                <ItemActions id={i.id} read={i.read} saved={i.saved} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
