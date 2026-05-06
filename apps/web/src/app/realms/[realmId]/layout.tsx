import type { Metadata } from "next";

interface Props {
  params: Promise<{ realmId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { realmId } = await params;
  return {
    title: `Realm ${realmId}`,
    description: `Explore Realm ${realmId} — discover levels, lore, and challenges hidden in the Aether.`,
    robots: { index: false, follow: false },
  };
}

export default function RealmLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
