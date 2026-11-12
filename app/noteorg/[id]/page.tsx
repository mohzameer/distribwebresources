import { notFound } from 'next/navigation';
import { getEntries, getPage } from '../../../src/notes';
import { TOPIC_LABELS, type Topic } from '../../../config/scoring';
import { NotePageView } from './NotePageView';

export const dynamic = 'force-dynamic';

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) notFound();
  const page = await getPage(id);
  if (!page) notFound();
  const entries = await getEntries(id);

  return (
    <main className="noteorg noteorg-page">
      <div className="top">
        <nav style={{ marginLeft: 0 }}>
          <a href="/noteorg">&larr; all notes</a>
        </nav>
      </div>

      <header className="noteorg-head">
        <div className="noteorg-kicker">
          {[page.sourceName, page.topic ? TOPIC_LABELS[page.topic as Topic] ?? page.topic : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <h1>
          <a href={page.url} target="_blank" rel="noopener noreferrer">
            {page.title}
          </a>
        </h1>
        <div className="noteorg-url">{new URL(page.url).hostname.replace(/^www\./, '')} ↗</div>
      </header>

      <NotePageView pageId={page.id} articleUrl={page.url} entries={entries} />
    </main>
  );
}
