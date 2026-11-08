import { HomeView } from '../../components/HomeView';

export const revalidate = 300;

export default async function Unread() {
  return <HomeView unreadOnly />;
}
