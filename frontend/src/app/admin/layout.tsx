"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getMe } from "@/lib/api";
import { adminFetch, type Stats } from "@/lib/adminFetch";
import { ArrowLeftIcon, RetryIcon } from "@/components/Icons";

type TabKey = "users" | "books" | "audio" | "queue" | "uploads";

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "books", label: "Books", href: "/admin/books" },
  { key: "audio", label: "Audio Cache", href: "/admin/audio" },
  { key: "queue", label: "Queue", href: "/admin/queue" },
  { key: "uploads", label: "Uploads", href: "/admin/uploads" },
];

function activeTab(pathname: string | null): TabKey | null {
  if (!pathname) return null;
  for (const t of TABS) {
    if (pathname === t.href || pathname.startsWith(`${t.href}/`)) return t.key;
  }
  return null;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = activeTab(pathname);

  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (me.role !== "admin") {
          router.push("/");
          return;
        }
        setAuthed(true);
      })
      .catch(() => router.push("/"));
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadStats = useCallback(async () => {
    try {
      const s = await adminFetch("/admin/stats");
      setStats(s);
    } catch {
      /* non-fatal — stats banner just doesn't render */
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadStats();
  }, [authed, loadStats, pathname]);

  if (!authed) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button onClick={() => router.push("/")} className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center gap-1">
          <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Library
        </button>
        <h1 className="font-serif font-bold text-ink text-lg md:text-xl">Admin Panel</h1>
        <button onClick={loadStats} className="ml-auto text-sm text-amber-600 hover:text-amber-900 min-h-[44px] flex items-center gap-1">
          <RetryIcon className="w-4 h-4" aria-hidden="true" /> Refresh
        </button>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <ContextualStats tab={current} stats={stats} />

        <div className="flex gap-1 border-b border-amber-200 mb-4 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          {TABS.map(({ key, label, href }) => (
            <Link
              key={key}
              href={href}
              prefetch
              className={`px-3 md:px-4 py-2.5 md:py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] md:min-h-0 flex items-center ${
                current === key
                  ? "border-amber-700 text-amber-900"
                  : "border-transparent text-amber-600 hover:text-amber-800"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </main>
  );
}

function ContextualStats({ tab, stats }: { tab: TabKey | null; stats: Stats | null }) {
  if (!stats || !tab) return null;

  type Card = { label: string; value: string | number; highlight?: boolean };
  const cards: Card[] = (() => {
    switch (tab) {
      case "users":
        return [
          { label: "Users", value: `${stats.users_approved} / ${stats.users_total}` },
          { label: "Pending", value: stats.users_pending, highlight: stats.users_pending > 0 },
        ];
      case "books":
        return [
          { label: "Books", value: stats.books_cached },
          { label: "Translations", value: stats.translations_cached },
        ];
      case "audio":
        return [
          { label: "Audio", value: `${stats.audio_cache_mb} MB` },
          { label: "Chunks", value: stats.audio_chunks_cached },
        ];
      // queue/bulk manage their own stats inline — don't duplicate generic ones here
      default:
        return [];
    }
  })();

  if (cards.length === 0) return null;

  return (
    <div data-testid="admin-stats-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map(({ label, value, highlight }) => (
        <div
          key={label}
          className={`rounded-xl border p-3 text-center ${
            highlight ? "border-orange-300 bg-orange-50" : "border-amber-200 bg-white"
          }`}
        >
          <div className={`text-lg font-bold ${highlight ? "text-orange-700" : "text-ink"}`}>{value}</div>
          <div className="text-xs text-amber-600">{label}</div>
        </div>
      ))}
    </div>
  );
}
