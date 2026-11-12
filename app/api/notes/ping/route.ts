import { unauthorized } from '../../../../src/notesApi';

export const dynamic = 'force-dynamic';

/** Connection test for the extension's options page. */
export async function GET(request: Request): Promise<Response> {
  return unauthorized(request) ?? Response.json({ ok: true });
}
