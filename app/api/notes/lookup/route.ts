import { lookup } from '../../../../src/notes';
import { UrlSchema, failure, unauthorized } from '../../../../src/notesApi';

export const dynamic = 'force-dynamic';

/** GET ?url= -> { item, page, entries }. item null means "not an article on the site". */
export async function GET(request: Request): Promise<Response> {
  const denied = unauthorized(request);
  if (denied) return denied;
  const url = UrlSchema.safeParse(new URL(request.url).searchParams.get('url'));
  if (!url.success) return Response.json({ error: 'url is required' }, { status: 400 });
  try {
    return Response.json(await lookup(url.data));
  } catch (err) {
    return failure(err);
  }
}
