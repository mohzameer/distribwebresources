/**
 * Signed-cookie auth for a single user.
 *
 * Basic auth re-prompted on every new browser session, which is miserable on a page you
 * open each morning from a phone. This signs you in once per device and remembers it for a
 * year, while keeping the site private.
 *
 * The cookie is `<expiry>.<hmac>` where the HMAC is keyed on APP_PASSWORD itself, so it
 * cannot be forged without the password -- and changing the password invalidates every
 * existing session, which is the behaviour you want.
 *
 * Uses Web Crypto rather than node:crypto because middleware runs on the edge runtime.
 */
export const AUTH_COOKIE = 'news_auth';
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64url(new Uint8Array(signature));
}

/** Constant-time compare; edge has no timingSafeEqual. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createToken(secret: string): Promise<string> {
  const expiry = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${expiry}.${await hmac(secret, expiry)}`;
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(signature, await hmac(secret, expiry));
}
