import type { ItemView } from './ItemRow';

/** Source name as a link to that source's own page. */
export function SourceLink({ item, className = 'src' }: { item: ItemView; className?: string }) {
  return (
    <a className={className} href={`/s/${item.sourceId}`}>
      {item.sourceName}
    </a>
  );
}
