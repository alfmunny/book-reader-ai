"use client";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

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
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-4 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  if (error)
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>;

  return (
    <div className="bg-white rounded-xl border border-amber-200 divide-y divide-amber-100 overflow-hidden">
      {audio.map((a, i) => (
        <div key={i} className="px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink">
              Book {a.book_id}, Ch. {a.chapter_index + 1}
            </div>
            <div className="text-xs text-stone-400">
              {a.provider}/{a.voice} · {a.chunks} chunks · {a.size_mb} MB
            </div>
          </div>
          <button
            onClick={() =>
              act(() => adminFetch(`/admin/audio/${a.book_id}/${a.chapter_index}`, { method: "DELETE" }))
            }
            className="text-xs px-2 py-1 rounded border border-red-200 text-red-500"
          >
            Delete
          </button>
        </div>
      ))}
      {audio.length === 0 && (
        <div className="px-4 py-8 text-center text-amber-600 text-sm">No audio cached.</div>
      )}
    </div>
  );
}
