"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import SeedPopularButton from "@/components/SeedPopularButton";
import { fuzzyMatchAny } from "@/lib/fuzzyMatch";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/Icons";

interface TranslationStat {
  chapters: number;
  size_chars: number;
}
type QueueBreakdown = Record<string, Record<string, number>>;
interface Book {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  download_count: number;
  text_length?: number;
  word_count?: number;
  cached_at?: string;
  translations?: Record<string, number>;
  translation_stats?: Record<string, TranslationStat>;
  queue?: QueueBreakdown;
  active?: boolean;
  active_language?: string | null;
}
interface TranslationEntry {
  book_id: number;
  chapter_index: number;
  target_language: string;
  size_chars: number;
  created_at: string;
}

const QUEUE_LANG_OPTIONS = [
  { code: "zh", label: "Chinese (zh)" },
  { code: "en", label: "English (en)" },
  { code: "de", label: "German (de)" },
  { code: "fr", label: "French (fr)" },
] as const;

export default function BooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importId, setImportId] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);
  const [newLangInput, setNewLangInput] = useState<Record<number, string>>({});
  const [queueingLangFor, setQueueingLangFor] = useState<string | null>(null);
  const [retranslating, setRetranslating] = useState<string | null>(null);
  const [bulkRetranslating, setBulkRetranslating] = useState<string | null>(null);
  const [retryingFailed, setRetryingFailed] = useState<string | null>(null);
  // Per-row input for "Move to chapter N" action — keyed by
  // `${book_id}:${chapter_index}:${lang}` so two open books don't share state.
  const [moveInput, setMoveInput] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      // Books endpoint is the main payload. Translations drives the per-chapter
      // drill-down; lazy-load it only when a book row is expanded? For now keep
      // it parallel since translations is small relative to books.
      const [b, t] = await Promise.all([adminFetch("/admin/books"), adminFetch("/admin/translations")]);
      setBooks(b);
      setTranslations(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load books");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleImport() {
    const id = parseInt(importId);
    if (!id || id <= 0) return;
    setImporting(true);
    try {
      const res = await adminFetch("/admin/books/import", {
        method: "POST",
        body: JSON.stringify({ book_id: id }),
      });
      alert(
        res.status === "already_cached"
          ? `"${res.title}" is already cached.`
          : `Imported "${res.title}" (${res.text_length?.toLocaleString()} chars)`,
      );
      setImportId("");
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function handleRetranslate(t: TranslationEntry) {
    const key = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
    if (
      !confirm(
        `Retranslate Book ${t.book_id}, Ch. ${t.chapter_index + 1} → ${t.target_language}?\nThis will delete the cached version and generate a fresh translation.`,
      )
    )
      return;
    setRetranslating(key);
    try {
      const res = await adminFetch(
        `/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}/retranslate`,
        { method: "POST" },
      );
      alert(`Retranslated via ${res.provider}: ${res.paragraphs_count} paragraphs`);
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Retranslation failed");
    } finally {
      setRetranslating(null);
    }
  }

  async function queueLanguageForBook(book: Book, lang: string) {
    if (!lang) return;
    const key = `${book.id}:${lang}`;
    setQueueingLangFor(key);
    try {
      const res = await adminFetch("/admin/queue/enqueue-book", {
        method: "POST",
        body: JSON.stringify({ book_id: book.id, target_languages: [lang], priority: 50 }),
      });
      alert(`Queued ${res.enqueued} chapter(s) of "${book.title}" → ${lang}.`);
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Enqueue failed");
    } finally {
      setQueueingLangFor(null);
    }
  }

  async function handleMove(t: TranslationEntry, rawInput: string) {
    // User types a 1-based chapter number to match the visible "Ch. N"
    // label; convert to 0-based for the backend.
    const parsed = parseInt(rawInput.trim(), 10);
    if (isNaN(parsed) || parsed < 1) {
      alert("Enter a chapter number (1-based, e.g. 6).");
      return;
    }
    const newIdx = parsed - 1;
    if (newIdx === t.chapter_index) {
      alert("Target chapter is the same as the source.");
      return;
    }
    const rowKey = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
    if (
      !confirm(
        `Reassign translation from Ch. ${t.chapter_index + 1} to Ch. ${parsed} for ${t.target_language}?\nNo tokens are used — this only moves the existing cached paragraphs.`,
      )
    )
      return;
    setMoving(rowKey);
    try {
      await adminFetch(
        `/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}/move`,
        {
          method: "POST",
          body: JSON.stringify({ new_chapter_index: newIdx }),
        },
      );
      setMoveInput({ ...moveInput, [rowKey]: "" });
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Move failed");
    } finally {
      setMoving(null);
    }
  }

  async function retryFailedForLang(book: Book, lang: string, failedCount: number) {
    const key = `${book.id}:${lang}`;
    if (!confirm(`Retry ${failedCount} failed chapter(s) of "${book.title}" → ${lang}?`)) return;
    setRetryingFailed(key);
    try {
      const res = await adminFetch("/admin/queue/retry-failed", {
        method: "POST",
        body: JSON.stringify({ book_id: book.id, target_language: lang }),
      });
      alert(`Re-queued ${res.updated} failed chapter(s) of "${book.title}" → ${lang}.`);
      await load({ silent: true });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryingFailed(null);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      <div className="flex gap-2">
        <input
          placeholder="Gutenberg Book ID (e.g. 2229)"
          value={importId}
          onChange={(e) => setImportId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
          className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleImport}
          disabled={importing || !importId.trim()}
          className="rounded-lg bg-amber-700 text-white px-4 py-2 text-sm hover:bg-amber-800 disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import Book"}
        </button>
      </div>

      <SeedPopularButton adminFetch={adminFetch} onComplete={() => load({ silent: true })} />

      {/* Fuzzy filter — matches against title + authors + book ID. Stays
          client-side since the admin endpoint already returns the full
          books list. Preserves existing expansion state while typing. */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search books by title, author, or ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm"
          aria-label="Filter books"
        />
        {searchQuery && (
          <span className="text-xs text-stone-500">
            {books.filter((b) =>
              fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]),
            ).length}{" "}
            / {books.length}
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
        {books
          .filter((b) => fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]))
          .map((b) => {
          const isExpanded = expandedBookId === b.id;
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
                  className="text-stone-400 hover:text-amber-700 flex items-center"
                  title={isExpanded ? "Collapse" : "Expand"}
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink text-sm truncate">{b.title}</span>
                    {b.active && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse">
                        translating → {b.active_language}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone-400">
                    ID: {b.id} · {b.languages?.join(", ")}
                    {" · "}
                    {((b.text_length || 0) / 1000).toFixed(0)}K chars
                    {b.word_count ? ` · ${b.word_count.toLocaleString()} words` : ""}
                    {b.authors?.length ? ` · ${b.authors.join(", ")}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  {allLangs.length === 0 ? (
                    <span className="text-xs text-stone-300">no translations</span>
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
                      const retryKey = `${b.id}:${lang}`;
                      return (
                        <span key={lang} className="inline-flex items-center gap-0.5">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full border ${tone}`}
                            title={pieces.join(" · ")}
                          >
                            {lang} · {count}
                            {pending + running + failed > 0 && (
                              <span className="ml-1 opacity-70">
                                {running > 0 && `▸${running}`}
                                {pending > 0 && `·${pending}`}
                                {failed > 0 && `×${failed}`}
                              </span>
                            )}
                          </span>
                          {failed > 0 && (
                            <button
                              onClick={() => retryFailedForLang(b, lang, failed)}
                              disabled={retryingFailed === retryKey}
                              title={`Retry ${failed} failed ${lang} chapter${failed === 1 ? "" : "s"}`}
                              className="text-xs px-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {retryingFailed === retryKey ? "…" : "↻"}
                            </button>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>

                <button
                  onClick={() => router.push(`/reader/${b.id}`)}
                  className="text-xs text-amber-600 hover:text-amber-800 shrink-0"
                >
                  Open
                </button>

                <select
                  value={newLangInput[b.id] ?? "zh"}
                  onChange={(e) => setNewLangInput({ ...newLangInput, [b.id]: e.target.value })}
                  className="text-xs rounded border border-amber-300 px-1.5 py-0.5 shrink-0 bg-white"
                  title="Pick a language to queue for translation"
                >
                  {QUEUE_LANG_OPTIONS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => queueLanguageForBook(b, newLangInput[b.id] ?? "zh")}
                  disabled={queueingLangFor?.startsWith(`${b.id}:`)}
                  className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0 disabled:opacity-50"
                  title="Queue this book for translation into the selected language"
                >
                  {queueingLangFor?.startsWith(`${b.id}:`) ? "Queueing…" : "+ Translate"}
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Delete "${b.title}" and all its audio/translations?`))
                      act(() => adminFetch(`/admin/books/${b.id}`, { method: "DELETE" }));
                  }}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 shrink-0"
                >
                  Delete
                </button>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 pt-1 bg-amber-50/40 border-t border-amber-100">
                  {translatedLangs.length === 0 ? (
                    <p className="text-xs text-stone-500 italic">
                      No translations cached yet. Use the + Translate button above to queue a language.
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
                                className="text-xs text-stone-400 hover:text-amber-700 flex items-center"
                                aria-label={isLangExpanded ? "Collapse" : "Expand"}
                              >
                                {isLangExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                              </button>
                              <span className="text-sm font-medium text-ink">{lang}</span>
                              <span className="text-xs text-stone-500">
                                · {count} chapter{count === 1 ? "" : "s"} cached
                              </span>

                              <button
                                disabled={bulkRetranslating === bulkKey}
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `Retranslate ALL ${count} chapters of "${b.title}" → ${lang}? This deletes the current cache and regenerates.`,
                                    )
                                  )
                                    return;
                                  setBulkRetranslating(bulkKey);
                                  try {
                                    const res = await adminFetch(`/admin/translations/${b.id}/retranslate-all`, {
                                      method: "POST",
                                      body: JSON.stringify({ target_language: lang }),
                                    });
                                    alert(
                                      `Retranslated ${res.chapters} chapters of "${b.title}" → ${lang}`,
                                    );
                                    await load({ silent: true });
                                  } catch (e: unknown) {
                                    alert(e instanceof Error ? e.message : "Failed");
                                  } finally {
                                    setBulkRetranslating(null);
                                  }
                                }}
                                className="ml-auto text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                              >
                                {bulkRetranslating === bulkKey ? "Retranslating…" : "Retranslate all"}
                              </button>
                              <button
                                onClick={() => {
                                  if (!confirm(`Delete all ${count} cached ${lang} translations for "${b.title}"?`))
                                    return;
                                  act(() =>
                                    adminFetch(`/admin/translations/${b.id}/${lang}`, {
                                      method: "DELETE",
                                    }),
                                  );
                                }}
                                className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
                              >
                                Delete all
                              </button>
                            </div>

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
                                        <div
                                          key={rowKey}
                                          className="px-3 py-1.5 flex items-center gap-2 text-xs"
                                        >
                                          <span className="text-stone-500 w-16">Ch. {t.chapter_index + 1}</span>
                                          <span className="text-stone-400 flex-1">
                                            {(t.size_chars / 1000).toFixed(1)}K chars
                                          </span>
                                          {/* Move-to: reassign the cached translation
                                              to a different chapter index without
                                              burning tokens. Used to fix splitter-
                                              realignment cases where paragraphs are
                                              correct but the chapter_index is wrong. */}
                                          <input
                                            type="number"
                                            min={1}
                                            placeholder="→Ch"
                                            value={moveInput[rowKey] ?? ""}
                                            onChange={(e) =>
                                              setMoveInput({ ...moveInput, [rowKey]: e.target.value })
                                            }
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") handleMove(t, moveInput[rowKey] ?? "");
                                            }}
                                            className="w-14 rounded border border-amber-300 px-1 py-0.5 text-xs"
                                            title="Reassign this translation to another chapter number (1-based)"
                                          />
                                          <button
                                            onClick={() => handleMove(t, moveInput[rowKey] ?? "")}
                                            disabled={moving === rowKey || !(moveInput[rowKey] ?? "").trim()}
                                            className="px-2 py-0.5 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                                          >
                                            {moving === rowKey ? "…" : "Move"}
                                          </button>
                                          <button
                                            onClick={() => handleRetranslate(t)}
                                            disabled={retranslating === rowKey}
                                            className="px-2 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                                          >
                                            {retranslating === rowKey ? "…" : "Retranslate"}
                                          </button>
                                          <button
                                            onClick={() =>
                                              act(() =>
                                                adminFetch(
                                                  `/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}`,
                                                  { method: "DELETE" },
                                                ),
                                              )
                                            }
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
        {books.length === 0 ? (
          <div className="px-4 py-8 text-center text-amber-600 text-sm">No books cached.</div>
        ) : (
          books.filter((b) =>
            fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]),
          ).length === 0 && (
            <div className="px-4 py-8 text-center text-amber-600 text-sm">
              No books match &ldquo;{searchQuery}&rdquo;.
            </div>
          )
        )}
      </div>
    </div>
  );
}
