import { notFound } from 'next/navigation';
import { VariantNav, VARIANT_SLUGS, variantMeta } from '../../../components/VariantNav';
import { Digest } from '../../../components/variants/Digest';
import { Cards } from '../../../components/variants/Cards';
import { Compact } from '../../../components/variants/Compact';
import { Timeline, type DayGroup } from '../../../components/variants/Timeline';
import { buildLanes, getWindow, type Item } from '../../../src/lanes';
import { SCORING } from '../../../config/scoring';
import { toView } from '../../../src/view';

export const revalidate = 300;

export function generateStaticParams() {
  return VARIANT_SLUGS.map((variant) => ({ variant }));
}

/** Same per-source caps as the lanes, applied across the whole window. */
function capPerSource(items: Item[], fallback = 3): Item[] {
  const used = new Map<string, number>();
  const out: Item[] = [];
  for (const i of items) {
    const cap = SCORING.caps.perSource[i.sourceId] ?? fallback;
    const n = used.get(i.sourceId) ?? 0;
    if (n >= cap) continue;
    used.set(i.sourceId, n + 1);
    out.push(i);
  }
  return out;
}

function groupByDay(items: Item[], now: number): DayGroup[] {
  const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString();
  const groups = new Map<string, DayGroup>();

  for (const item of items) {
    const key = item.publishedAt.toDateString();
    const label = key === today ? 'Today' : key === yesterday ? 'Yesterday' : fmt.format(item.publishedAt);
    let g = groups.get(key);
    if (!g) {
      g = { label, items: [] };
      groups.set(key, g);
    }
    g.items.push(toView(item, now));
  }
  return [...groups.values()].slice(0, 7);
}

export default async function VariantPage({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const meta = variantMeta(variant);
  if (!meta) notFound();

  let items: Item[];
  try {
    items = await getWindow();
  } catch (err) {
    return (
      <main>
        <VariantNav active={variant} />
        <div className="banner">Could not reach the database. {err instanceof Error ? err.message : ''}</div>
      </main>
    );
  }

  const now = Date.now();
  const lanes = buildLanes(items).map((l) => ({
    ...l,
    visible: l.visible.map((i) => toView(i, now)),
    overflow: l.overflow.map((i) => toView(i, now)),
  }));

  let body: React.ReactNode;
  if (variant === 'digest') {
    // renderScore is comparable across topics: same formula, per-topic half-lives.
    const ranked = capPerSource([...items].sort((a, b) => b.renderScore - a.renderScore), 2).slice(0, 24);
    body = <Digest items={ranked.map((i) => toView(i, now))} />;
  } else if (variant === 'cards') {
    body = <Cards lanes={lanes} />;
  } else if (variant === 'compact') {
    body = <Compact lanes={lanes} />;
  } else {
    const chronological = capPerSource(
      [...items].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()),
      6,
    );
    body = <Timeline days={groupByDay(chronological, now)} />;
  }

  return (
    <main>
      <VariantNav active={variant} />
      <div className="top">
        <h1>{meta.label}</h1>
        <nav>
          <a href="/saved">saved</a>
          <a href="/health">health</a>
        </nav>
      </div>
      <p className="meta">{meta.hint} · {items.length} articles · {items.filter((i) => !i.readAt).length} unread</p>
      {body}
    </main>
  );
}
