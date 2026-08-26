"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VocabularyWord } from "@/lib/api";
import type { VocabExportOptions, VocabGroupBy } from "@/lib/vocabularyMarkdown";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useScrollLock } from "@/lib/useScrollLock";

const GROUPINGS: { value: VocabGroupBy; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "language", label: "Language" },
  { value: "book", label: "Book" },
  { value: "recent", label: "Recent" },
];

const UNKNOWN_LANGUAGE = "Unknown";

interface Props {
  words: VocabularyWord[];
  onDownload: (options: Required<VocabExportOptions>) => void;
  onClose: () => void;
}

export default function VocabExportDialog({ words, onDownload, onClose }: Props) {
  const [groupBy, setGroupBy] = useState<VocabGroupBy>("alpha");
  const [book, setBook] = useState("all");
  const [language, setLanguage] = useState("all");
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef);
  useScrollLock(true);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const books = useMemo(() => {
    const map = new Map<number, string>();
    for (const w of words) {
      for (const o of w.occurrences) {
        if (!map.has(o.book_id)) map.set(o.book_id, o.book_title?.trim() || "(deleted book)");
      }
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [words]);

  const languages = useMemo(() => {
    const set = new Set(words.map((w) => w.language ?? UNKNOWN_LANGUAGE));
    return Array.from(set).sort((a, b) => {
      if (a === UNKNOWN_LANGUAGE) return 1;
      if (b === UNKNOWN_LANGUAGE) return -1;
      return a.localeCompare(b);
    });
  }, [words]);

  function download() {
    onDownload({
      groupBy,
      bookId: book === "all" ? null : Number(book),
      language: language === "all" ? null : language,
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocab-export-title"
        className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-200 bg-parchment p-5 animate-fade-in"
        style={{ boxShadow: "var(--shadow-card-hover)" }}
      >
        <h2 id="vocab-export-title" className="font-serif font-semibold text-ink text-base mb-4">
          Export vocabulary
        </h2>

        <fieldset className="mb-4">
          <legend className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">Group by</legend>
          <div className="grid grid-cols-2 gap-1">
            {GROUPINGS.map((g) => (
              <label
                key={g.value}
                className="flex items-center gap-2 text-sm text-ink min-h-[44px] md:min-h-0 cursor-pointer rounded px-1"
              >
                <input
                  type="radio"
                  name="vocab-export-grouping"
                  value={g.value}
                  checked={groupBy === g.value}
                  onChange={() => setGroupBy(g.value)}
                  className="accent-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="vocab-export-books" className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
          Books
        </label>
        <select
          id="vocab-export-books"
          value={book}
          onChange={(e) => setBook(e.target.value)}
          className="w-full mb-4 rounded-lg border border-amber-300 bg-white px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All books</option>
          {books.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>

        <label htmlFor="vocab-export-language" className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1">
          Language
        </label>
        <select
          id="vocab-export-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full mb-5 rounded-lg border border-amber-300 bg-white px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            Download
          </button>
        </div>
      </div>
    </>
  );
}
