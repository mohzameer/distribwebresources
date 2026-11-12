'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EntryList, type EntryData } from '../../../components/notes/EntryList';
import { NoteEditor } from '../../../components/notes/NoteEditor';
import {
  addNoteAction,
  deleteEntryAction,
  deletePageAction,
  updateNoteAction,
} from '../actions';

export function NotePageView({
  pageId,
  articleUrl,
  entries,
}: {
  pageId: string;
  articleUrl: string;
  entries: EntryData[];
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(entries.length === 0);

  return (
    <>
      {entries.length ? (
        <EntryList
          entries={entries}
          articleUrl={articleUrl}
          onUpdateNote={(id, doc) => updateNoteAction(id, doc)}
          onDelete={(id) => deleteEntryAction(id)}
        />
      ) : null}

      <div className="noteorg-compose">
        {composing ? (
          <NoteEditor
            autoFocus={entries.length > 0}
            onCancel={entries.length ? () => setComposing(false) : undefined}
            onSave={async (doc) => {
              await addNoteAction(pageId, doc);
              setComposing(false);
            }}
          />
        ) : (
          <button type="button" className="note-btn primary" onClick={() => setComposing(true)}>
            + Add note
          </button>
        )}
      </div>

      <div className="noteorg-danger">
        <button
          type="button"
          className="note-btn quiet danger"
          onClick={async () => {
            if (!window.confirm('Delete this page and all its highlights and notes? The article stays saved.')) return;
            await deletePageAction(pageId);
            router.push('/noteorg');
          }}
        >
          Delete all notes for this article
        </button>
      </div>
    </>
  );
}
