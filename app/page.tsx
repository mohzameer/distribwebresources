import { RecommendedView } from '../components/RecommendedView';

/**
 * The homepage: the recommended edition.
 *
 * The data changes exactly twice a day, so this page is effectively static. Serving it
 * from the ISR cache means a page load touches Postgres zero times -- not just a latency
 * nicety: Neon's free compute auto-suspends when idle, so an uncached query means a cold
 * start on the first visit of the day. Ingest POSTs /api/revalidate when it finishes, and
 * the save/read actions call revalidatePath themselves.
 *
 * That cache is also why recommendations are recomputed per render rather than per click:
 * marking an article read revalidates `/`, so the next render already has the new signal.
 */
export const revalidate = 300;

export default async function Home() {
  return <RecommendedView />;
}
