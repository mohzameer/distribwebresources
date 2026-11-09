const VARIANTS = [
  { slug: 'digest', label: 'Digest', hint: 'One ranked list of the best today' },
  { slug: 'cards', label: 'Cards', hint: 'Image-led grid by topic' },
  { slug: 'compact', label: 'Compact', hint: 'Two columns, titles only' },
  { slug: 'timeline', label: 'Timeline', hint: 'Chronological, newest first' },
] as const;

export type VariantSlug = (typeof VARIANTS)[number]['slug'];
export const VARIANT_SLUGS = VARIANTS.map((v) => v.slug);
export function variantMeta(slug: string) {
  return VARIANTS.find((v) => v.slug === slug);
}

export function VariantNav({ active }: { active: string }) {
  return (
    <div className="variant-nav">
      <span className="vn-label">Layout</span>
      {VARIANTS.map((v) => (
        <a key={v.slug} href={`/v/${v.slug}`} className={v.slug === active ? 'on' : ''} title={v.hint}>
          {v.label}
        </a>
      ))}
      <a href="/front" className="vn-current">front page</a>
      <a href="/" className="vn-current vn-home">recommended &rarr;</a>
    </div>
  );
}
