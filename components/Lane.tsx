import { ItemRow, type ItemView } from './ItemRow';

export function LaneSection({
  label,
  topic,
  visible,
  overflow,
  total,
}: {
  label: string;
  topic: string;
  visible: ItemView[];
  overflow: ItemView[];
  total: number;
}) {
  return (
    <section className="lane">
      <div className="lane-head">
        <h2>{label}</h2>
        <span className="count">{total}</span>
        <a href={`/t/${topic}`}>all &rarr;</a>
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nothing here right now.</p>
      ) : (
        <div className="rows">
          {visible.map((i) => (
            <ItemRow key={i.id} item={i} />
          ))}
        </div>
      )}

      {/* <details> rather than a client component: "show more" needs no JavaScript. */}
      {overflow.length > 0 ? (
        <details className="more">
          <summary>{overflow.length} more</summary>
          <div className="rows">
            {overflow.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
