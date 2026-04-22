"use client";
import { useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateChapterSummary } from "@/lib/api";

interface Props {
  bookId: string;
  chapterIndex: number;
  chapterText: string;
  chapterTitle: string;
  bookTitle: string;
  author: string;
  isVisible: boolean;
}

export default function ChapterSummary({
  bookId,
  chapterIndex,
  chapterText,
  chapterTitle,
  bookTitle,
  author,
  isVisible,
}: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  // Track which chapter the summary was generated for so we reset on navigation.
  const [summaryChapter, setSummaryChapter] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await generateChapterSummary(
        Number(bookId),
        chapterIndex,
        chapterText,
        bookTitle,
        author,
        chapterTitle,
      );
      setSummary(data.summary);
      setCached(data.cached);
      setSummaryChapter(chapterIndex);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("503")) {
        setError("Chapter summaries are not available — the admin hasn't configured a Gemini API key yet.");
      } else {
        setError("Failed to generate summary. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterIndex, chapterText, bookTitle, author, chapterTitle]);

  // Reset when navigating to a different chapter.
  useEffect(() => {
    if (summaryChapter !== null && summaryChapter !== chapterIndex) {
      setSummary(null);
      setCached(false);
      setSummaryChapter(null);
      setError(null);
    }
  }, [chapterIndex, summaryChapter]);

  // Auto-load once when the tab becomes visible.
  useEffect(() => {
    if (isVisible && summary === null && !loading && !error) {
      load();
    }
  }, [isVisible, summary, loading, error, load]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <span className="text-sm font-semibold text-stone-700">Chapter Summary</span>
          {cached && !loading && (
            <span className="text-[10px] bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">cached</span>
          )}
        </div>
        {!loading && (
          <button
            onClick={load}
            title="Regenerate summary"
            className="text-xs text-amber-600 hover:text-amber-800 hover:underline transition-colors"
          >
            {summary ? "↻ Refresh" : "Generate"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-4 bg-amber-100 rounded w-3/4" />
            <div className="h-4 bg-amber-100 rounded w-full" />
            <div className="h-4 bg-amber-100 rounded w-5/6" />
            <div className="h-3 bg-amber-50 rounded w-1/2 mt-4" />
            <div className="h-3 bg-amber-50 rounded w-full" />
            <div className="h-3 bg-amber-50 rounded w-4/5" />
            <div className="h-3 bg-amber-50 rounded w-3/4" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
            <p className="font-medium mb-1">Could not generate summary</p>
            <p className="text-xs text-red-500">{error}</p>
            <button
              onClick={load}
              className="mt-3 text-xs font-medium text-red-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {summary && !loading && (
          <div className="prose prose-sm prose-stone max-w-none text-stone-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary}
            </ReactMarkdown>
          </div>
        )}

        {!summary && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center text-stone-400 gap-3 py-8">
            <span className="text-4xl">📋</span>
            <p className="text-sm">Get a quick overview of this chapter before continuing.</p>
            <button
              onClick={load}
              className="mt-2 px-4 py-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-medium transition-colors"
            >
              Generate Summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
