import { listPages } from '../../src/notes';
import { TOPIC_LABELS, type Topic } from '../../config/scoring';
import { ageLabel } from '../../src/view';

export const dynamic = 'force-dynamic';

/**
 * Every article you have taken notes on, most recently touched first. Organizing them
 * (tags, collections) comes later; for now this is the index plus a search.
 */
export default async function NoteOrg({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const pages = await listPages(q);
  const now = Date.now();
  const totals = pages.reduce(
    (acc, p) => ({ h: acc.h + p.highlights, n: acc.n + p.notes }),
    { h: 0, n: 0 },
  );

  return (
    <main className="noteorg">
      <div className="top">
        <h1>Notes</h1>
        <nav>
          <a href="/">&larr; news</a>
          <a href="/saved">saved</a>
        </nav>
      </div>
      <p className="meta">
        {pages.length} article{pages.length === 1 ? '' : 's'} · {totals.h} highlight
        {totals.h === 1 ? '' : 's'} · {totals.n} note{totals.n === 1 ? '' : 's'}
        {q ? ` matching “${q}”` : ''}
      </p>

      <form className="noteorg-search" action="/noteorg" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search titles, highlights and notes"
          aria-label="Search notes"
        />
        {q ? <a href="/noteorg">clear</a> : null}
      </form>

      {pages.length === 0 ? (
        <p className="empty">
          {q
            ? 'Nothing matches that.'
            : 'No notes yet. Open an article from the site, then right-click a passage or click the extension to start.'}
        </p>
      ) : (
        <ol className="noteorg-list">
          {pages.map((p) => (
            <li key={p.id}>
              <a className="noteorg-title" href={`/noteorg/${p.id}`}>
                {p.title}
              </a>
              <div className="noteorg-sub">
                {p.sourceName ? <span>{p.sourceName}</span> : null}
                {p.topic ? <span>{TOPIC_LABELS[p.topic as Topic] ?? p.topic}</span> : null}
                <span>
                  {p.highlights} highlight{p.highlights === 1 ? '' : 's'} · {p.notes} note
                  {p.notes === 1 ? '' : 's'}
                </span>
                <span>{ageLabel(new Date(p.updatedAt), now)}</span>
              </div>
              {p.snippet ? <p className="noteorg-snippet">{p.snippet}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
