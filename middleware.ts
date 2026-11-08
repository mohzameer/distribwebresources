import { NextResponse, type NextRequest } from 'next/server';

/**
 * Single-password gate. It is a personal site with mutable state on a public URL, so this
 * is the cheapest adequate protection: no provider, no cost, ~20 lines.
 *
 * If APP_PASSWORD is unset the site stays open, which is what you want locally.
 */
export function middleware(request: NextRequest): NextResponse {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const supplied = decoded.slice(decoded.indexOf(':') + 1);
    if (supplied === password) return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="news", charset="UTF-8"' },
  }) as NextResponse;
}

export const config = {
  // /api/revalidate carries its own bearer token, so it must not sit behind Basic auth.
  matcher: ['/((?!api/revalidate|_next/static|_next/image|favicon.ico).*)'],
};
