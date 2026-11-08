/**
 * Show the scoring decision for every item in one feed, live.
 *
 *   npm run sample -- aws-whats-new
 *   npm run sample -- hn-top --all
 *
 * This is the tuning loop: a deterministic scorer is only as good as your ability to see
 * WHY it ranked or dropped something. Touches no database.
 */
import { feedById, ENABLED_FEEDS } from '../config/feeds/index';
import { fetchFeed } from '../src/ingest/fetch';
import { parseItems } from '../src/ingest/parse';
import { scoreItem } from '../src/ingest/score';
import { recency } from '../config/scoring';

async function main(): Promise<void> {
  const id = process.argv[2];
  const showAll = process.argv.includes('--all');

  if (!id) {
    console.error('usage: npm run sample -- <feed-id> [--all]\n');
    console.error('feeds:', ENABLED_FEEDS.map((f) => f.id).join(', '));
    process.exit(1);
  }

  const feed = feedById(id);
  if (!feed) {
    console.error(`no such feed: ${id}`);
    process.exit(1);
  }

  const res = await fetchFeed(feed.url);
  if (res.status !== 'ok') {
    console.error(`fetch ${res.status}:`, res.status === 'failed' ? res.error : '');
    process.exit(1);
  }

  const items = parseItems(feed, res.body);
  console.log(`\n${feed.name} (${feed.id})  --  ${items.length} items inside the retention window\n`);

  let kept = 0;
  for (const item of items) {
    const s = scoreItem({
      title: item.title,
      summary: item.summary,
      topic: item.topic,
      sourceId: item.sourceId,
      hnPoints: item.hnPoints ?? null,
      minScore: feed.minScore,
    });
    if (s.hardDrop) {
      console.log(`  DROP  ${(s.dropReason ?? '').padEnd(22)} ${item.title.slice(0, 88)}`);
      continue;
    }
    kept += 1;
    const ageH = (Date.now() - item.publishedAt.getTime()) / 3_600_000;
    const render = (s.baseScore * recency(ageH, item.topic)).toFixed(2);
    const why = [
      ...s.debug.kw.map(([, w]) => `kw+${w}`),
      ...s.debug.noise.map(([w]) => `noise:${w}`),
      s.debug.src !== 0 ? `src${s.debug.src > 0 ? '+' : ''}${s.debug.src}` : '',
      ...s.debug.sig.map(([n, w]) => `${n}${w > 0 ? '+' : ''}${w}`),
    ].filter(Boolean).join(' ');
    console.log(
      `  keep  base=${String(s.baseScore).padEnd(6)} render=${render.padEnd(6)} ` +
      `${Math.round(ageH)}h  ${item.title.slice(0, 70)}`,
    );
    if (showAll && why) console.log(`        ${why}`);
  }

  console.log(`\nkept ${kept} / ${items.length}  (dropped ${items.length - kept})\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
