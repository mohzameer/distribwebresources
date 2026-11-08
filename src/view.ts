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

export function toView(item: Item, now = Date.now()): ItemView {
  return {
    id: String(item.id),
    title: item.title,
    url: item.url,
    sourceName: item.sourceName,
    topic: item.topic,
    summary: item.summary,
    ageLabel: ageLabel(item.publishedAt, now),
    hnUrl: item.hnUrl,
    hnPoints: item.hnPoints,
    imageUrl: item.imageUrl,
    read: item.readAt !== null,
    saved: item.savedAt !== null,
  };
}
