import { Pool } from 'pg';

/**
 * Node-side pool for the ingest script and migrations. The web app uses the HTTP driver in
 * client.ts instead -- there is no connection pool to exhaust across serverless
 * invocations there.
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
