import type { Metadata } from "next";
import type { ReactNode } from "react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const res = await fetch(`${apiUrl}/books/${bookId}`, { cache: "no-store" });
    if (res.ok) {
      const book = await res.json();
      if (book?.title) return { title: book.title };
    }
  } catch {
    // fallback below
  }
  return { title: "Reading" };
}

export default function Layout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
