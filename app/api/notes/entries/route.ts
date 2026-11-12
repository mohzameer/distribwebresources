import { z } from 'zod';
import { addNote, type NoteDoc } from '../../../../src/notes';
import { DocSchema, UrlSchema, failure, parseBody, revalidateNotes, unauthorized } from '../../../../src/notesApi';

export const dynamic = 'force-dynamic';

const Body = z.object({ url: UrlSchema, doc: DocSchema });

/** POST { url, doc } -> the new note entry. */
export async function POST(request: Request): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const body = await parseBody(request, Body);
  if ('error' in body) return body.error;
  try {
    const entry = await addNote(body.data.url, body.data.doc as NoteDoc);
    revalidateNotes();
    return Response.json(entry, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
