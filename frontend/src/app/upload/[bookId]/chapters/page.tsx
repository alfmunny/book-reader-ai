"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDraftChapters, confirmChapters, DraftChapter, ApiError } from "@/lib/api";
import { TrashIcon, ArrowLeftIcon } from "@/components/Icons";

interface ChapterSpec {
  title: string;
  original_index: number;
  word_count: number;
  preview: string;
}

export default function ChapterEditorPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();

  const [chapters, setChapters] = useState<ChapterSpec[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!bookId) return;
    getDraftChapters(Number(bookId))
      .then((data) => {
        setChapters(
          data.chapters.map((ch: DraftChapter) => ({
            title: ch.title,
            original_index: ch.index,
            word_count: ch.word_count,
            preview: ch.preview,
          })),
        );
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError ? e.message : "Failed to load chapters.");
      })
      .finally(() => setLoading(false));
  }, [bookId]);

  function handleTitleChange(idx: number, value: string) {
    setChapters((prev) => prev.map((ch, i) => (i === idx ? { ...ch, title: value } : ch)));
  }

  function handleRemove(idx: number) {
    setChapters((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (selected >= next.length) setSelected(Math.max(0, next.length - 1));
      return next;
    });
  }

  async function handleConfirm() {
    setError(null);
    setConfirming(true);
    try {
      await confirmChapters(
        Number(bookId),
        chapters.map((ch) => ({ title: ch.title, original_index: ch.original_index })),
      );
      router.push(`/reader/${bookId}`);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Failed to confirm chapters.");
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <main role="status" aria-label="Loading chapters" className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
      </main>
    );
  }

  if (error && chapters.length === 0) {
    return (
      <main id="main-content" className="min-h-screen bg-parchment flex items-center justify-center px-4">
        <div role="alert" className="text-center max-w-sm">
          <p className="font-serif text-lg text-ink mb-2">Could not load chapters</p>
          <p className="text-sm text-red-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/upload")}
            className="rounded-lg bg-amber-700 px-6 min-h-[44px] text-white font-medium hover:bg-amber-800 transition-colors flex items-center"
          >
            Try another file
          </button>
        </div>
      </main>
    );
  }

  const selectedChapter = chapters[selected];

  return (
    <main id="main-content" className="min-h-screen bg-parchment flex flex-col">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/upload")}
              className="text-sm text-amber-600 hover:text-amber-800 transition-colors min-h-[44px] flex items-center"
            >
              <ArrowLeftIcon className="w-4 h-4 inline" aria-hidden="true" /> Back
            </button>
            <h1 className="font-serif text-lg font-semibold text-ink">
              Review Chapters
              <span className="ml-2 text-sm font-normal text-stone-500">({chapters.length} detected)</span>
            </h1>
          </div>
          <button
            onClick={handleConfirm}
            disabled={confirming || chapters.length === 0}
            className="rounded-lg bg-amber-700 px-5 min-h-[44px] text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {confirming && (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
            )}
            {confirming ? "Saving…" : "Confirm & Start Reading →"}
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto w-full px-4 md:px-6 pt-4">
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 md:px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
        {/* Left: chapter list */}
        <div className="overflow-y-auto space-y-2 pr-1">
          {chapters.map((ch, i) => {
            const wordWarn = ch.word_count > 8000 || ch.word_count < 100;
            return (
              <div
                key={ch.original_index + "-" + i}
                onClick={() => setSelected(i)}
                className={`rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
                  selected === i
                    ? "border-amber-400 bg-amber-50"
                    : "border-amber-100 bg-white hover:border-amber-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={ch.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleTitleChange(i, e.target.value)}
                      className="w-full text-sm font-medium text-ink bg-transparent border-none outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 -mx-1"
                      aria-label={`Chapter ${i + 1} title`}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          wordWarn
                            ? "bg-amber-100 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {ch.word_count.toLocaleString()} words
                      </span>
                    </div>
                  </div>
                  <button
                    aria-label={`Remove chapter ${i + 1}`}
                    onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                    className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: preview */}
        <div className="bg-white rounded-xl border border-amber-100 p-5 overflow-y-auto">
          {selectedChapter ? (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-3">Preview</h2>
              <p className="font-serif font-semibold text-ink mb-3">{selectedChapter.title}</p>
              <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap font-serif">
                {selectedChapter.preview}
                {selectedChapter.preview.length >= 300 && (
                  <span className="text-stone-500">…</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-stone-500 text-center mt-8">Select a chapter to preview</p>
          )}
        </div>
      </div>
    </main>
  );
}
