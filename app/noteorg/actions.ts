'use server';

import { revalidatePath } from 'next/cache';
import { addNoteToPage, deleteEntry, deletePage, updateNote, type NoteDoc } from '../../src/notes';

/**
 * /noteorg's writes. Cookie-authed by middleware like every other page; the Chrome
 * extension reaches the same functions in src/notes.ts through /api/notes instead.
 */

function isDoc(doc: unknown): doc is NoteDoc {
  return !!doc && typeof doc === 'object' && (doc as { type?: unknown }).type === 'doc' &&
    JSON.stringify(doc).length <= 256 * 1024;
}

function check(id: string): void {
  if (!/^\d{1,18}$/.test(id)) throw new Error('bad id');
}

export async function addNoteAction(pageId: string, doc: unknown): Promise<void> {
  check(pageId);
  if (!isDoc(doc)) throw new Error('invalid note');
  await addNoteToPage(pageId, doc);
  revalidatePath('/noteorg', 'layout');
}

export async function updateNoteAction(id: string, doc: unknown): Promise<void> {
  check(id);
  if (!isDoc(doc)) throw new Error('invalid note');
  await updateNote(id, doc);
  revalidatePath('/noteorg', 'layout');
}

export async function deleteEntryAction(id: string): Promise<void> {
  check(id);
  await deleteEntry(id);
  revalidatePath('/noteorg', 'layout');
}

export async function deletePageAction(id: string): Promise<void> {
  check(id);
  await deletePage(id);
  revalidatePath('/noteorg', 'layout');
}
