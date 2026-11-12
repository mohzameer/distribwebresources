import { renderToReactElement } from '@tiptap/static-renderer/pm/react';
import type { JSONContent } from '@tiptap/core';
import { noteExtensions } from './editorExtensions';

/**
 * Renders a saved note as plain React on the server: no editor, no client JavaScript.
 * Built from the same extension list as NoteEditor, so the output matches what was typed.
 */
export function NoteDocView({ doc, className = '' }: { doc: JSONContent; className?: string }) {
  return (
    <div className={`note-prose ${className}`.trim()}>
      {renderToReactElement({ content: doc, extensions: noteExtensions })}
    </div>
  );
}
