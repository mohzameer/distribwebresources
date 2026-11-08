/**
 * Recompute base_score for every stored item using the CURRENT config/scoring.ts.
 *
 *   npm run rescore            -- show what would change, write nothing
 *   npm run rescore -- --apply -- write the new scores
 *
 * base_score is stored (that is what makes lane order correct at any hour with no rescore
 * job running), so editing weights does NOT retroactively reorder what is already in the
 * database. This closes that loop: edit scoring.ts, preview the diff, apply.
 *
 * Note it cannot resurrect items that an earlier hard-drop rule deleted -- a dropped item
 * leaves no trace, which is why DROP_DRY_RUN exists.
 */
import { feedById } from '../config/feeds/index';
import { getPool, closePool } from '../src/db/pool';
import { scoreItem } from '../src/ingest/score';
import type { Topic } from '../config/scoring';

type Row = {
  id: string;
  source_id: string;
  topic: Topic;
  title: string;
  summary: string | null;
  base_score: number;
  hn_points: number | null;
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pool = getPool();

  const { rows } = await pool.query<Row>(
    'select id, source_id, topic, title, summary, base_score, hn_points from items',
  );

  const updates: { id: string; from: number; to: number; debug: string; title: string }[] = [];

  for (const r of rows) {
    const scored = scoreItem({
      title: r.title,
      summary: r.summary,
      topic: r.topic,
      sourceId: r.source_id,
      hnPoints: r.hn_points,
      minScore: feedById(r.source_id)?.minScore,
    });
    const from = Number(r.base_score);
    if (Math.abs(scored.baseScore - from) < 0.005) continue;
    updates.push({
      id: r.id,
      from,
      to: scored.baseScore,
      debug: JSON.stringify(scored.debug),
      title: r.title,
    });
  }

  updates.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));

  console.log(`\n${rows.length} items scored, ${updates.length} would change\n`);
  for (const u of updates.slice(0, 25)) {
    const arrow = u.to > u.from ? '↑' : '↓';
    console.log(`  ${arrow} ${String(u.from).padStart(6)} -> ${String(u.to).padEnd(6)}  ${u.title.slice(0, 68)}`);
  }
  if (updates.length > 25) console.log(`  ... and ${updates.length - 25} more`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write these scores.\n');
    return;
  }

  if (updates.length > 0) {
    await pool.query(
      `update items i
          set base_score = t.score, score_debug = t.debug::jsonb
         from unnest($1::bigint[], $2::real[], $3::text[]) as t(id, score, debug)
        where i.id = t.id`,
      [updates.map((u) => u.id), updates.map((u) => u.to), updates.map((u) => u.debug)],
    );
  }
  console.log(`\nApplied ${updates.length} score updates.\n`);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closePool().catch(() => {});
    process.exit(1);
  });
