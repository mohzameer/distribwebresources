'use client';

import { useOptimistic, useTransition } from 'react';
import { toggleRead, toggleSaved } from '../app/actions';

/** Save + read toggles, shared by every homepage variant. */
export function ItemActions({
  id,
  read: initialRead,
  saved: initialSaved,
  compact = false,
}: {
  id: string;
  read: boolean;
  saved: boolean;
  compact?: boolean;
}) {
  const [, startTransition] = useTransition();
  const [read, setRead] = useOptimistic(initialRead);
  const [saved, setSaved] = useOptimistic(initialSaved);

  return (
    <div className={compact ? 'actions actions-inline' : 'actions'}>
      <button
        className="iconbtn"
        aria-pressed={saved}
        aria-label={saved ? 'Unsave' : 'Save'}
        title={saved ? 'Saved — exempt from the 30-day cleanup' : 'Save (keeps it forever)'}
        onClick={() =>
          startTransition(async () => {
            setSaved(!saved);
            await toggleSaved(id, !saved);
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
            await toggleRead(id, !read);
          })
        }
      >
        {read ? '●' : '○'}
      </button>
    </div>
  );
}

/** Marks an article read when you open it, without making the link wait on the DB. */
export function OpenLink({
  id,
  url,
  read,
  className,
  children,
}: {
  id: string;
  url: string;
  read: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();
  const open = () => {
    if (read) return;
    startTransition(() => {
      void toggleRead(id, true);
    });
  };
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer" onClick={open} onAuxClick={open}>
      {children}
    </a>
  );
}
