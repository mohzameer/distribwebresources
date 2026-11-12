import { decode } from 'html-entities';

/**
 * Query params that identify a campaign or referrer rather than the document. Dropping
 * them is what lets the same article arrive from a blog, a Medium mirror and a Hacker News
 * submission and still collapse to one `url_key`.
 *
 * Two kinds of entry: families matched by PREFIX (`utm_source`, `mc_cid`, `at_medium`...),
 * and single params matched EXACTLY. Keep them apart -- inside one `^(?:...)$` group a
 * prefix like `utm_` only ever matched a param literally named "utm_".
 */
const TRACKING_PARAM =
  /^(?:(?:utm|mc|at)_.*|mkt_tok|fbclid|gclid|igshid|_hsenc|_hsmi|__s|ref|referer|referrer|source|si|gi|cmp|campaign)$/i;

/**
 * Canonicalize a URL for dedupe. Deliberately conservative: we never touch the path except
 * to drop a trailing slash, because Medium's trailing `-abc123def456` slug hash IS part of
 * the document's identity.
 */
export function canonicalUrl(input: string): string {
  const trimmed = input.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  if (u.protocol === 'http:') u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
    u.port = '';
  }

  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();

  let out = u.toString();
  out = out.replace(/\?$/, '');
  // collapse a trailing slash, but never turn "https://host" into "https://host"
  if (u.pathname !== '/' && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

const TITLE_PREFIX =
  /^(?:show hn:|ask hn:|tell hn:|\[video\]|\[pdf\]|\[audio\]|\[sponsored\])\s*/i;

/** Normalize a title for the (guarded) title dedupe key. */
export function normalizeTitle(title: string): string {
  return decode(title)
    .normalize('NFKD')
    .toLowerCase()
    .replace(TITLE_PREFIX, '')
    // drop a trailing " | Company Blog" / " - Company Engineering" style suffix
    .replace(/\s*[|–—-]\s*[^|–—-]{0,40}(?:blog|engineering|tech)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

/** Strip markup and entities down to readable text. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Strip syndication boilerplate that WordPress and friends append to every summary --
 * "The post X appeared first on Y.", "Continue reading...", "Read more". Several of the
 * busiest feeds (The New Stack, CNCF, Docker, the AWS blogs) carry it on every item, where
 * it crowds out the actual summary in a two-line clamp.
 */
export function stripBoilerplate(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\s*The post .{0,200}? appeared first on .{0,80}?\.?\s*$/i, '')
    .replace(/\s*(?:\[?(?:Continue reading|Read more|Read the full story|The post)\]?)\s*(?:\u2026|\.\.\.)?\s*$/i, '')
    .replace(/\s*\u2192\s*$/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function truncate(text: string | null, max: number): string | null {
  if (!text) return null;
  if (text.length <= max) return text;
  // cut on a word boundary so summaries don't end mid-word
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export function cleanTitle(title: string): string {
  return decode(title).replace(/\s+/g, ' ').trim();
}

/**
 * Pull a usable image out of a feed item, in descending order of trustworthiness:
 * a declared <image>, then a media:* element, then the first <img> in the body HTML.
 * Returns null freely -- 19 of our feeds never carry one.
 */
export function extractImage(raw: {
  image?: { url?: string | null } | null;
  media?: Array<{ url?: string | null; image?: string | null; mimeType?: string | null }>;
  content?: string | null;
  description?: string | null;
}): string | null {
  const candidate = (() => {
    if (raw.image?.url) return raw.image.url;
    for (const m of raw.media ?? []) {
      if (m.image) return m.image;
      if (m.url && /^image\//.test(m.mimeType ?? '')) return m.url;
    }
    const html = `${raw.content ?? ''}${raw.description ?? ''}`;
    return html.match(/<img[^>]+src=["\']([^"\']+)["\']/i)?.[1] ?? null;
  })();

  if (!candidate) return null;
  const url = candidate.trim();
  // Only absolute https: a relative or http src would break or mixed-content-block.
  if (!/^https:\/\//i.test(url)) return null;
  // Tracking pixels and spacers are worse than no image at all.
  if (/\b(1x1|pixel|spacer|blank|tracking)\b/i.test(url)) return null;
  return url.length <= 1000 ? url : null;
}
