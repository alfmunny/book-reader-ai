"use client";
import { useState } from "react";
import { searchAudiobooks, saveAudiobook, Audiobook } from "@/lib/api";

interface Props {
  bookId: number;
  defaultTitle: string;
  defaultAuthor: string;
  onLinked: (ab: Audiobook) => void;
  onClose: () => void;
}

export default function AudiobookSearch({
  bookId,
  defaultTitle,
  defaultAuthor,
  onLinked,
  onClose,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState(defaultAuthor);
  const [results, setResults] = useState<Audiobook[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function search() {
    if (!title.trim()) return;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const data = await searchAudiobooks(bookId, title, author);
      setResults(data.results);
      if (data.results.length === 0) setError("No audiobooks found on LibriVox.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function link(ab: Audiobook) {
    setSaving(ab.id);
    try {
      await saveAudiobook(bookId, ab);
      onLinked(ab);
    } catch (e: any) {
      setError(e.message);
      setSaving(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-amber-200 shrink-0">
          <div>
            <h2 className="font-serif font-bold text-ink">Find Audiobook</h2>
            <p className="text-xs text-amber-600 mt-0.5">Search LibriVox public domain audiobooks</p>
          </div>
          <button onClick={onClose} className="text-amber-500 hover:text-ink text-xl">×</button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-amber-100 shrink-0 space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <input
              className="w-32 rounded-lg border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <button
              onClick={search}
              disabled={searching || !title.trim()}
              className="rounded-lg bg-amber-700 px-4 py-2 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40 shrink-0"
            >
              {searching ? "…" : "Search"}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {searching && (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-amber-100 p-4">
                  <div className="h-4 bg-amber-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-amber-100 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-amber-100 rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {results.map((ab) => (
            <div
              key={ab.id}
              className="rounded-xl border border-amber-200 p-4 hover:border-amber-400 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-serif font-semibold text-sm text-ink">{ab.title}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{ab.authors.join(", ")}</p>
                  <p className="text-xs text-amber-500 mt-1">
                    {ab.sections.length} section{ab.sections.length !== 1 ? "s" : ""}
                    {ab.url_librivox && (
                      <> · <a href={ab.url_librivox} target="_blank" rel="noopener noreferrer"
                        className="underline hover:text-amber-700">LibriVox page</a></>
                    )}
                  </p>

                  {/* First few sections preview */}
                  {ab.sections.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {ab.sections.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-xs text-amber-600">
                          {s.number}. {s.title}
                          {s.duration ? ` · ${s.duration}` : ""}
                        </li>
                      ))}
                      {ab.sections.length > 3 && (
                        <li className="text-xs text-amber-400">
                          +{ab.sections.length - 3} more…
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                <button
                  onClick={() => link(ab)}
                  disabled={saving === ab.id}
                  className="shrink-0 rounded-lg bg-amber-700 px-3 py-1.5 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-40"
                >
                  {saving === ab.id ? "Saving…" : "Use this"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
