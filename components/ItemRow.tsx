'use client';

import { useOptimistic, useTransition } from 'react';
import { toggleRead, toggleSaved } from '../app/actions';

export type ItemView = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  topic: string;
  imageUrl: string | null;
  summary: string | null;
  ageLabel: string;
  hnUrl: string | null;
  hnPoints: number | null;
  read: boolean;
  saved: boolean;
};

export function ItemRow({ item }: { item: ItemView }) {
  const [, startTransition] = useTransition();
  const [read, setRead] = useOptimistic(item.read);
  const [saved, setSaved] = useOptimistic(item.saved);

  // Opening an article marks it read, so the lane reflects what you have actually worked
  // through without any extra clicks. Fire-and-forget: the link must not wait on the DB.
  const open = () => {
    if (read) return;
    startTransition(async () => {
      setRead(true);
      await toggleRead(item.id, true);
    });
  };

  return (
    <div className={`item${read ? ' read' : ''}`}>
      <div className="item-body">
        <a
          className="item-title"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={open}
          onAuxClick={open}
        >
          {item.title}
        </a>
        <div className="item-sub">
          <span className="src">{item.sourceName}</span>
          <span className="dot">·</span>
          <span>{item.ageLabel}</span>
          {item.hnUrl ? (
            <>
              <span className="dot">·</span>
              <a className="hn" href={item.hnUrl} target="_blank" rel="noopener noreferrer">
                HN{item.hnPoints ? ` ${item.hnPoints}` : ''}
              </a>
            </>
          ) : null}
        </div>
        {item.summary ? <div className="item-summary">{item.summary}</div> : null}
      </div>

      <div className="actions">
        <button
          className="iconbtn"
          aria-pressed={saved}
          aria-label={saved ? 'Unsave' : 'Save'}
          title={saved ? 'Saved — exempt from the 30-day cleanup' : 'Save (keeps it forever)'}
          onClick={() =>
            startTransition(async () => {
              setSaved(!saved);
              await toggleSaved(item.id, !saved);
            })
          }
        >
          {saved ? '★' : '☆'}
        </button>
        <button
          className="iconbtn"
          aria-pressed={read}
          aria-label={read ? 'Mark unread' : 'Mark read'}
          title={read ? 'Mark unread' : 'Mark read'}
          onClick={() =>
            startTransition(async () => {
              setRead(!read);
              await toggleRead(item.id, !read);
            })
          }
        >
          {read ? '●' : '○'}
        </button>
      </div>
    </div>
  );
}
