"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getAuthToken } from "@/lib/api";
import BulkTranslateTab from "@/components/BulkTranslateTab";
import SeedPopularButton from "@/components/SeedPopularButton";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function adminFetch(path: string, options?: RequestInit) {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string> || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

type Tab = "users" | "books" | "audio" | "translations" | "bulk";

interface User { id: number; email: string; name: string; picture: string; role: string; approved: number; created_at: string; }
interface Book { id: number; title: string; authors: string[]; languages: string[]; download_count: number; text_length?: number; cached_at?: string; }
interface AudioEntry { book_id: number; chapter_index: number; provider: string; voice: string; chunks: number; size_mb: number; created_at: string; }
interface TranslationEntry { book_id: number; chapter_index: number; target_language: string; size_chars: number; created_at: string; }
interface Stats { users_total: number; users_approved: number; users_pending: number; books_cached: number; audio_chunks_cached: number; audio_cache_mb: number; translations_cached: number; }

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("users");
  const [myId, setMyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [audio, setAudio] = useState<AudioEntry[]>([]);
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [importId, setImportId] = useState("");
  const [importing, setImporting] = useState(false);
  const [retranslating, setRetranslating] = useState<string | null>(null);
  const [bulkRetranslating, setBulkRetranslating] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      setMyId(me.id);
      if (me.role !== "admin") { router.push("/"); return; }
    }).catch(() => router.push("/"));
    loadAll();
  }, [router]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [s, u, b, a, t] = await Promise.all([
        adminFetch("/admin/stats"),
        adminFetch("/admin/users"),
        adminFetch("/admin/books"),
        adminFetch("/admin/audio"),
        adminFetch("/admin/translations"),
      ]);
      setStats(s); setUsers(u); setBooks(b); setAudio(a); setTranslations(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await loadAll(); } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleImport() {
    const id = parseInt(importId);
    if (!id || id <= 0) return;
    setImporting(true);
    try {
      const res = await adminFetch("/admin/books/import", { method: "POST", body: JSON.stringify({ book_id: id }) });
      alert(res.status === "already_cached" ? `"${res.title}" is already cached.` : `Imported "${res.title}" (${res.text_length?.toLocaleString()} chars)`);
      setImportId("");
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleRetranslate(t: TranslationEntry) {
    const key = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
    if (!confirm(`Retranslate Book ${t.book_id}, Ch. ${t.chapter_index + 1} → ${t.target_language}?\nThis will delete the cached version and generate a fresh translation.`)) return;
    setRetranslating(key);
    try {
      const res = await adminFetch(`/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}/retranslate`, { method: "POST" });
      alert(`Retranslated via ${res.provider}: ${res.paragraphs_count} paragraphs`);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Retranslation failed");
    } finally {
      setRetranslating(null);
    }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "users", label: "Users", count: stats?.users_total },
    { key: "books", label: "Books", count: stats?.books_cached },
    { key: "audio", label: "Audio Cache", count: stats?.audio_chunks_cached },
    { key: "translations", label: "Translations", count: stats?.translations_cached },
    { key: "bulk", label: "Bulk Translate" },
  ];

  if (loading) return (
    <div className="min-h-screen bg-parchment flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
    </div>
  );

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.push("/")} className="text-amber-700 hover:text-amber-900 text-sm">← Library</button>
        <h1 className="font-serif font-bold text-ink text-xl">Admin Panel</h1>
        <button onClick={loadAll} className="ml-auto text-sm text-amber-600 hover:text-amber-900">↻ Refresh</button>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Users", value: `${stats.users_approved} / ${stats.users_total}` },
              { label: "Pending", value: stats.users_pending, highlight: stats.users_pending > 0 },
              { label: "Books", value: stats.books_cached },
              { label: "Audio", value: `${stats.audio_cache_mb} MB` },
            ].map(({ label, value, highlight }) => (
              <div key={label} className={`rounded-xl border p-3 text-center ${highlight ? "border-orange-300 bg-orange-50" : "border-amber-200 bg-white"}`}>
                <div className={`text-lg font-bold ${highlight ? "text-orange-700" : "text-ink"}`}>{value}</div>
                <div className="text-xs text-amber-600">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-amber-200 mb-4">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key ? "border-amber-700 text-amber-900" : "border-transparent text-amber-600 hover:text-amber-800"
              }`}
            >
              {label} {count !== undefined && <span className="text-xs opacity-60">({count})</span>}
            </button>
          ))}
        </div>

        {/* ── Users Tab ── */}
        {tab === "users" && (
          <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
            {users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                {u.picture ? <img src={u.picture} alt="" className="w-8 h-8 rounded-full" /> :
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-sm font-bold">{u.name?.[0]}</div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink text-sm truncate">{u.name}</span>
                    {u.role === "admin" && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">admin</span>}
                    {!u.approved && <span className="text-[10px] bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">pending</span>}
                  </div>
                  <p className="text-xs text-stone-400 truncate">{u.email}</p>
                </div>
                {u.id !== myId && (
                  <div className="flex gap-1">
                    <button onClick={() => act(() => adminFetch(`/admin/users/${u.id}/approve`, { method: "PUT", body: JSON.stringify({ approved: !u.approved }) }))}
                      className={`text-xs px-2 py-1 rounded border ${u.approved ? "border-orange-200 text-orange-600" : "border-emerald-200 text-emerald-600"}`}>
                      {u.approved ? "Revoke" : "Approve"}
                    </button>
                    <button onClick={() => { if (confirm(`Delete "${u.name}"?`)) act(() => adminFetch(`/admin/users/${u.id}`, { method: "DELETE" })); }}
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Del</button>
                  </div>
                )}
                {u.id === myId && <span className="text-xs text-stone-300">You</span>}
              </div>
            ))}
          </div>
        )}

        {/* ── Books Tab ── */}
        {tab === "books" && (
          <div className="space-y-4">
            {/* Import */}
            <div className="flex gap-2">
              <input
                placeholder="Gutenberg Book ID (e.g. 2229)"
                value={importId}
                onChange={(e) => setImportId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
                className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm"
              />
              <button onClick={handleImport} disabled={importing || !importId.trim()}
                className="rounded-lg bg-amber-700 text-white px-4 py-2 text-sm hover:bg-amber-800 disabled:opacity-50">
                {importing ? "Importing…" : "Import Book"}
              </button>
            </div>

            {/* Bulk seed from popular_books.json — works on Railway without CLI */}
            <SeedPopularButton onComplete={loadAll} />

            {/* Book list */}
            <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
              {books.map((b) => (
                <div key={b.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink text-sm truncate">{b.title}</div>
                    <div className="text-xs text-stone-400">
                      ID: {b.id} · {b.languages?.join(", ")} · {((b.text_length || 0) / 1000).toFixed(0)}K chars
                      {b.authors?.length ? ` · ${b.authors.join(", ")}` : ""}
                    </div>
                  </div>
                  <button onClick={() => router.push(`/reader/${b.id}`)} className="text-xs text-amber-600 hover:text-amber-800">Open</button>
                  <button onClick={() => { if (confirm(`Delete "${b.title}" and all its audio/translations?`)) act(() => adminFetch(`/admin/books/${b.id}`, { method: "DELETE" })); }}
                    className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Delete</button>
                </div>
              ))}
              {books.length === 0 && <div className="px-4 py-8 text-center text-amber-600 text-sm">No books cached.</div>}
            </div>
          </div>
        )}

        {/* ── Audio Tab ── */}
        {tab === "audio" && (
          <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
            {audio.map((a, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">Book {a.book_id}, Ch. {a.chapter_index + 1}</div>
                  <div className="text-xs text-stone-400">
                    {a.provider}/{a.voice} · {a.chunks} chunks · {a.size_mb} MB
                  </div>
                </div>
                <button onClick={() => act(() => adminFetch(`/admin/audio/${a.book_id}/${a.chapter_index}`, { method: "DELETE" }))}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Delete</button>
              </div>
            ))}
            {audio.length === 0 && <div className="px-4 py-8 text-center text-amber-600 text-sm">No audio cached.</div>}
          </div>
        )}

        {/* ── Translations Tab ── */}
        {tab === "translations" && (
          <div className="space-y-4">
            {/* Bulk retranslate — pick a book that has translations */}
            {translations.length > 0 && (
              <div className="flex items-center gap-2">
                <select id="bulk-book" className="text-sm rounded border border-amber-300 px-2 py-1.5">
                  {[...new Set(translations.map(t => t.book_id))].map(bid => (
                    <option key={bid} value={bid}>Book {bid}</option>
                  ))}
                </select>
                <select id="bulk-lang" className="text-sm rounded border border-amber-300 px-2 py-1.5">
                  {[...new Set(translations.map(t => t.target_language))].map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <button
                  disabled={bulkRetranslating}
                  onClick={async () => {
                    const bid = (document.getElementById("bulk-book") as HTMLSelectElement)?.value;
                    const lang = (document.getElementById("bulk-lang") as HTMLSelectElement)?.value;
                    if (!bid || !lang || !confirm(`Retranslate ALL chapters of book ${bid} → ${lang}?`)) return;
                    setBulkRetranslating(true);
                    try {
                      const res = await adminFetch(`/admin/translations/${bid}/retranslate-all`, {
                        method: "POST", body: JSON.stringify({ target_language: lang }),
                      });
                      alert(`Retranslated ${res.chapters} chapters`);
                      await loadAll();
                    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
                    finally { setBulkRetranslating(false); }
                  }}
                  className="text-sm px-3 py-1.5 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  {bulkRetranslating ? "Retranslating all…" : "Retranslate All"}
                </button>
              </div>
            )}

          <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
            {translations.map((t, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink">Book {t.book_id}, Ch. {t.chapter_index + 1} → {t.target_language}</div>
                  <div className="text-xs text-stone-400">{(t.size_chars / 1000).toFixed(1)}K chars</div>
                </div>
                <button
                  onClick={() => handleRetranslate(t)}
                  disabled={retranslating === `${t.book_id}:${t.chapter_index}:${t.target_language}`}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                  {retranslating === `${t.book_id}:${t.chapter_index}:${t.target_language}` ? "Translating…" : "Retranslate"}
                </button>
                <button onClick={() => act(() => adminFetch(`/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}`, { method: "DELETE" }))}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-500">Delete</button>
              </div>
            ))}
            {translations.length === 0 && <div className="px-4 py-8 text-center text-amber-600 text-sm">No translations cached.</div>}
          </div>
          </div>
        )}

        {/* ── Bulk Translate Tab ── */}
        {tab === "bulk" && <BulkTranslateTab adminFetch={adminFetch} />}
      </div>
    </main>
  );
}
