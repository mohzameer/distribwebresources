import { ItemActions, OpenLink } from '../ItemActions';
import { TOPIC_LABELS } from '../../config/scoring';
import type { ItemView } from '../ItemRow';

/**
 * ONE ranked list across every topic, led by the single highest-scoring story.
 * Answers "what should I read today?" rather than "what arrived?". Deliberately short --
 * a fixed ~24 items, so the page ends.
 */
export function Digest({ items }: { items: ItemView[] }) {
  const [lead, ...rest] = items;
  if (!lead) return <p className="empty">Nothing to show.</p>;

  return (
    <div className="digest">
      <article className={`lead${lead.read ? ' read' : ''}`}>
        {lead.imageUrl ? (
          <div className="lead-img">
            {/* plain <img>: optimizing would mean allow-listing ~50 remote hosts */}
            <img src={lead.imageUrl} alt="" loading="eager" />
          </div>
        ) : null}
        <div className="lead-body">
          <span className={`tag t-${lead.topic}`}>{TOPIC_LABELS[lead.topic as keyof typeof TOPIC_LABELS]}</span>
          <OpenLink id={lead.id} url={lead.url} read={lead.read} className="lead-title">
            {lead.title}
          </OpenLink>
          {lead.summary ? <p className="lead-summary">{lead.summary}</p> : null}
          <div className="item-sub">
            <span className="src">{lead.sourceName}</span>
            <span className="dot">·</span>
            <span>{lead.ageLabel}</span>
            {lead.hnUrl ? (
              <>
                <span className="dot">·</span>
                <a className="hn" href={lead.hnUrl} target="_blank" rel="noopener noreferrer">
                  HN{lead.hnPoints ? ` ${lead.hnPoints}` : ''}
                </a>
              </>
            ) : null}
            <ItemActions id={lead.id} read={lead.read} saved={lead.saved} compact />
          </div>
        </div>
      </article>

      <ol className="digest-list">
        {rest.map((i, idx) => (
          <li key={i.id} className={i.read ? 'read' : ''}>
            <span className="rank">{idx + 2}</span>
            <div className="dl-body">
              <OpenLink id={i.id} url={i.url} read={i.read} className="dl-title">
                {i.title}
              </OpenLink>
              <div className="item-sub">
                <span className={`tag t-${i.topic}`}>{TOPIC_LABELS[i.topic as keyof typeof TOPIC_LABELS]}</span>
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
              </div>
            </div>
            <ItemActions id={i.id} read={i.read} saved={i.saved} />
          </li>
        ))}
      </ol>
    </div>
  );
}
