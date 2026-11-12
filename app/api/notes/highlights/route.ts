import { z } from 'zod';
import { addHighlight } from '../../../../src/notes';
import { UrlSchema, failure, parseBody, revalidateNotes, unauthorized } from '../../../../src/notesApi';

export const dynamic = 'force-dynamic';

const Body = z.object({ url: UrlSchema, quote: z.string().trim().min(1).max(20_000) });

/** POST { url, quote } -> the new highlight entry. */
export async function POST(request: Request): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const body = await parseBody(request, Body);
  if ('error' in body) return body.error;
  try {
    const entry = await addHighlight(body.data.url, body.data.quote);
    revalidateNotes();
    return Response.json(entry, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
