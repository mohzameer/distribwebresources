'use server';

import { revalidatePath } from 'next/cache';
import { sql } from '../src/db/client';

/**
 * Server actions rather than route handlers: no JSON contract to keep in sync, no public
 * API surface to authenticate separately, and the cache is invalidated in the same call.
 *
 * Each action also writes `item_keys.disposition`. That is what carries your decision
 * across the 30-day prune -- when an article is deleted and later re-syndicated (an HN
 * submission six weeks on), the surviving hash tombstone remembers you already read it.
 */

export async function toggleRead(id: string, read: boolean): Promise<void> {
  const db = sql();
  await db`update items set read_at = ${read ? new Date() : null} where id = ${id}`;
  await db`
    update item_keys set disposition = ${read ? 'read' : 'none'}
     where item_id = ${id} and disposition <> 'saved'`;
  // '/' is the recommended edition, so a read is also new training signal there.
  revalidatePath('/');
  revalidatePath('/front');
}

export async function toggleSaved(id: string, saved: boolean): Promise<void> {
  const db = sql();
  await db`update items set saved_at = ${saved ? new Date() : null} where id = ${id}`;
  // 'saved' on the key row keeps the tombstone alive and marks why it is being kept.
  await db`
    update item_keys set disposition = ${saved ? 'saved' : 'none'}
     where item_id = ${id}`;
  revalidatePath('/');
  revalidatePath('/front');
  revalidatePath('/saved');
}
