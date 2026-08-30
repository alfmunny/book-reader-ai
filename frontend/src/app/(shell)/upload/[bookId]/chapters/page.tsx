"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getDraftChapters,
  confirmChapters,
  saveDraftChapterMeta,
  saveDraftChapterStructure,
  getFrozenSplit,
  saveFrozenSplit,
  DraftChapter,
  ApiError,
} from "@/lib/api";
import ChapterAuditPanel, { AuditChapter } from "@/components/ChapterAuditPanel";
import { ArrowLeftIcon, AlertCircleIcon, RetryIcon } from "@/components/Icons";

/**
 * Audit the chapter split of an uploaded book before it joins your shelf.
 *
 * Every edit autosaves to the draft, so a long book can be audited across several
 * sessions — the previous editor held everything in React state and lost the work
 * if the tab closed.
 */
export default function ChapterEditorPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();

  const [chapters, setChapters] = useState<AuditChapter[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  // A confirmed book has no drafts left; its split is corrected in place instead.
  const [confirmed, setConfirmed] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Review chapters — Book Reader AI";
  }, []);

  const load = useCallback(() => {
    if (!bookId) return;
    setError(null);
    setLoading(true);
    getDraftChapters(Number(bookId))
      .then((data) => {
        setConfirmed(false);
        setChapters(
          data.chapters.map((ch: DraftChapter) => ({
            title: ch.title,
            text: ch.text ?? ch.preview ?? "",
            reviewed: Boolean(ch.reviewed),
          })),
        );
      })
      .catch((draftError: unknown) =>
        // No drafts means the book was already confirmed — reopen its split
        // rather than dead-ending, which is what used to happen.
        getFrozenSplit(Number(bookId))
          .then((data) => {
            setConfirmed(true);
            if (!data.editable) {
              const why = Object.entries(data.blocked_by || {})
                .map(([k, n]) => `${n} ${k}`)
                .join(", ");
              setBlocked(`${why} anchor to this split — changing it would move them to the wrong chapters.`);
            }
            setChapters(
              data.chapters.map((c) => ({ title: c.title, text: c.text, reviewed: true })),
            );
          })
          .catch(() =>
            // Both paths failed: report the draft failure, which is the primary
            // attempt. Reporting the fallback's error would mask the real cause.
            setError(
              draftError instanceof ApiError
                ? draftError.message
                : "Failed to load chapters.",
            ),
          ),
      )
      .finally(() => setLoading(false));
  }, [bookId]);

  useEffect(load, [load]);

  const saveFrozen = useCallback(
    (next: AuditChapter[]) =>
      saveFrozenSplit(Number(bookId), next.map((c) => ({ title: c.title, text: c.text }))),
    [bookId],
  );

  const saveMeta = useCallback(
    (next: AuditChapter[]) =>
      saveDraftChapterMeta(
        Number(bookId),
        next.map((c, i) => ({ chapter_index: i, title: c.title, reviewed: c.reviewed })),
      ),
    [bookId],
  );

  const saveStructure = useCallback(
    (next: AuditChapter[]) =>
      saveDraftChapterStructure(
        Number(bookId),
        next.map((c) => ({ title: c.title, text: c.text, reviewed: c.reviewed })),
      ),
    [bookId],
  );

  async function finish(next: AuditChapter[]) {
    setError(null);
    setFinishing(true);
    try {
      if (confirmed) {
        await saveFrozen(next);
        router.push(`/reader/${bookId}`);
        return;
      }
      // Persist the final structure first — confirm reads the draft rows, so an
      // unsaved split would be dropped on the way through.
      await saveStructure(next);
      await confirmChapters(
        Number(bookId),
        next.map((c, i) => ({ title: c.title, original_index: i })),
      );
      router.push(`/reader/${bookId}`);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to add the book to your shelf.");
      setFinishing(false);
    }
  }

  if (loading) {
    return (
      <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center">
        <div role="status" aria-label="Loading chapters">
          <span className="sr-only">Loading chapters...</span>
          <span className="w-6 h-6 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin block" aria-hidden="true" />
        </div>
      </main>
    );
  }

  if (error && !chapters) {
    return (
      <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
        <div role="alert" className="text-center max-w-sm">
          <AlertCircleIcon className="w-10 h-10 text-red-300 mx-auto mb-3" aria-hidden="true" />
          <p className="font-serif text-lg text-ink mb-2">Could not load chapters</p>
          <p className="text-sm text-stone-600 mb-6">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
            >
              <RetryIcon className="w-4 h-4" aria-hidden="true" />
              Retry
            </button>
            <Link
              href="/upload"
              className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 text-sm hover:bg-amber-50 transition-colors inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Try another file
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href="/bookshelf"
              className="text-sm text-amber-700 hover:text-amber-800 transition-colors min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <ArrowLeftIcon className="w-4 h-4 inline" aria-hidden="true" /> Bookshelf
            </Link>
            <h1 className="font-serif text-lg font-semibold text-ink">Review chapters</h1>
          </div>
          <p className="text-xs text-stone-600 m-0">
            {confirmed
              ? "Correcting the split of a book already on your shelf."
              : "Saved as you go — you can stop and come back."}
          </p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 space-y-4">
        {blocked && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {blocked}
          </div>
        )}

        {error && chapters && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertCircleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {chapters && (
          <ChapterAuditPanel
            chapters={chapters}
            onSaveMeta={confirmed ? saveFrozen : saveMeta}
            onSaveStructure={confirmed ? saveFrozen : saveStructure}
            onFinish={finish}
            finishLabel={confirmed ? "Save and read" : "Add to shelf"}
            busy={finishing}
          />
        )}
      </div>
    </main>
  );
}
