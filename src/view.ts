import type { ItemView } from '../components/ItemRow';
import type { Item } from './lanes';
import type { Topic } from '../config/scoring';

/** "3h" / "2d" / "Nov 3" -- compact enough for a dense scannable row. */
export function ageLabel(date: Date, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - date.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 8) return `${days}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Several feeds (The New Stack among them) publish ~125-character excerpts that stop
 * mid-sentence. That is their truncation, not ours -- we store up to 600 characters. An
 * ellipsis makes the cut read as deliberate rather than as a rendering bug.
 */
function tidySummary(summary: string | null): string | null {
  if (!summary) return null;
  const text = summary.trimEnd();
  return /[.!?\u2026"')\]]$/.test(text) ? text : `${text}\u2026`;
}

export function toView(item: Item, now = Date.now()): ItemView {
  return {
    id: String(item.id),
    title: item.title,
    url: item.url,
    sourceId: item.sourceId,
    sourceName: item.sourceName,
    topic: item.topic,
    summary: tidySummary(item.summary),
    ageLabel: ageLabel(item.publishedAt, now),
    hnUrl: item.hnUrl,
    hnPoints: item.hnPoints,
    imageUrl: item.imageUrl,
    read: item.readAt !== null,
    saved: item.savedAt !== null,
  };
}
