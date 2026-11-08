import { ItemRow } from '../../components/ItemRow';
import { getSaved } from '../../src/lanes';
import { RETENTION } from '../../config/retention';
import { toView } from '../../src/view';

export const revalidate = 60;

/**
 * Saved items are exempt from the TTL: `saved_at is not null` is excluded from the prune
 * predicate, and each row carries a denormalized source_name so it still renders correctly
 * years later even if that feed has since been removed from config.
 */
export default async function SavedPage() {
  const items = await getSaved();
  const now = Date.now();

  return (
    <main>
      <div className="top">
        <h1>Saved</h1>
        <nav>
          <a href="/">&larr; all lanes</a>
        </nav>
      </div>
      <p className="meta">
        {items.length} kept {'·'} never deleted (everything else goes after{' '}
        {RETENTION.itemTtlDays} days)
      </p>

      {items.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Use the {'☆'} on any article to keep it past the{' '}
          {RETENTION.itemTtlDays}-day window.
        </p>
      ) : (
        <div className="rows">
          {items.map((i) => (
            <ItemRow key={String(i.id)} item={toView(i, now)} />
          ))}
        </div>
      )}
    </main>
  );
}
