import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

/**
 * Called by the ingest job when a run finishes, so the cached page picks up new articles
 * without waiting for the ISR window or a redeploy.
 *
 * This is the one place a route handler is the right tool rather than a server action: it
 * has to be callable with curl from GitHub Actions.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return new Response('not configured', { status: 503 });

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response('unauthorized', { status: 401 });
  }

  revalidatePath('/');
  revalidatePath('/saved');
  revalidatePath('/health');
  return new Response(null, { status: 204 });
}
