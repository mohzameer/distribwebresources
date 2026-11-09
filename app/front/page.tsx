import { HomeView } from '../../components/HomeView';

/**
 * The broadsheet front page: topic-ordered, impersonal, the same edition every reader
 * would get. It was the homepage until the recommended edition took that slot, and it is
 * kept as its own route because the two answer different questions -- "what happened" and
 * "what should I read".
 */
export const revalidate = 300;

export default async function Front() {
  return <HomeView unreadOnly={false} />;
}
