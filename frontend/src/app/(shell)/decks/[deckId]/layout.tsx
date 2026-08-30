import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deckId: string }>;
}): Promise<Metadata> {
  const { deckId } = await params;
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${apiUrl}/decks/${deckId}`, { cache: "no-store" });
    if (res.ok) {
      const deck = await res.json();
      if (deck?.name) return { title: deck.name };
    }
  } catch {
    // fallback below
  }
  return { title: "Deck" };
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
