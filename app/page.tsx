import { HomeView } from '../components/HomeView';

/**
 * The data changes exactly twice a day, so this page is effectively static. Serving it
 * from the ISR cache means a page load touches Postgres zero times -- not just a latency
 * nicety: Neon's free compute auto-suspends when idle, so an uncached query means a cold
 * start on the first visit of the day. Ingest POSTs /api/revalidate when it finishes, and
 * the save/read actions call revalidatePath themselves.
 */
export const revalidate = 300;

export default async function Home() {
  return <HomeView unreadOnly={false} />;
}
