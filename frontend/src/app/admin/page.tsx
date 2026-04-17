"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe, getAuthToken, awaitSession } from "@/lib/api";
import BulkTranslateTab from "@/components/BulkTranslateTab";
import SeedPopularButton from "@/components/SeedPopularButton";
import QueueTab from "@/components/QueueTab";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

async function adminFetch(path: string, options?: RequestInit) {
  // Wait for NextAuth to finish hydrating before firing — on F5 the session
  // isn't ready yet and this would race with a null token otherwise.
  await awaitSession();
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

type Tab = "users" | "books" | "audio" | "bulk" | "queue";

interface User { id: number; email: string; name: string; picture: string; role: string; approved: number; created_at: string; }
interface TranslationStat { chapters: number; size_chars: number; }
type QueueBreakdown = Record<string, Record<string, number>>; // lang → {status → count}
interface Book {
  id: number; title: string; authors: string[]; languages: string[];
  download_count: number; text_length?: number; word_count?: number; cached_at?: string;
  translations?: Record<string, number>;
  translation_stats?: Record<string, TranslationStat>;
  queue?: QueueBreakdown;
  active?: boolean;
  active_language?: string | null;
}
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
  const [bulkRetranslating, setBulkRetranslating] = useState<string | null>(null);
  // Expansion state: one book expanded at a time; inside a book, one language
  // can be further expanded to show per-chapter rows.
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);
  // One text input per-book, keyed by book id, for "Queue a new language"
  const [newLangInput, setNewLangInput] = useState<Record<number, string>>({});
  const [queueingLangFor, setQueueingLangFor] = useState<string | null>(null);

  useEffect(() => {
    getMe().then((me) => {
      setMyId(me.id);
      if (me.role !== "admin") { router.push("/"); return; }
    }).catch(() => router.push("/"));
    loadAll();
  }, [router]);

  async function loadAll({ silent = false }: { silent?: boolean } = {}) {
    // Show the full-page spinner only on initial load. Background refreshes
    // (triggered by finishing a job, an act, etc.) should update data in
    // place without swapping the entire UI for a spinner — that flash looked
    // like the admin page was reloading itself.
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await loadAll({ silent: true }); } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleImport() {
    const id = parseInt(importId);
    if (!id || id <= 0) return;
    setImporting(true);
    try {
      const res = await adminFetch("/admin/books/import", { method: "POST", body: JSON.stringify({ book_id: id }) });
      alert(res.status === "already_cached" ? `"${res.title}" is already cached.` : `Imported "${res.title}" (${res.text_length?.toLocaleString()} chars)`);
      setImportId("");
      await loadAll({ silent: true });
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
      await loadAll({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Retranslation failed");
    } finally {
      setRetranslating(null);
    }
  }

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: "users", label: "Users", count: stats?.users_total },
    {
      key: "books",
      label: "Books",
      count: stats?.books_cached,
      // Translation info now lives inside each book row
    },
    { key: "audio", label: "Audio Cache", count: stats?.audio_chunks_cached },
    { key: "queue", label: "Queue" },
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
        <button onClick={() => loadAll()} className="ml-auto text-sm text-amber-600 hover:text-amber-900">↻ Refresh</button>
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
            <SeedPopularButton adminFetch={adminFetch} onComplete={() => loadAll({ silent: true })} />

            {/* Book list — each row expands to show translation summary +
                per-chapter actions. The separate Translations tab used to
                hold this info; it's now inline so admins can see everything
                about one book in one place. */}
            <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
              {books.map((b) => {
                const isExpanded = expandedBookId === b.id;
                // Union of languages that have any translations OR any queue activity,
                // so chips show in-progress work even before the first chapter lands.
                const translatedLangs = Object.keys(b.translations || {});
                const queuedLangs = Object.keys(b.queue || {});
                const allLangs = Array.from(new Set([...translatedLangs, ...queuedLangs]));

                return (
                  <div key={b.id}>
                    <div className={`px-4 py-3 flex items-center gap-3 ${b.active ? "bg-emerald-50/60" : ""}`}>
                      <button
                        onClick={() => {
                          setExpandedBookId(isExpanded ? null : b.id);
                          setExpandedLang(null);
                        }}
                        className="text-stone-400 hover:text-amber-700 text-sm w-4 text-center"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink text-sm truncate">{b.title}</span>
                          {b.active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse">
                              translating → {b.active_language}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-stone-400">
                          ID: {b.id} · {b.languages?.join(", ")}
                          {" · "}{((b.text_length || 0) / 1000).toFixed(0)}K chars
                          {b.word_count ? ` · ${b.word_count.toLocaleString()} words` : ""}
                          {b.authors?.length ? ` · ${b.authors.join(", ")}` : ""}
                        </div>
                      </div>

                      {/* Translation chips — compact summary, visible without expanding */}
                      <div className="flex flex-wrap gap-1 items-center">
                        {allLangs.length === 0 ? (
                          <span className="text-[10px] text-stone-300">no translations</span>
                        ) : (
                          allLangs.map((lang) => {
                            const count = b.translations?.[lang] || 0;
                            const q = b.queue?.[lang] || {};
                            const pending = q.pending || 0;
                            const running = q.running || 0;
                            const failed = q.failed || 0;
                            const pieces: string[] = [];
                            if (count) pieces.push(`${count} done`);
                            if (running) pieces.push(`${running} running`);
                            if (pending) pieces.push(`${pending} pending`);
                            if (failed) pieces.push(`${failed} failed`);
                            const tone =
                              running > 0
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : failed > 0
                                  ? "bg-red-50 border-red-200 text-red-700"
                                  : pending > 0
                                    ? "bg-stone-50 border-stone-200 text-stone-600"
                                    : "bg-amber-50 border-amber-200 text-amber-700";
                            return (
                              <span
                                key={lang}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${tone}`}
                                title={pieces.join(" · ")}
                              >
                                {lang} · {count}
                                {(pending || running || failed) > 0 && (
                                  <span className="ml-1 opacity-70">
                                    {running > 0 && `▶${running}`}
                                    {pending > 0 && `⏳${pending}`}
                                    {failed > 0 && `!${failed}`}
                                  </span>
                                )}
                              </span>
                            );
                          })
                        )}
                      </div>

                      <button onClick={() => router.push(`/reader/${b.id}`)} className="text-xs text-amber-600 hover:text-amber-800 shrink-0">Open</button>
                      <button
                        onClick={() => { if (confirm(`Delete "${b.title}" and all its audio/translations?`)) act(() => adminFetch(`/admin/books/${b.id}`, { method: "DELETE" })); }}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 shrink-0"
                      >Delete</button>
                    </div>

                    {/* Expanded translation panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 bg-amber-50/40 border-t border-amber-100">
                        {/* Queue a new language for this book — short-circuits
                            "add to auto_translate_languages + wait for rescan"
                            when the admin wants just one book in one language. */}
                        <div className="mb-3 flex items-center gap-2 text-xs">
                          <span className="text-stone-500">Queue a language for this book:</span>
                          <input
                            placeholder="e.g. ja, fr, zh"
                            value={newLangInput[b.id] ?? ""}
                            onChange={(e) => setNewLangInput({ ...newLangInput, [b.id]: e.target.value })}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") (e.currentTarget.nextSibling as HTMLButtonElement | null)?.click();
                            }}
                            className="flex-1 max-w-[160px] rounded border border-amber-300 px-2 py-0.5 font-mono"
                          />
                          <button
                            onClick={async () => {
                              const raw = (newLangInput[b.id] ?? "").trim().toLowerCase();
                              if (!raw) return;
                              const key = `${b.id}:${raw}`;
                              setQueueingLangFor(key);
                              try {
                                const res = await adminFetch("/admin/queue/enqueue-book", {
                                  method: "POST",
                                  body: JSON.stringify({
                                    book_id: b.id,
                                    target_languages: [raw],
                                    // higher than auto-enqueue default of 100
                                    // so this specific request jumps the line.
                                    priority: 50,
                                  }),
                                });
                                alert(`Queued ${res.enqueued} chapter(s) of "${b.title}" → ${raw}.`);
                                setNewLangInput({ ...newLangInput, [b.id]: "" });
                                await loadAll({ silent: true });
                              } catch (e: unknown) {
                                alert(e instanceof Error ? e.message : "Enqueue failed");
                              } finally {
                                setQueueingLangFor(null);
                              }
                            }}
                            disabled={queueingLangFor === `${b.id}:${(newLangInput[b.id] ?? "").trim().toLowerCase()}`}
                            className="text-xs px-2 py-0.5 rounded bg-amber-700 text-white disabled:opacity-50"
                          >
                            {queueingLangFor?.startsWith(`${b.id}:`) ? "Queueing…" : "Queue"}
                          </button>
                          <span className="text-[10px] text-stone-400">
                            (worker processes according to the configured chain)
                          </span>
                        </div>

                        {translatedLangs.length === 0 ? (
                          <p className="text-xs text-stone-500 italic">
                            No translations cached yet. Use the input above to queue a language, or wait for the auto-translate languages to cover this book.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {translatedLangs.map((lang) => {
                              const count = b.translations![lang];
                              const bulkKey = `${b.id}:${lang}`;
                              const isLangExpanded = expandedLang === bulkKey;
                              const chapterRows = translations.filter(
                                (t) => t.book_id === b.id && t.target_language === lang,
                              );

                              return (
                                <div key={lang} className="bg-white rounded-lg border border-amber-200 overflow-hidden">
                                  <div className="px-3 py-2 flex items-center gap-2">
                                    <button
                                      onClick={() => setExpandedLang(isLangExpanded ? null : bulkKey)}
                                      className="text-xs text-stone-400 hover:text-amber-700 w-4 text-center"
                                    >
                                      {isLangExpanded ? "▼" : "▶"}
                                    </button>
                                    <span className="text-sm font-medium text-ink">{lang}</span>
                                    <span className="text-xs text-stone-500">· {count} chapter{count === 1 ? "" : "s"} cached</span>

                                    <button
                                      disabled={bulkRetranslating === bulkKey}
                                      onClick={async () => {
                                        if (!confirm(`Retranslate ALL ${count} chapters of "${b.title}" → ${lang}? This deletes the current cache and regenerates.`)) return;
                                        setBulkRetranslating(bulkKey);
                                        try {
                                          const res = await adminFetch(`/admin/translations/${b.id}/retranslate-all`, {
                                            method: "POST", body: JSON.stringify({ target_language: lang }),
                                          });
                                          alert(`Retranslated ${res.chapters} chapters of "${b.title}" → ${lang}`);
                                          await loadAll({ silent: true });
                                        } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
                                        finally { setBulkRetranslating(null); }
                                      }}
                                      className="ml-auto text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                                    >
                                      {bulkRetranslating === bulkKey ? "Retranslating…" : "Retranslate all"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (!confirm(`Delete all ${count} cached ${lang} translations for "${b.title}"?`)) return;
                                        act(() => adminFetch(`/admin/translations/${b.id}`, { method: "DELETE" }));
                                      }}
                                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
                                    >
                                      Delete all
                                    </button>
                                  </div>

                                  {/* Per-chapter drill-down */}
                                  {isLangExpanded && (
                                    <div className="border-t border-amber-100 divide-y divide-amber-50 max-h-80 overflow-y-auto">
                                      {chapterRows.length === 0 ? (
                                        <p className="text-xs text-stone-400 px-3 py-2">
                                          (Chapter-level details load from the translations list — reload if empty.)
                                        </p>
                                      ) : (
                                        chapterRows
                                          .sort((a, b) => a.chapter_index - b.chapter_index)
                                          .map((t) => {
                                            const rowKey = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
                                            return (
                                              <div key={rowKey} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                                                <span className="text-stone-500 w-16">Ch. {t.chapter_index + 1}</span>
                                                <span className="text-stone-400 flex-1">{(t.size_chars / 1000).toFixed(1)}K chars</span>
                                                <button
                                                  onClick={() => handleRetranslate(t)}
                                                  disabled={retranslating === rowKey}
                                                  className="px-2 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                                                >
                                                  {retranslating === rowKey ? "…" : "Retranslate"}
                                                </button>
                                                <button
                                                  onClick={() => act(() => adminFetch(`/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}`, { method: "DELETE" }))}
                                                  className="px-2 py-0.5 rounded border border-red-200 text-red-500"
                                                >
                                                  Delete
                                                </button>
                                              </div>
                                            );
                                          })
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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

        {/* Translations tab removed — info is now consolidated into the Books tab */}

        {/* ── Queue Tab ── */}
        {tab === "queue" && <QueueTab adminFetch={adminFetch} />}

        {/* ── Bulk Translate Tab ── */}
        {tab === "bulk" && <BulkTranslateTab adminFetch={adminFetch} />}
      </div>
    </main>
  );
}
