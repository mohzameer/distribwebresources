import { z } from 'zod';
import { deleteEntry, updateNote, type NoteDoc } from '../../../../../src/notes';
import { DocSchema, failure, parseBody, revalidateNotes, unauthorized } from '../../../../../src/notesApi';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const Id = z.string().regex(/^\d{1,18}$/);
const Body = z.object({ doc: DocSchema });

/** PATCH { doc } -> the updated note. Highlights are not editable. */
export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const id = Id.safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'bad id' }, { status: 400 });
  const body = await parseBody(request, Body);
  if ('error' in body) return body.error;
  try {
    const entry = await updateNote(id.data, body.data.doc as NoteDoc);
    if (!entry) return Response.json({ error: 'not found' }, { status: 404 });
    revalidateNotes();
    return Response.json(entry);
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const id = Id.safeParse((await params).id);
  if (!id.success) return Response.json({ error: 'bad id' }, { status: 400 });
  try {
    if (!(await deleteEntry(id.data))) return Response.json({ error: 'not found' }, { status: 404 });
    revalidateNotes();
    return new Response(null, { status: 204 });
  } catch (err) {
    return failure(err);
  }
}
