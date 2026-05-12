import { redirect } from 'next/navigation';

type TabRouteProps = {
  params: Promise<{ tab: string }>;
};

export default async function TabAliasPage({ params }: TabRouteProps) {
  const { tab } = await params;
  const safeTab = encodeURIComponent((tab || 'generate').toLowerCase());
  redirect(`/?tab=${safeTab}`);
}
