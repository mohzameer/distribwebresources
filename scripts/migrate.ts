/**
 * Minimal forward-only migration runner: applies every migrations/NNN_*.sql that is not
 * already recorded in schema_migrations, in filename order.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPool, closePool } from '../src/db/pool';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations');

export async function pendingMigrations(): Promise<string[]> {
  const pool = getPool();
  await pool.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )`);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied = await pool.query<{ filename: string }>('select filename from schema_migrations');
  const done = new Set(applied.rows.map((r) => r.filename));
  return files.filter((f) => !done.has(f));
}

async function main(): Promise<void> {
  const pool = getPool();
  const pending = await pendingMigrations();

  if (pending.length === 0) {
    console.log('migrate: nothing to do, schema is current');
    return;
  }

  for (const filename of pending) {
    const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [filename]);
      await client.query('commit');
      console.log(`migrate: applied ${filename}`);
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw new Error(`migrate: ${filename} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
    }
  }
}

const isMain = process.argv[1] && import.meta.filename === process.argv[1];
if (isMain) {
  main()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error(err instanceof Error ? err.message : err);
      await closePool().catch(() => {});
      process.exit(1);
    });
}
