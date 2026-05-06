import type { Metadata } from "next";

interface Props {
  params: Promise<{ levelNumber: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { levelNumber } = await params;
  return {
    title: `Level ${levelNumber}`,
    description: `Fight through Level ${levelNumber} in the Aetherian realms. Turn-based strategy and combat.`,
    robots: { index: false, follow: false },
  };
}

export default function PlayLevelLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
