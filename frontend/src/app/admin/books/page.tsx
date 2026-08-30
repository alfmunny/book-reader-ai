"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import SeedPopularButton from "@/components/SeedPopularButton";
import PendingPublishPanel from "@/components/PendingPublishPanel";
import { fuzzyMatchAny } from "@/lib/fuzzyMatch";
import { AlertCircleIcon, ChevronDownIcon, ChevronRightIcon, RetryIcon, CloseIcon } from "@/components/Icons";

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
  /** Audit state (migration 046): frozen = split fixed; published = in the library. */
  frozen?: boolean;
  published?: boolean;
  audited_by?: string | null;
  frozen_at?: string | null;
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

const AUDIT_FILTER_LABELS: Record<string, string> = {
  unaudited: "not audited",
  frozen: "frozen",
  awaiting: "awaiting review",
  published: "in library",
};

export default function BooksPage() {
  useEffect(() => {
    document.title = "Admin: Books — Book Reader AI";
  }, []);

  const [books, setBooks] = useState<Book[]>([]);
  const [translations, setTranslations] = useState<TranslationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actError, setActError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string;
    fn: () => void | Promise<void>;
  } | null>(null);
  const confirmContainerRef = useRef<HTMLDivElement>(null);
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const [importId, setImportId] = useState("");
  const [importing, setImporting] = useState(false);
  const [expandedBookId, setExpandedBookId] = useState<number | null>(null);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);
  const [newLangInput, setNewLangInput] = useState<Record<number, string>>({});
  const [queueingLangFor, setQueueingLangFor] = useState<string | null>(null);
  const [retranslating, setRetranslating] = useState<string | null>(null);
  const [bulkRetranslating, setBulkRetranslating] = useState<string | null>(null);
  const [retryingFailed, setRetryingFailed] = useState<string | null>(null);
  const [moveInput, setMoveInput] = useState<Record<string, string>>({});
  const [moving, setMoving] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  /** Audit state filter (#2745 follow-up): freeze and publish are two
   *  separate facts, so the states are not-audited / awaiting / published,
   *  plus "frozen" for either of the last two. */
  const [auditFilter, setAuditFilter] = useState("all");

  function matchesAudit(b: { frozen?: boolean; published?: boolean }): boolean {
    if (auditFilter === "unaudited") return !b.frozen;
    if (auditFilter === "frozen") return !!b.frozen;
    if (auditFilter === "awaiting") return !!b.frozen && !b.published;
    if (auditFilter === "published") return !!b.published;
    return true;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
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

  useEffect(() => {
    if (pendingConfirm) {
      confirmTriggerRef.current = document.activeElement as HTMLElement;
      confirmContainerRef.current?.focus();
    } else if (confirmTriggerRef.current) {
      confirmTriggerRef.current.focus();
      confirmTriggerRef.current = null;
    }
  }, [pendingConfirm]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load({ silent: true });
      setActError(null);
    } catch (e: unknown) {
      setActError(e instanceof Error ? e.message : "Failed");
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
      showToast(
        res.status === "already_cached"
          ? `"${res.title}" is already cached.`
          : `Imported "${res.title}" (${res.text_length?.toLocaleString()} chars)`,
      );
      setImportId("");
      await load({ silent: true });
    } catch (e: unknown) {
      setActError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleRetranslate(t: TranslationEntry) {
    const key = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
    setPendingConfirm({
      message: `Retranslate Book ${t.book_id}, Ch. ${t.chapter_index + 1} → ${t.target_language}? This will delete the cached version and generate a fresh translation.`,
      fn: async () => {
        setRetranslating(key);
        try {
          const res = await adminFetch(
            `/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}/retranslate`,
            { method: "POST" },
          );
          showToast(`Retranslated via ${res.provider}: ${res.paragraphs_count} paragraphs`);
          await load({ silent: true });
        } catch (e: unknown) {
          setActError(e instanceof Error ? e.message : "Retranslation failed");
        } finally {
          setRetranslating(null);
        }
      },
    });
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
      showToast(`Queued ${res.enqueued} chapter(s) of "${book.title}" → ${lang}.`);
      await load({ silent: true });
    } catch (e: unknown) {
      setActError(e instanceof Error ? e.message : "Enqueue failed");
    } finally {
      setQueueingLangFor(null);
    }
  }

  function handleMove(t: TranslationEntry, rawInput: string) {
    const parsed = parseInt(rawInput.trim(), 10);
    if (isNaN(parsed) || parsed < 1) {
      setActError("Enter a chapter number (1-based, e.g. 6).");
      return;
    }
    const newIdx = parsed - 1;
    if (newIdx === t.chapter_index) {
      setActError("Target chapter is the same as the source.");
      return;
    }
    const rowKey = `${t.book_id}:${t.chapter_index}:${t.target_language}`;
    setPendingConfirm({
      message: `Reassign translation from Ch. ${t.chapter_index + 1} to Ch. ${parsed} for ${t.target_language}? No tokens are used — this only moves the existing cached paragraphs.`,
      fn: async () => {
        setMoving(rowKey);
        try {
          await adminFetch(
            `/admin/translations/${t.book_id}/${t.chapter_index}/${t.target_language}/move`,
            {
              method: "POST",
              body: JSON.stringify({ new_chapter_index: newIdx }),
            },
          );
          setMoveInput((prev) => ({ ...prev, [rowKey]: "" }));
          await load({ silent: true });
        } catch (e: unknown) {
          setActError(e instanceof Error ? e.message : "Move failed");
        } finally {
          setMoving(null);
        }
      },
    });
  }

  function retryFailedForLang(book: Book, lang: string, failedCount: number) {
    const key = `${book.id}:${lang}`;
    setPendingConfirm({
      message: `Retry ${failedCount} failed chapter(s) of "${book.title}" → ${lang}?`,
      fn: async () => {
        setRetryingFailed(key);
        try {
          const res = await adminFetch("/admin/queue/retry-failed", {
            method: "POST",
            body: JSON.stringify({ book_id: book.id, target_language: lang }),
          });
          showToast(`Re-queued ${res.updated} failed chapter(s) of "${book.title}" → ${lang}.`);
          await load({ silent: true });
        } catch (e: unknown) {
          setActError(e instanceof Error ? e.message : "Retry failed");
        } finally {
          setRetryingFailed(null);
        }
      },
    });
  }

  if (loading)
    return (
      <div role="status" aria-label="Loading books" className="flex items-center justify-center py-16">
        <span className="sr-only">Loading books...</span>
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );

  return (
    <div className="space-y-4">
      <h2 className="sr-only">Books</h2>

      <PendingPublishPanel />
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 text-xs font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          >
            <RetryIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {pendingConfirm && (
        <div ref={confirmContainerRef} role="alertdialog" aria-modal="true" aria-label="Confirm action" tabIndex={-1} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm flex items-start gap-3 outline-none">
          <p className="flex-1 text-amber-900">{pendingConfirm.message}</p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                const fn = pendingConfirm.fn;
                setPendingConfirm(null);
                await fn();
              }}
              aria-label="Confirm action"
              className="px-3 py-1.5 min-h-[44px] md:min-h-0 rounded border border-amber-500 bg-amber-100 text-amber-800 hover:bg-amber-200 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setPendingConfirm(null)}
              aria-label="Cancel action"
              className="px-3 py-1.5 min-h-[44px] md:min-h-0 rounded border border-stone-200 text-stone-600 hover:bg-stone-50 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {actError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{actError}</span>
          <button
            type="button"
            onClick={() => setActError(null)}
            aria-label="Dismiss error"
            className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-red-500 hover:text-red-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          >
            <CloseIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* aria-live-toast-mirror: always-present so AT announces toast (WCAG 4.1.3) */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">{toast ?? ""}</span>
      {toast && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center justify-between gap-3">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
            className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-emerald-500 hover:text-emerald-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <CloseIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          aria-label="Gutenberg Book ID to import"
          placeholder="Gutenberg Book ID (e.g. 2229)"
          value={importId}
          onChange={(e) => setImportId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
          className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={handleImport}
          disabled={importing || !importId.trim()}
          className="rounded-lg bg-amber-700 text-white px-4 py-2 min-h-[44px] md:min-h-0 text-sm hover:bg-amber-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
        >
          {importing ? "Importing…" : "Import Book"}
        </button>
      </div>

      <SeedPopularButton adminFetch={adminFetch} onComplete={() => load({ silent: true })} />

      <div className="flex items-center gap-2">
        <select
          value={auditFilter}
          onChange={(e) => setAuditFilter(e.target.value)}
          aria-label="Audit state"
          title="Show only books in a given audit state"
          className="rounded-lg border border-amber-300 px-2 py-2 min-h-[44px] md:min-h-0 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All books</option>
          <option value="unaudited">Not audited</option>
          <option value="frozen">Frozen (any)</option>
          <option value="awaiting">Awaiting review</option>
          <option value="published">In library</option>
        </select>
        <input
          type="search"
          placeholder="Search books by title, author, or ID…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
          aria-label="Filter books"
        />
        <span aria-live="polite" aria-atomic="true" className="text-xs text-stone-600">
          {searchQuery || auditFilter !== "all" ? `${books.filter((b) =>
            matchesAudit(b) && fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]),
          ).length} / ${books.length}` : ""}
        </span>
      </div>

      <ul role="list" aria-label="Books" className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden list-none p-0 m-0">
        {books
          .filter((b) => matchesAudit(b) && fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]))
          .map((b) => {
          const isExpanded = expandedBookId === b.id;
          const translatedLangs = Object.keys(b.translations || {});
          const queuedLangs = Object.keys(b.queue || {});
          const allLangs = Array.from(new Set([...translatedLangs, ...queuedLangs]));

          return (
            <li key={b.id}>
              <div className={`px-4 py-3 flex items-center gap-3 ${b.active ? "bg-emerald-50/60" : ""}`}>
                <button
                  onClick={() => {
                    setExpandedBookId(isExpanded ? null : b.id);
                    setExpandedLang(null);
                  }}
                  className="text-stone-600 hover:text-amber-700 flex items-center min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  title={isExpanded ? `Collapse ${b.title}` : `Expand ${b.title}`}
                  aria-label={isExpanded ? `Collapse ${b.title}` : `Expand ${b.title}`}
                  aria-expanded={isExpanded}
                  aria-controls={`book-detail-${b.id}`}
                >
                  {isExpanded ? <ChevronDownIcon className="w-3.5 h-3.5" /> : <ChevronRightIcon className="w-3.5 h-3.5" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink text-sm truncate" title={b.title}>{b.title}</span>
                    {b.active && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse"
                        role="status"
                        aria-label={b.active_language ? `Translating to ${b.active_language}` : "Translating"}
                      >
                        translating{b.active_language ? ` → ${b.active_language}` : ""}
                      </span>
                    )}
                    {!b.frozen && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600"
                        title="No frozen split yet — audit and freeze it before it can be published"
                      >
                        not audited
                      </span>
                    )}
                    {b.frozen && !b.published && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800"
                        title={`Frozen${b.frozen_at ? ` ${b.frozen_at}` : ""}${b.audited_by ? ` by ${b.audited_by}` : ""} — waiting to be added to the library`}
                      >
                        awaiting review
                      </span>
                    )}
                    {b.frozen && b.published && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200"
                        title={`Frozen${b.frozen_at ? ` ${b.frozen_at}` : ""}${b.audited_by ? ` by ${b.audited_by}` : ""} — the split is fixed and the book is in the library`}
                      >
                        frozen · in library
                      </span>
                    )}
                    {/* The endpoint existed from the publish gate but nothing
                        called it — a book could go into the library and never
                        come back out without SQL. */}
                    {b.published && (
                      <button
                        onClick={() => act(() => adminFetch(`/admin/books/${b.id}/unpublish`, { method: "POST" }))}
                        title={`Take "${b.title}" out of the library — the split and every note stay untouched`}
                        className="text-xs px-2 py-0.5 min-h-[44px] md:min-h-0 rounded-full border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                      >
                        Remove from library
                      </button>
                    )}
                    {b.frozen && !b.published && (
                      <button
                        onClick={() => act(() => adminFetch(`/admin/books/${b.id}/publish`, { method: "POST" }))}
                        title={`Add "${b.title}" to the library`}
                        className="text-xs px-2 py-0.5 min-h-[44px] md:min-h-0 rounded-full bg-amber-700 text-white hover:bg-amber-800 transition-colors inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                      >
                        Add to library
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-stone-600">
                    ID: {b.id} · {b.languages?.join(", ")}
                    {" · "}
                    {((b.text_length || 0) / 1000).toFixed(0)}K chars
                    {b.word_count ? ` · ${b.word_count.toLocaleString()} words` : ""}
                    {b.authors?.length ? ` · ${b.authors.join(", ")}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  {allLangs.length === 0 ? (
                    <span className="text-xs text-stone-600">no translations</span>
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
                              <span
                                className="ml-1 opacity-70"
                                aria-label={[
                                  running > 0 && `${running} running`,
                                  pending > 0 && `${pending} pending`,
                                  failed > 0 && `${failed} failed`,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              >
                                <span aria-hidden="true">
                                  {running > 0 && `▸${running}`}
                                  {pending > 0 && `·${pending}`}
                                  {failed > 0 && `×${failed}`}
                                </span>
                              </span>
                            )}
                          </span>
                          {failed > 0 && (
                            <button
                              onClick={() => retryFailedForLang(b, lang, failed)}
                              disabled={retryingFailed === retryKey}
                              title={`Retry ${failed} failed ${lang} chapter${failed === 1 ? "" : "s"}`}
                              aria-label={`Retry ${failed} failed ${lang} chapter${failed === 1 ? "" : "s"}`}
                              className="text-xs px-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 inline-flex items-center min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                            >
                              <RetryIcon className={`w-3 h-3 ${retryingFailed === retryKey ? "animate-spin" : ""}`} />
                            </button>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>

                <Link
                  href={`/reader/${b.id}`}
                  aria-label={`Open reader for ${b.title}`}
                  className="text-xs text-amber-700 hover:text-amber-800 shrink-0 min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  Open
                </Link>

                <select
                  aria-label="Translation language"
                  value={newLangInput[b.id] ?? "zh"}
                  onChange={(e) => setNewLangInput({ ...newLangInput, [b.id]: e.target.value })}
                  className="text-xs rounded border border-amber-300 px-1.5 py-0.5 shrink-0 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                  aria-label={`Translate ${b.title} into ${QUEUE_LANG_OPTIONS.find((o) => o.code === (newLangInput[b.id] ?? "zh"))?.label ?? (newLangInput[b.id] ?? "zh")}`}
                  className="text-xs px-2 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 shrink-0 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  {queueingLangFor?.startsWith(`${b.id}:`) ? "Queueing…" : "+ Translate"}
                </button>

                <button
                  onClick={() =>
                    setPendingConfirm({
                      message: `Delete "${b.title}" and all its audio/translations?`,
                      fn: () => act(() => adminFetch(`/admin/books/${b.id}`, { method: "DELETE" })),
                    })
                  }
                  aria-label={`Delete ${b.title}`}
                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 shrink-0 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                >
                  Delete
                </button>
              </div>

              {isExpanded && (
                <div id={`book-detail-${b.id}`} className="px-4 pb-4 pt-1 bg-amber-50/40 border-t border-amber-100">
                  {translatedLangs.length === 0 ? (
                    <p className="text-xs text-stone-600 italic">
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
                                className="text-xs text-stone-600 hover:text-amber-700 flex items-center min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                                aria-label={isLangExpanded ? `Collapse ${lang} translations` : `Expand ${lang} translations`}
                                aria-expanded={isLangExpanded}
                                aria-controls={`lang-detail-${b.id}-${lang}`}
                              >
                                {isLangExpanded ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
                              </button>
                              <span className="text-sm font-medium text-ink">{lang}</span>
                              <span className="text-xs text-stone-600">
                                · {count} chapter{count === 1 ? "" : "s"} cached
                              </span>

                              <button
                                disabled={bulkRetranslating === bulkKey}
                                onClick={() =>
                                  setPendingConfirm({
                                    message: `Retranslate ALL ${count} chapters of "${b.title}" → ${lang}? This deletes the current cache and regenerates.`,
                                    fn: async () => {
                                      setBulkRetranslating(bulkKey);
                                      try {
                                        const res = await adminFetch(`/admin/translations/${b.id}/retranslate-all`, {
                                          method: "POST",
                                          body: JSON.stringify({ target_language: lang }),
                                        });
                                        showToast(`Retranslated ${res.chapters} chapters of "${b.title}" → ${lang}`);
                                        await load({ silent: true });
                                      } catch (e: unknown) {
                                        setActError(e instanceof Error ? e.message : "Failed");
                                      } finally {
                                        setBulkRetranslating(null);
                                      }
                                    },
                                  })
                                }
                                aria-label={`Retranslate all ${lang} chapters of ${b.title}`}
                                className="ml-auto text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                              >
                                {bulkRetranslating === bulkKey ? "Retranslating…" : "Retranslate all"}
                              </button>
                              <button
                                onClick={() =>
                                  setPendingConfirm({
                                    message: `Delete all ${count} cached ${lang} translations for "${b.title}"?`,
                                    fn: () =>
                                      act(() =>
                                        adminFetch(`/admin/translations/${b.id}/${lang}`, {
                                          method: "DELETE",
                                        }),
                                      ),
                                  })
                                }
                                aria-label={`Delete all ${lang} translations for ${b.title}`}
                                className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                              >
                                Delete all
                              </button>
                            </div>

                            {isLangExpanded && (
                              <div id={`lang-detail-${b.id}-${lang}`} className="border-t border-amber-100 divide-y divide-amber-50 max-h-80 overflow-y-auto">
                                {chapterRows.length === 0 ? (
                                  <p className="text-xs text-stone-600 px-3 py-2">
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
                                          <span className="text-stone-600 w-16">Ch. {t.chapter_index + 1}</span>
                                          <span className="text-stone-600 flex-1">
                                            {(t.size_chars / 1000).toFixed(1)}K chars
                                          </span>
                                          <input
                                            aria-label="Move to chapter number"
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
                                            className="w-14 rounded border border-amber-300 px-1 py-0.5 text-xs placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                                            title="Reassign this translation to another chapter number (1-based)"
                                          />
                                          <button
                                            onClick={() => handleMove(t, moveInput[rowKey] ?? "")}
                                            disabled={moving === rowKey || !(moveInput[rowKey] ?? "").trim()}
                                            aria-label={`Move Ch. ${t.chapter_index + 1} ${t.target_language} translation`}
                                            className="px-2 py-0.5 rounded border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                                          >
                                            {moving === rowKey ? "…" : "Move"}
                                          </button>
                                          <button
                                            onClick={() => handleRetranslate(t)}
                                            disabled={retranslating === rowKey}
                                            aria-label={`Retranslate Ch. ${t.chapter_index + 1} ${t.target_language}`}
                                            className="px-2 py-0.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
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
                                            aria-label={`Delete Ch. ${t.chapter_index + 1} ${t.target_language} translation`}
                                            className="px-2 py-0.5 rounded border border-red-200 text-red-600 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
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
            </li>
          );
        })}
        {books.length === 0 ? (
          <li className="px-4 py-8 text-center text-amber-700 text-sm">No books cached.</li>
        ) : (
          books.filter((b) =>
            matchesAudit(b) && fuzzyMatchAny(searchQuery, [b.title, ...(b.authors || []), b.id]),
          ).length === 0 && (
            <li className="px-4 py-8 text-center text-amber-700 text-sm">
              {/* Name whichever filter emptied the list — a state filter with no
                  matches used to fall through to `No books match ""`. */}
              No books match
              {searchQuery ? ` \u201c${searchQuery}\u201d` : ""}
              {searchQuery && auditFilter !== "all" ? " in" : ""}
              {auditFilter !== "all" ? ` ${AUDIT_FILTER_LABELS[auditFilter]}` : ""}.
            </li>
          )
        )}
      </ul>
    </div>
  );
}
