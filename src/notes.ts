import type { JSONContent } from '@tiptap/core';
import { sql } from './db/client';
import { canonicalUrl } from './ingest/normalize';

/**
 * The knowledge manager's data layer: one note page per article, holding highlights
 * (right-clicked passages) and notes (rich text from the editor).
 *
 * Shared by the token-authed /api/notes routes the Chrome extension calls and the
 * cookie-authed /noteorg server actions, so both always agree on the rules -- chiefly
 * that a page can only be created for an article that is on the site.
 */

export type NoteDoc = JSONContent & { type: 'doc' };

export type NoteItem = {
  id: string;
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  topic: string;
};

export type NotePage = {
  id: string;
  url: string;
  title: string;
  itemId: string | null;
  sourceId: string | null;
  sourceName: string | null;
  topic: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NoteEntry = {
  id: string;
  pageId: string;
  kind: 'highlight' | 'note';
  quote: string | null;
  doc: NoteDoc | null;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type NotePageSummary = NotePage & {
  highlights: number;
  notes: number;
  snippet: string | null;
};

/** Thrown when a write targets a URL that is not an article on the site. */
export class NotAnArticleError extends Error {
  constructor(url: string) {
    super(`Not an article on the site: ${url}`);
  }
}

type PageRow = {
  id: string;
  url: string;
  title: string;
  item_id: string | null;
  source_id: string | null;
  source_name: string | null;
  topic: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type EntryRow = {
  id: string;
  page_id: string;
  kind: 'highlight' | 'note';
  quote: string | null;
  doc: NoteDoc | null;
  text: string;
  created_at: string | Date;
  updated_at: string | Date;
};

const iso = (d: string | Date): string => new Date(d).toISOString();

function toPage(r: PageRow): NotePage {
  return {
    id: String(r.id),
    url: r.url,
    title: r.title,
    itemId: r.item_id === null ? null : String(r.item_id),
    sourceId: r.source_id,
    sourceName: r.source_name,
    topic: r.topic,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function toEntry(r: EntryRow): NoteEntry {
  return {
    id: String(r.id),
    pageId: String(r.page_id),
    kind: r.kind,
    quote: r.quote,
    doc: r.doc,
    text: r.text,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Plain text of a Tiptap document: blocks on their own lines, inline runs joined. */
export function docToText(doc: NoteDoc): string {
  const text = (node: unknown): string => {
    if (!node || typeof node !== 'object') return '';
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'hardBreak') return '\n';
    if (!Array.isArray(n.content)) return '';
    const inline = n.content.every((c) => {
      const t = (c as { type?: string } | null)?.type;
      return t === 'text' || t === 'hardBreak';
    });
    return n.content.map(text).join(inline ? '' : '\n');
  };
  return text(doc).replace(/\n{3,}/g, '\n\n').trim();
}

/** Collapse a selection's whitespace the way it reads on the page. */
export function cleanQuote(quote: string): string {
  return quote.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export async function findItemForUrl(url: string): Promise<NoteItem | null> {
  const key = canonicalUrl(url);
  const rows = (await sql()`
    select id, title, url, source_id, source_name, topic
      from items
     where url_key = ${key} or hn_url = ${url}
     order by (url_key = ${key}) desc
     limit 1
  `) as { id: string; title: string; url: string; source_id: string; source_name: string; topic: string }[];
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    title: r.title,
    url: r.url,
    sourceId: r.source_id,
    sourceName: r.source_name,
    topic: r.topic,
  };
}

export async function getPageByUrl(url: string): Promise<NotePage | null> {
  const rows = (await sql()`
    select * from note_pages where url_key = ${canonicalUrl(url)}
  `) as PageRow[];
  return rows[0] ? toPage(rows[0]) : null;
}

export async function getPage(id: string): Promise<NotePage | null> {
  const rows = (await sql()`select * from note_pages where id = ${id}`) as PageRow[];
  return rows[0] ? toPage(rows[0]) : null;
}

export async function getEntries(pageId: string): Promise<NoteEntry[]> {
  const rows = (await sql()`
    select * from note_entries where page_id = ${pageId} order by created_at, id
  `) as EntryRow[];
  return rows.map(toEntry);
}

/** Everything the extension needs to decide whether, and how, to show a tab. */
export async function lookup(url: string): Promise<{
  item: NoteItem | null;
  page: NotePage | null;
  entries: NoteEntry[];
}> {
  const [item, page] = await Promise.all([findItemForUrl(url), getPageByUrl(url)]);
  return { item, page, entries: page ? await getEntries(page.id) : [] };
}

/**
 * The page for an article, created on first use. Creating one stars the item -- the same
 * two writes as toggleSaved in app/actions.ts -- so it survives the 30-day prune.
 */
async function ensurePage(url: string): Promise<NotePage> {
  const existing = await getPageByUrl(url);
  if (existing) return existing;

  const item = await findItemForUrl(url);
  if (!item) throw new NotAnArticleError(url);

  const db = sql();
  const rows = (await db`
    insert into note_pages (url, url_key, title, item_id, source_id, source_name, topic)
    values (${item.url}, ${canonicalUrl(url)}, ${item.title}, ${item.id},
            ${item.sourceId}, ${item.sourceName}, ${item.topic})
    on conflict (url_key) do update set updated_at = note_pages.updated_at
    returning *
  `) as PageRow[];

  await db`update items set saved_at = coalesce(saved_at, now()) where id = ${item.id}`;
  await db`update item_keys set disposition = 'saved' where item_id = ${item.id}`;
  return toPage(rows[0]!);
}

async function touch(pageId: string): Promise<void> {
  await sql()`update note_pages set updated_at = now() where id = ${pageId}`;
}

export async function addHighlight(url: string, quote: string): Promise<NoteEntry> {
  const page = await ensurePage(url);
  const text = cleanQuote(quote);
  const rows = (await sql()`
    insert into note_entries (page_id, kind, quote, text)
    values (${page.id}, 'highlight', ${text}, ${text})
    returning *
  `) as EntryRow[];
  await touch(page.id);
  return toEntry(rows[0]!);
}

export async function addNote(url: string, doc: NoteDoc): Promise<NoteEntry> {
  const page = await ensurePage(url);
  return addNoteToPage(page.id, doc);
}

export async function addNoteToPage(pageId: string, doc: NoteDoc): Promise<NoteEntry> {
  const rows = (await sql()`
    insert into note_entries (page_id, kind, doc, text)
    values (${pageId}, 'note', ${JSON.stringify(doc)}::jsonb, ${docToText(doc)})
    returning *
  `) as EntryRow[];
  await touch(pageId);
  return toEntry(rows[0]!);
}

/** Only notes are editable; a highlight is a quotation and stays as captured. */
export async function updateNote(id: string, doc: NoteDoc): Promise<NoteEntry | null> {
  const rows = (await sql()`
    update note_entries
       set doc = ${JSON.stringify(doc)}::jsonb, text = ${docToText(doc)}, updated_at = now()
     where id = ${id} and kind = 'note'
     returning *
  `) as EntryRow[];
  if (!rows[0]) return null;
  await touch(String(rows[0].page_id));
  return toEntry(rows[0]);
}

export async function deleteEntry(id: string): Promise<boolean> {
  const rows = (await sql()`delete from note_entries where id = ${id} returning page_id`) as {
    page_id: string;
  }[];
  if (!rows[0]) return false;
  await touch(String(rows[0].page_id));
  return true;
}

/** Deletes a page and all its entries. The item stays starred. */
export async function deletePage(id: string): Promise<void> {
  await sql()`delete from note_pages where id = ${id}`;
}

export async function listPages(search?: string): Promise<NotePageSummary[]> {
  const q = search?.trim() ? `%${search.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = (await sql()`
    select p.*,
           count(*) filter (where e.kind = 'highlight')::int as highlights,
           count(*) filter (where e.kind = 'note')::int      as notes,
           (select e2.text from note_entries e2
             where e2.page_id = p.id order by e2.created_at desc, e2.id desc limit 1) as snippet
      from note_pages p
      left join note_entries e on e.page_id = p.id
     where ${q}::text is null
        or p.title ilike ${q}
        or p.source_name ilike ${q}
        or exists (select 1 from note_entries e3 where e3.page_id = p.id and e3.text ilike ${q})
     group by p.id
     order by p.updated_at desc
     limit 500
  `) as (PageRow & { highlights: number; notes: number; snippet: string | null })[];

  return rows.map((r) => ({
    ...toPage(r),
    highlights: Number(r.highlights),
    notes: Number(r.notes),
    snippet: r.snippet,
  }));
}
