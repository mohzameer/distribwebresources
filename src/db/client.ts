import { neon } from '@neondatabase/serverless';

/**
 * HTTP driver for the web app: no TCP handshake and no connection pool to exhaust across
 * serverless invocations. The ingest script uses the `pg` pool in pool.ts instead.
 */
let cached: ReturnType<typeof neon> | undefined;

export function sql(): ReturnType<typeof neon> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    cached = neon(url);
  }
  return cached;
}
