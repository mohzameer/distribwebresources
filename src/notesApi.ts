import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { NotAnArticleError } from './notes';

/**
 * Shared plumbing for /api/notes/*, the surface the Chrome extension talks to.
 *
 * These routes sit outside the cookie gate in middleware.ts and carry their own bearer
 * token instead: an extension cannot reliably send the site's SameSite cookie, and a
 * separate token can be rotated without signing you out of the site.
 */
export function unauthorized(request: Request): Response | null {
  const secret = process.env.NOTES_API_TOKEN;
  if (!secret) return Response.json({ error: 'NOTES_API_TOKEN is not set' }, { status: 503 });
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

const MAX_DOC_BYTES = 256 * 1024;

export const DocSchema = z
  .object({ type: z.literal('doc'), content: z.array(z.unknown()).optional() })
  .passthrough()
  .refine((d) => JSON.stringify(d).length <= MAX_DOC_BYTES, 'note is too large');

export const UrlSchema = z.string().url().max(4096);

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: Response.json({ error: 'invalid JSON' }, { status: 400 }) };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { error: Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 }) };
  }
  return { data: parsed.data };
}

export function failure(err: unknown): Response {
  if (err instanceof NotAnArticleError) {
    return Response.json({ error: 'not an article on the site' }, { status: 404 });
  }
  console.error('notes api:', err);
  return Response.json({ error: 'server error' }, { status: 500 });
}

/** A first note stars its article, which changes these pages. */
export function revalidateNotes(): void {
  revalidatePath('/');
  revalidatePath('/front');
  revalidatePath('/saved');
  revalidatePath('/noteorg', 'layout');
}
