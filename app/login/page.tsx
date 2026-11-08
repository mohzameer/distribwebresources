import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE, MAX_AGE_SECONDS, createToken } from '../../src/auth';

export const dynamic = 'force-dynamic';

/**
 * Sign in once per device. The cookie lasts a year, so this page should be a rarity.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  async function signIn(formData: FormData): Promise<void> {
    'use server';
    const password = process.env.APP_PASSWORD;
    const supplied = String(formData.get('password') ?? '');
    const target = String(formData.get('next') ?? '/') || '/';
    // Only ever redirect somewhere on this site.
    const safeTarget = target.startsWith('/') && !target.startsWith('//') ? target : '/';

    if (!password || supplied !== password) {
      redirect(`/login?error=1${safeTarget !== '/' ? `&next=${encodeURIComponent(safeTarget)}` : ''}`);
    }

    (await cookies()).set(AUTH_COOKIE, await createToken(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SECONDS,
    });
    redirect(safeTarget);
  }

  return (
    <main className="login">
      <h1>Daily Engineering News</h1>
      <form action={signIn}>
        <input type="hidden" name="next" value={next ?? '/'} />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
        />
        {error ? <p className="err">That password did not work.</p> : null}
        <button type="submit">Sign in</button>
        <p className="hint">Signs you in on this device for a year.</p>
      </form>
    </main>
  );
}
