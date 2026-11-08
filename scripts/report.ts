/**
 * Render the last ingest run as a markdown table.
 *
 *   npm run report -- --summary   -> stdout, appended to $GITHUB_STEP_SUMMARY in CI
 *   npm run report -- --issue     -> upsert a single "Feed health" GitHub issue via gh
 *
 * The issue is the channel that actually reaches you: GitHub emails on issue activity, so
 * it is a free notification path with no SMTP and no secret beyond GITHUB_TOKEN. It uses a
 * fixed title and is reused, so you get one long-lived issue rather than hundreds.
 */
import { execFileSync } from 'node:child_process';
import { FEEDS } from '../config/feeds/index';
import { getPool, closePool } from '../src/db/pool';

const ISSUE_TITLE = 'Feed health';
const WARN_AFTER = 6; // 2 runs/day => 3 days

type HealthRow = {
  source_id: string;
  consecutive_failures: number;
  last_error: string | null;
  last_status: number | null;
  newest_published_at: string | null;
  auto_disabled_at: string | null;
};

async function build(): Promise<{ summary: string; problems: string | null }> {
  const pool = getPool();
  const byId = new Map(FEEDS.map((f) => [f.id, f]));

  const { rows: run } = await pool.query(
    `select started_at, feeds_total, feeds_ok, feeds_failed, items_seen, items_inserted,
            items_merged, items_dropped, pruned_items, pruned_keys, duration_ms
       from ingest_runs where finished_at is not null order by started_at desc limit 1`,
  );
  const { rows: health } = await pool.query<HealthRow>(
    `select source_id, consecutive_failures, last_error, last_status,
            newest_published_at, auto_disabled_at
       from feed_health order by consecutive_failures desc, source_id`,
  );
  const { rows: counts } = await pool.query(
    'select count(*)::int as items, count(*) filter (where saved_at is not null)::int as saved from items',
  );

  const r = run[0];
  const c = counts[0];
  const lines: string[] = ['## Ingest run', ''];
  if (r) {
    lines.push(
      `- **${r.feeds_ok}/${r.feeds_total}** feeds ok, **${r.feeds_failed}** failed`,
      `- **${r.items_inserted}** new, ${r.items_merged} already known, ${r.items_dropped} dropped as noise`,
      `- pruned **${r.pruned_items}** articles past the TTL, ${r.pruned_keys} tombstones`,
      `- ${c?.items ?? 0} articles stored (${c?.saved ?? 0} saved), ${Math.round((r.duration_ms ?? 0) / 1000)}s`,
      '',
    );
  } else {
    lines.push('No completed run recorded.', '');
  }

  const failing = health.filter((h) => h.consecutive_failures >= WARN_AFTER);
  const stale = health.filter((h) => {
    const cfg = byId.get(h.source_id);
    if (!cfg || cfg.slow || h.consecutive_failures >= WARN_AFTER || !h.newest_published_at) return false;
    const ageDays = (Date.now() - new Date(h.newest_published_at).getTime()) / 86_400_000;
    return ageDays > cfg.expectCadenceDays * 3;
  });

  const problems: string[] = [];
  if (failing.length > 0) {
    problems.push('### Failing', '', '| feed | fails | http | error |', '| --- | --- | --- | --- |');
    for (const f of failing) {
      problems.push(
        `| \`${f.source_id}\`${f.auto_disabled_at ? ' (auto-disabled)' : ''} | ${f.consecutive_failures} | ${f.last_status ?? '-'} | ${(f.last_error ?? '').slice(0, 120).replace(/\|/g, '\\|')} |`,
      );
    }
    problems.push('');
  }
  if (stale.length > 0) {
    problems.push('### Stale (returns 200, stopped publishing)', '', '| feed | newest post |', '| --- | --- |');
    for (const f of stale) {
      problems.push(`| \`${f.source_id}\` | ${f.newest_published_at?.slice(0, 10)} |`);
    }
    problems.push('');
  }

  return {
    summary: [...lines, ...problems].join('\n'),
    problems: problems.length > 0 ? problems.join('\n') : null,
  };
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

async function main(): Promise<void> {
  const { summary, problems } = await build();

  if (process.argv.includes('--summary')) {
    console.log(summary);
  }

  if (process.argv.includes('--issue')) {
    let existing = '';
    try {
      existing = gh(['issue', 'list', '--search', `"${ISSUE_TITLE}" in:title`, '--state', 'open', '--json', 'number', '--jq', '.[0].number // ""']);
    } catch {
      console.error('report: gh unavailable, skipping issue upsert');
      return;
    }

    if (problems) {
      const body = `Automated feed health report. Closed automatically when everything is green.\n\n${problems}`;
      if (existing) gh(['issue', 'edit', existing, '--body', body]);
      else gh(['issue', 'create', '--title', ISSUE_TITLE, '--body', body]);
    } else if (existing) {
      gh(['issue', 'close', existing, '--comment', 'All feeds healthy again.']);
    }
  }
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closePool().catch(() => {});
    process.exit(0); // reporting must never fail the run
  });
