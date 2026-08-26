"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { AlertCircleIcon, RetryIcon, CheckCircleIcon } from "@/components/Icons";

export interface PendingBook {
  id: number;
  title: string;
  authors: string[];
  languages: string[];
  frozen_at: string | null;
  audited_by: string | null;
  splitter: string | null;
  chapter_source: string | null;
  chapter_count: number;
  translations?: {
    language: string;
    translated: number;
    total: number;
    complete: boolean;
  }[];
}

/**
 * Books an architect session froze that nobody has published yet.
 *
 * Freezing fixes the chapter split — technical, irreversible, and safe for a
 * session to decide alone because a frozen-but-unlisted book is invisible.
 * Publishing puts it in front of readers, so it waits for a person here
 * (migration 046).
 */
export default function PendingPublishPanel() {
  const [books, setBooks] = useState<PendingBook[]>([]);
  const [loading, setLoading] = useState(true);
  // Two kinds of failure, two behaviours: a load failure means there is no queue
  // to show, so it replaces the list. A publish failure must NOT hide the queue —
  // the row is still there and still needs a decision.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [justPublished, setJustPublished] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    adminFetch("/admin/books/pending-publish")
      .then((data) => setBooks(Array.isArray(data) ? data : []))
      .catch((e) => setLoadError(e?.message || "Couldn't load the review queue."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function publish(book: PendingBook) {
    setBusyId(book.id);
    setActionError(null);
    try {
      await adminFetch(`/admin/books/${book.id}/publish`, { method: "POST" });
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
      setJustPublished(book.title);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't publish that book.");
    } finally {
      setBusyId(null);
    }
  }

  // Nothing waiting is the normal state — say so quietly rather than showing an
  // empty box, but never hide the section entirely: its absence would read as
  // "this feature is gone" rather than "there is nothing to do".
  return (
    <section aria-labelledby="pending-publish-heading" className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="pending-publish-heading" className="text-xs font-semibold uppercase tracking-widest text-stone-600">
          Awaiting review
        </h2>
        {books.length > 0 && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {books.length}
          </span>
        )}
      </div>

      {loading && (
        <div role="status" className="flex items-center gap-2 text-amber-700 text-sm py-2">
          <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin shrink-0" aria-hidden="true" />
          Loading the review queue…
        </div>
      )}

      {!loading && loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {loadError}
          </span>
          <button
            onClick={load}
            className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            <RetryIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && books.length === 0 && (
        <p className="text-sm text-stone-600 italic">
          {justPublished
            ? `“${justPublished}” is in the library. Nothing else is waiting.`
            : "Nothing waiting. Frozen books appear here before they reach the library."}
        </p>
      )}

      {actionError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-3 text-sm text-red-700">
          <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {actionError}
        </div>
      )}

      {!loading && !loadError && books.length > 0 && (
        <ul role="list" aria-label="Books awaiting review" className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden list-none p-0 m-0">
          {books.map((book) => (
            <li key={book.id} className="flex items-center gap-4 flex-wrap px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-serif font-semibold text-ink" lang={book.languages?.[0] ?? undefined}>
                  {book.title}
                </p>
                <p className="text-xs text-stone-600 mt-0.5">
                  {book.authors?.join(", ")}
                  {book.authors?.length ? " · " : ""}
                  {book.chapter_count} chapters
                  {book.frozen_at ? ` · frozen ${book.frozen_at}` : ""}
                  {book.audited_by ? ` · audited by ${book.audited_by}` : ""}
                </p>
                {/* A frozen split says nothing about whether the book is ready.
                    Shown, not enforced: publishing an untranslated original is
                    legitimate, so this informs rather than blocks. */}
                <p className="flex flex-wrap items-center gap-1.5 mt-1.5 m-0">
                  {book.translations?.length ? (
                    book.translations.map((t) => (
                      <span
                        key={t.language}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                          t.complete
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                        title={
                          t.complete
                            ? `${t.language}: all ${t.total} chapters translated`
                            : `${t.language}: ${t.total - t.translated} of ${t.total} chapters still untranslated`
                        }
                      >
                        {t.language} {t.complete ? "complete" : `${t.translated}/${t.total}`}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                      not translated
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/reader/${book.id}`}
                  className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  Read it first
                </Link>
                <button
                  onClick={() => publish(book)}
                  disabled={busyId === book.id}
                  className="text-xs font-medium px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                >
                  {busyId === book.id ? "Publishing…" : (<><CheckCircleIcon className="w-3.5 h-3.5" aria-hidden="true" />Publish</>)}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
