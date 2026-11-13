'use client';

import { useState } from 'react';
import { ItemActions, OpenLink } from './ItemActions';
import { SourceLink } from './SourceLink';
import { TOPIC_LABELS, type Topic } from '../config/scoring';
import type { RecView } from './variants/ForYou';

/**
 * The lead story and the ranked column, with a rotate button on every row.
 *
 * Rotation is entirely client-side. The spares were chosen during the same render that
 * produced the visible rows, by the same diversity pass, and shipped with the page -- so
 * a swap is instant and costs no query. That matters more here than it looks: this page
 * is served from the ISR cache precisely so a view touches Postgres zero times, and
 * Neon's free compute auto-suspends when idle. A server action per click would wake the
 * database every time and throw that away.
 *
 * A rotated-out row goes to the back of the queue rather than being discarded, so
 * rotating never loses an article and a long enough session comes back round.
 */
export function RotatingRecs({
  lead: initialLead,
  picks: initialPicks,
  bench,
}: {
  lead: RecView | null;
  picks: RecView[];
  bench: RecView[];
}) {
  const [lead, setLead] = useState(initialLead);
  const [picks, setPicks] = useState(initialPicks);
  const [queue, setQueue] = useState(bench);
  /** Slots rotated at least once, so only those animate -- not the whole page on load. */
  const [spun, setSpun] = useState<string[]>([]);
  const exhausted = queue.length === 0;

  const markSpun = (slot: string) =>
    setSpun((prev) => (prev.includes(slot) ? prev : [...prev, slot]));

  const rotateLead = () => {
    if (!lead || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setLead(next);
    setQueue([...rest, lead]);
    markSpun('lead');
  };

  const rotatePick = (index: number) => {
    const outgoing = picks[index];
    if (!outgoing || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setPicks((prev) => prev.map((rec, i) => (i === index ? next : rec)));
    setQueue([...rest, outgoing]);
    markSpun(String(index));
  };

  if (!lead) {
    return (
      <p className="empty">
        Nothing to recommend: every article in the window has been read or saved.
      </p>
    );
  }

  return (
    <div className="recs">
      <article
        /* Keyed on the article so a swap remounts the node and the animation runs. */
        key={lead.item.id}
        className={`lead${lead.item.read ? ' read' : ''}${spun.includes('lead') ? ' swapped' : ''}`}
      >
        <div className="rec-kickers">
          <span className="kicker">{TOPIC_LABELS[lead.item.topic as Topic] ?? lead.item.topic}</span>
          <Why rec={lead} />
          <RotateButton onClick={rotateLead} exhausted={exhausted} />
        </div>
        <h2>
          <OpenLink id={lead.item.id} url={lead.item.url} read={lead.item.read}>
            {lead.item.title}
          </OpenLink>
        </h2>
        <Byline item={lead.item} />
        {lead.item.imageUrl ? (
          <figure>
            <img src={lead.item.imageUrl} alt="" />
          </figure>
        ) : null}
        {lead.item.summary ? <p className="standfirst">{lead.item.summary}</p> : null}
        <ItemActions id={lead.item.id} read={lead.item.read} saved={lead.item.saved} compact />
      </article>

      <ol className="picks">
        {picks.map((rec, index) => (
          <li
            key={rec.item.id}
            className={[
              rec.item.read ? 'read' : '',
              spun.includes(String(index)) ? 'swapped' : '',
            ].filter(Boolean).join(' ') || undefined}
          >
            <span className="rank">{index + 2}</span>
            <div className="pick-body">
              <h3>
                <OpenLink id={rec.item.id} url={rec.item.url} read={rec.item.read}>
                  {rec.item.title}
                </OpenLink>
              </h3>
              <p className="pick-sub">
                <SourceLink item={rec.item} className="src" />
                <span className="dot">&middot;</span>
                <span>{rec.item.ageLabel}</span>
                <Why rec={rec} />
              </p>
            </div>
            <div className="pick-actions">
              <RotateButton onClick={() => rotatePick(index)} exhausted={exhausted} />
              <ItemActions id={rec.item.id} read={rec.item.read} saved={rec.item.saved} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RotateButton({ onClick, exhausted }: { onClick: () => void; exhausted: boolean }) {
  return (
    <button
      type="button"
      className="rotate"
      onClick={onClick}
      disabled={exhausted}
      aria-label={exhausted ? 'No more spare picks' : 'Swap this for a different article'}
      title={
        exhausted
          ? 'No spare picks left — reload for a fresh set'
          : 'Swap this for a different article'
      }
    >
      {'↻'}
    </button>
  );
}

function Why({ rec }: { rec: RecView }) {
  return <span className={`why why-${rec.whyKind}`}>{rec.why}</span>;
}

function Byline({ item }: { item: RecView['item'] }) {
  return (
    <p className="byline">
      By <SourceLink item={item} className="src" />{' '}
      <span className="when">&middot; {item.ageLabel}</span>
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
