"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getVocabulary, deleteVocabularyWord, exportVocabularyToObsidian, VocabularyWord } from "@/lib/api";

const LANG_NAMES: Record<string, string> = {
  de: "Deutsch", en: "English", fr: "Français", es: "Español",
  zh: "中文", ja: "日本語", it: "Italiano", pt: "Português",
  nl: "Nederlands", ru: "Русский", ar: "العربية", ko: "한국어",
  la: "Latina", fi: "Suomi", sv: "Svenska", pl: "Polski",
};

export default function VocabularyPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<string | null>(null);

  useEffect(() => {
    getVocabulary()
      .then(setWords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  // Collect available languages across all words
  const availableLanguages = useMemo(() => {
    const seen = new Set<string>();
    for (const w of words) {
      for (const o of w.occurrences) {
        if (o.book_language) seen.add(o.book_language);
      }
    }
    return [...seen].sort();
  }, [words]);

  // Filter by language, then by search query
  const filtered = useMemo(() => {
    let result = words;
    if (langFilter) {
      result = words
        .map((w) => ({ ...w, occurrences: w.occurrences.filter((o) => o.book_language === langFilter) }))
        .filter((w) => w.occurrences.length > 0);
    }
    const q = search.trim().toLowerCase();
    return q ? result.filter((w) => w.word.toLowerCase().includes(q)) : result;
  }, [words, search, langFilter]);

  const grouped = useMemo(() =>
    filtered.reduce<Record<string, VocabularyWord[]>>((acc, w) => {
      const letter = w.word[0]?.toUpperCase() ?? "#";
      (acc[letter] ??= []).push(w);
      return acc;
    }, {}),
    [filtered]
  );
  const letters = Object.keys(grouped).sort();

  async function handleDelete(word: string) {
    setDeleting(word);
    try {
      await deleteVocabularyWord(word);
      setWords((prev) => prev.filter((w) => w.word !== word));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  }

  async function handleExport(bookId?: number) {
    setExporting(true);
    try {
      const { urls } = await exportVocabularyToObsidian(bookId);
      setExportMsg(urls[0] || "Exported successfully");
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 8000);
    }
  }

  const totalOccurrences = words.reduce((sum, w) => sum + w.occurrences.length, 0);
  const filteredCount = filtered.length;

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center"
        >
          ← Library
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold text-ink truncate">Vocabulary</h1>
          {!loading && (
            <p className="text-xs text-stone-400 mt-0.5">
              {words.length} word{words.length !== 1 ? "s" : ""} · {totalOccurrences} occurrence{totalOccurrences !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          onClick={() => handleExport()}
          disabled={exporting || words.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors disabled:opacity-50 min-h-[44px] md:min-h-0 shrink-0"
          data-testid="export-all-btn"
        >
          {exporting ? "Exporting…" : (<><span className="hidden sm:inline">↗ Export all to Obsidian</span><span className="sm:hidden">↗ Export</span></>)}
        </button>
      </header>

      {/* Export result */}
      {exportMsg && (
        <div className="mx-6 mt-4 border border-amber-300 bg-amber-50 rounded-xl px-4 py-3 text-sm text-ink">
          {exportMsg.startsWith("http") ? (
            <>Exported! <a href={exportMsg} target="_blank" rel="noopener noreferrer" className="text-amber-700 underline break-all">{exportMsg}</a></>
          ) : (
            <span className="text-red-600">{exportMsg}</span>
          )}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Language filter tabs */}
        {availableLanguages.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-5" data-testid="lang-filter">
            <button
              onClick={() => setLangFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                langFilter === null
                  ? "bg-amber-700 text-white border-amber-700"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              All
            </button>
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                onClick={() => setLangFilter(lang)}
                data-testid={`lang-filter-${lang}`}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  langFilter === lang
                    ? "bg-amber-700 text-white border-amber-700"
                    : "border-amber-300 text-amber-700 hover:bg-amber-50"
                }`}
              >
                {LANG_NAMES[lang] ?? lang.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        {words.length > 5 && (
          <div className="mb-6">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search words…"
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-5 bg-amber-100 rounded w-full" />
            ))}
          </div>
        ) : words.length === 0 ? (
          <div className="text-center text-stone-400 mt-20">
            <p className="text-4xl mb-3">📖</p>
            <p className="font-serif text-lg">No saved words yet.</p>
            <p className="text-sm mt-1">Double-click any word while reading to save it here.</p>
          </div>
        ) : filteredCount === 0 ? (
          <p className="text-center text-stone-400 mt-12 text-sm">
            {search ? `No words match "${search}"` : "No words for this language yet."}
          </p>
        ) : (
          <div className="space-y-8">
            {letters.map((letter) => (
              <div key={letter}>
                <h2 className="font-serif font-bold text-xl text-amber-700 mb-3 border-b border-amber-100 pb-1">
                  {letter}
                </h2>
                <div className="space-y-4">
                  {grouped[letter].map((item) => (
                    <div key={item.word} className="bg-white rounded-xl border border-amber-100 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h3 className="font-serif font-semibold text-ink text-base">{item.word}</h3>
                          <span className="text-xs text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">
                            {item.occurrences.length}×
                          </span>
                        </div>
                        <button
                          onClick={() => handleDelete(item.word)}
                          disabled={deleting === item.word}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors min-h-[44px] md:min-h-0 flex items-center px-2"
                          data-testid={`delete-${item.word}`}
                        >
                          {deleting === item.word ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {item.occurrences.map((occ, i) => (
                          <div key={i} className="text-sm text-stone-600">
                            <a
                              href={`/reader/${occ.book_id}?chapter=${occ.chapter_index}`}
                              className="text-amber-700 font-medium hover:underline"
                            >
                              {occ.book_title}
                            </a>{" "}
                            <span className="text-stone-400">{`Ch.${occ.chapter_index + 1}`}</span>
                            {" — "}
                            <span className="italic">&ldquo;{occ.sentence_text}&rdquo;</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
