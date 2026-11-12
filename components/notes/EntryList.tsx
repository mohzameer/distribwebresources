'use client';

import { useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { NoteEditor, type NoteDocJSON } from './NoteEditor';
import { NoteDocView } from './NoteDocView';

/** The shape both the API and the server actions hand to the UI. */
export type EntryData = {
  id: string;
  kind: 'highlight' | 'note';
  quote: string | null;
  doc: JSONContent | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  entries: EntryData[];
  onUpdateNote: (id: string, doc: NoteDocJSON) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Link a highlight back to its passage on the article (text fragment). */
  articleUrl?: string;
};

function when(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Chrome scrolls to and marks the passage when a URL carries #:~:text=. */
function fragmentLink(url: string, quote: string): string {
  const words = quote.replace(/\s+/g, ' ').trim().split(' ');
  const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D');
  const directive =
    words.length > 12
      ? `${enc(words.slice(0, 5).join(' '))},${enc(words.slice(-5).join(' '))}`
      : enc(words.join(' '));
  return `${url.split('#')[0]}#:~:text=${directive}`;
}

export function EntryList({ entries, onUpdateNote, onDelete, articleUrl }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const remove = async (e: EntryData) => {
    const what = e.kind === 'highlight' ? 'highlight' : 'note';
    if (!window.confirm(`Delete this ${what}?`)) return;
    setBusy(e.id);
    try {
      await onDelete(e.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="note-entries">
      {entries.map((e) => (
        <div className="note-entry" key={e.id} style={busy === e.id ? { opacity: 0.4 } : undefined}>
          {e.kind === 'highlight' ? (
            <blockquote className="note-highlight">{e.quote}</blockquote>
          ) : editing === e.id ? (
            <NoteEditor
              initial={e.doc as NoteDocJSON}
              saveLabel="Update"
              onCancel={() => setEditing(null)}
              onSave={async (doc) => {
                await onUpdateNote(e.id, doc);
                setEditing(null);
              }}
            />
          ) : (
            <div className="note-card">{e.doc ? <NoteDocView doc={e.doc} /> : null}</div>
          )}

          {editing === e.id ? null : (
            <div className="note-entry-meta">
              <span className="note-kind">{e.kind}</span>
              <span>{when(e.createdAt)}</span>
              {e.kind === 'note' && e.updatedAt !== e.createdAt ? <span>· edited</span> : null}
              <span style={{ marginLeft: 'auto' }} />
              {e.kind === 'highlight' && articleUrl && e.quote ? (
                <a className="note-btn quiet" href={fragmentLink(articleUrl, e.quote)} target="_blank" rel="noopener noreferrer">
                  Find in article
                </a>
              ) : null}
              {e.kind === 'note' ? (
                <button type="button" className="note-btn quiet" onClick={() => setEditing(e.id)}>
                  Edit
                </button>
              ) : null}
              <button type="button" className="note-btn quiet danger" onClick={() => void remove(e)}>
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
