import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, verifyToken } from './src/auth';

/**
 * Single-password gate backed by a signed cookie: you sign in once per device and stay
 * signed in for a year, rather than being re-prompted every session as Basic auth did.
 *
 * With APP_PASSWORD unset the site stays open, which is what you want locally.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (await verifyToken(token, password)) return NextResponse.next();

  const login = new URL('/login', request.url);
  // Come back to whatever you were trying to open.
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next && next !== '/') login.searchParams.set('next', next);
  return NextResponse.redirect(login);
}

export const config = {
  // /api/revalidate carries its own bearer token, and /login is the way back in, so
  // neither may sit behind the cookie check.
  matcher: ['/((?!api/revalidate|login|_next/static|_next/image|favicon.ico).*)'],
};
