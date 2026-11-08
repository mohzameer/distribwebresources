import { notFound } from 'next/navigation';
import { LaneSection } from '../../../components/Lane';
import { buildLanes, getWindow } from '../../../src/lanes';
import { TOPICS, type Topic } from '../../../config/scoring';
import { toView } from '../../../src/view';

export const revalidate = 300;

/** Prerender all five lanes so they are cached like the home page, not server-rendered. */
export function generateStaticParams(): { topic: string }[] {
  return TOPICS.map((topic) => ({ topic }));
}

/** One lane, uncapped: everything that passed the per-source caps, newest ranking first. */
export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!TOPICS.includes(topic as Topic)) notFound();

  const items = await getWindow();
  const lane = buildLanes(items).find((l) => l.topic === topic);
  if (!lane) notFound();

  const now = Date.now();
  const all = [...lane.visible, ...lane.overflow];

  return (
    <main>
      <div className="top">
        <h1>{lane.label}</h1>
        <nav>
          <a href="/">&larr; all lanes</a>
        </nav>
      </div>
      <p className="meta">{all.length} articles</p>
      <LaneSection
        label={lane.label}
        topic={lane.topic}
        total={all.length}
        visible={all.map((i) => toView(i, now))}
        overflow={[]}
      />
    </main>
  );
}
