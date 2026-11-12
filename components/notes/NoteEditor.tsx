'use client';

import { useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { Placeholder } from '@tiptap/extensions';
import { noteExtensions } from './editorExtensions';

export type NoteDocJSON = JSONContent & { type: 'doc' };

type Props = {
  initial?: NoteDocJSON | null;
  /** Resolve to close; throw to keep the editor open and show the error. */
  onSave: (doc: NoteDocJSON) => Promise<void>;
  onCancel?: () => void;
  /** Every change, for draft autosave. */
  onChange?: (doc: NoteDocJSON) => void;
  saveLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * A Substack-style writing surface: a quiet serif page with no toolbar until you need one.
 * Select text for the inline menu (bold, italic, link, headings, quote, lists, code); an
 * empty line offers block types; markdown shortcuts (## , > , - , 1. , **x**) just work.
 * Cmd/Ctrl+Enter saves.
 */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
  onChange,
  saveLabel = 'Save note',
  placeholder = 'Write your note…',
  autoFocus = true,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const editorRef = useRef<Editor | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const editor = useEditor({
    extensions: [...noteExtensions, Placeholder.configure({ placeholder })],
    content: initial ?? undefined,
    autofocus: autoFocus ? 'end' : false,
    // Required under Next's server rendering; harmless in the extension.
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'note-prose note-editable', spellcheck: 'true' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          saveRef.current();
          return true;
        }
        if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey) && editorRef.current) {
          setLink(editorRef.current);
          return true;
        }
        if (event.key === 'Escape' && onCancel) {
          onCancel();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current?.(e.getJSON() as NoteDocJSON),
  });

  editorRef.current = editor;

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const text = e?.getText().trim() ?? '';
      return text ? text.split(/\s+/).length : 0;
    },
  });

  const save = async () => {
    if (!editor || saving || editor.isEmpty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(editor.getJSON() as NoteDocJSON);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = () => void save();

  return (
    <div className="note-editor">
      {editor ? <InlineMenu editor={editor} /> : null}
      {editor ? <BlockMenu editor={editor} /> : null}
      <EditorContent editor={editor} />
      <div className="note-editor-foot">
        <span className="note-editor-hint">
          {words ? `${words} word${words === 1 ? '' : 's'} · ` : ''}⌘↵ to save
        </span>
        {error ? <span className="note-editor-err">{error}</span> : null}
        <span className="note-editor-actions">
          {onCancel ? (
            <button type="button" className="note-btn ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="note-btn primary"
            onClick={() => void save()}
            disabled={saving || words === 0}
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </span>
      </div>
    </div>
  );
}

function useActive(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      quote: e.isActive('blockquote'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
    }),
  });
}

function setLink(editor: Editor) {
  const previous = editor.getAttributes('link').href as string | undefined;
  const url = window.prompt('Link URL', previous ?? 'https://');
  if (url === null) return;
  const chain = editor.chain().focus().extendMarkRange('link');
  if (url.trim() === '') chain.unsetLink().run();
  else chain.setLink({ href: url.trim() }).run();
}

function Btn({
  on,
  label,
  title,
  onClick,
  className,
}: {
  on?: boolean;
  label: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      className={`note-menu-btn${on ? ' on' : ''}${className ? ` ${className}` : ''}`}
      // Keep the selection: a mousedown on a button would otherwise collapse it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function InlineMenu({ editor }: { editor: Editor }) {
  const a = useActive(editor);
  const c = () => editor.chain().focus();
  return (
    <BubbleMenu editor={editor} className="note-menu">
      <Btn on={a.bold} label={<b>B</b>} title="Bold (⌘B)" onClick={() => c().toggleBold().run()} />
      <Btn on={a.italic} label={<i>I</i>} title="Italic (⌘I)" onClick={() => c().toggleItalic().run()} />
      <Btn on={a.strike} label={<s>S</s>} title="Strikethrough" onClick={() => c().toggleStrike().run()} />
      <Btn on={a.code} label="</>" title="Inline code" onClick={() => c().toggleCode().run()} />
      <Btn on={a.link} label="Link" title="Link (⌘K)" onClick={() => setLink(editor)} />
      <span className="note-menu-sep" />
      <Btn on={a.h2} label="H2" title="Heading" onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <Btn on={a.h3} label="H3" title="Subheading" onClick={() => c().toggleHeading({ level: 3 }).run()} />
      <Btn on={a.quote} label="“" title="Quote" className="serif" onClick={() => c().toggleBlockquote().run()} />
      <Btn on={a.bullet} label="•" title="Bulleted list" onClick={() => c().toggleBulletList().run()} />
      <Btn on={a.ordered} label="1." title="Numbered list" onClick={() => c().toggleOrderedList().run()} />
    </BubbleMenu>
  );
}

/** Offered on an empty line, like Substack's block "+" menu. */
function BlockMenu({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus();
  return (
    <FloatingMenu editor={editor} className="note-menu note-menu-block">
      <Btn label="H2" title="Heading" onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <Btn label="H3" title="Subheading" onClick={() => c().toggleHeading({ level: 3 }).run()} />
      <Btn label="“" title="Quote" className="serif" onClick={() => c().toggleBlockquote().run()} />
      <Btn label="•" title="Bulleted list" onClick={() => c().toggleBulletList().run()} />
      <Btn label="1." title="Numbered list" onClick={() => c().toggleOrderedList().run()} />
      <Btn label="{ }" title="Code block" onClick={() => c().toggleCodeBlock().run()} />
      <Btn label="—" title="Divider" onClick={() => c().setHorizontalRule().run()} />
    </FloatingMenu>
  );
}
