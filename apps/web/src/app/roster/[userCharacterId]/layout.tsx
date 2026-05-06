import type { Metadata } from "next";

interface Props {
  params: Promise<{ userCharacterId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userCharacterId } = await params;
  return {
    title: `Character ${userCharacterId} — Skill Tree`,
    description: "Manage your character's skill tree, unlock abilities, and build your loadout.",
    robots: { index: false, follow: false },
  };
}

export default function RosterCharacterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
