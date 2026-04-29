"use client";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { AlertCircleIcon, CloseIcon, RetryIcon } from "@/components/Icons";

interface AudioEntry {
  book_id: number;
  chapter_index: number;
  provider: string;
  voice: string;
  chunks: number;
  size_mb: number;
  created_at: string;
}

export default function AudioPage() {
  const [audio, setAudio] = useState<AudioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actError, setActError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Admin: Audio — Book Reader AI";
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const a = await adminFetch("/admin/audio");
      setAudio(a);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audio");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
      setActError(null);
    } catch (e: unknown) {
      setActError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading)
    return (
      <div role="status" aria-label="Loading audio jobs" className="flex items-center justify-center py-16">
        <span className="sr-only">Loading audio jobs...</span>
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  if (error)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircleIcon className="w-10 h-10 text-red-300" aria-hidden="true" />
        <p className="font-serif text-lg text-ink">Failed to load audio.</p>
        <p className="text-sm text-stone-500">{error}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 transition-colors"
        >
          <RetryIcon className="w-4 h-4" aria-hidden="true" />
          Retry
        </button>
      </div>
    );

  return (
    <div className="space-y-3">
      <h2 className="sr-only">Audio Cache</h2>
      {actError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{actError}</span>
          <button
            type="button"
            onClick={() => setActError(null)}
            aria-label="Dismiss error"
            className="shrink-0 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-red-500 hover:text-red-700"
          >
            <CloseIcon className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}
    <ul role="list" aria-label="Audio files" className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden list-none p-0 m-0">
      {audio.map((a, i) => (
        <li key={i} className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink">
              Book {a.book_id}, Ch. {a.chapter_index + 1}
            </div>
            <div className="text-xs text-stone-500">
              {a.provider}/{a.voice} · {a.chunks} chunks · {a.size_mb} MB
            </div>
          </div>
          <button
            onClick={() =>
              act(() => adminFetch(`/admin/audio/${a.book_id}/${a.chapter_index}`, { method: "DELETE" }))
            }
            aria-label={`Delete audio for Book ${a.book_id}, Chapter ${a.chapter_index + 1}`}
            className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 min-h-[44px] md:min-h-0"
          >
            Delete
          </button>
        </li>
      ))}
      {audio.length === 0 && (
        <li className="px-4 py-8 text-center text-amber-700 text-sm">No audio cached.</li>
      )}
    </ul>
    </div>
  );
}
