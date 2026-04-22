"use client";
import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getVocabulary,
  deleteVocabularyWord,
  exportVocabularyToObsidian,
  getWordDefinition,
  VocabularyWord,
  WordDefinition,
} from "@/lib/api";
import { EmptyVocabIcon, ArrowLeftIcon } from "@/components/Icons";

type SortMode = "alpha" | "language" | "book" | "recent";

const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: "alpha", label: "A–Z" },
  { value: "language", label: "Language" },
  { value: "book", label: "Book" },
  { value: "recent", label: "Recent" },
];

interface LemmaGroup {
  lemma: string;
  language: string | null;
  savedAt: string | null;
  forms: VocabularyWord[];
}

function buildGroups(words: VocabularyWord[]): LemmaGroup[] {
  const map = new Map<string, LemmaGroup>();
  for (const w of words) {
    const key = (w.lemma || w.word).toLowerCase();
    if (!map.has(key)) {
      map.set(key, { lemma: w.lemma || w.word, language: w.language ?? null, savedAt: w.created_at ?? null, forms: [] });
    }
    map.get(key)!.forms.push(w);
  }
  return Array.from(map.values()).sort((a, b) => a.lemma.localeCompare(b.lemma));
}

function buildSections(
  groups: LemmaGroup[],
  mode: SortMode,
): { heading: string; groups: LemmaGroup[] }[] {
  if (mode === "recent") {
    const sorted = [...groups].sort((a, b) => {
      const ta = a.savedAt ?? "";
      const tb = b.savedAt ?? "";
      return tb.localeCompare(ta);
    });
    return [{ heading: "", groups: sorted }];
  }

  if (mode === "alpha") {
    const byLetter = groups.reduce<Record<string, LemmaGroup[]>>((acc, g) => {
      const letter = g.lemma[0]?.toUpperCase() ?? "#";
      (acc[letter] ??= []).push(g);
      return acc;
    }, {});
    return Object.keys(byLetter)
      .sort()
      .map((letter) => ({ heading: letter, groups: byLetter[letter] }));
  }

  if (mode === "language") {
    const byLang = groups.reduce<Record<string, LemmaGroup[]>>((acc, g) => {
      const lang = g.language ?? "Unknown";
      (acc[lang] ??= []).push(g);
      return acc;
    }, {});
    const langs = Object.keys(byLang).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a.localeCompare(b);
    });
    return langs.map((lang) => ({ heading: lang, groups: byLang[lang] }));
  }

  // mode === "book": a word appears under every book it has occurrences in
  const byBook = new Map<string, LemmaGroup[]>();
  for (const g of groups) {
    const books = new Set<string>();
    for (const f of g.forms) {
      for (const occ of f.occurrences) {
        const title = occ.book_title ?? "(deleted book)";
        if (!books.has(title)) {
          books.add(title);
          if (!byBook.has(title)) byBook.set(title, []);
          byBook.get(title)!.push(g);
        }
      }
    }
  }
  return Array.from(byBook.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([heading, gs]) => ({ heading, groups: gs }));
}

interface DefinitionSheetProps {
  word: string;
  lang: string | null;
  onClose: () => void;
}

function DefinitionSheet({ word, lang, onClose }: DefinitionSheetProps) {
  const [def, setDef] = useState<WordDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getWordDefinition(word, lang ?? undefined)
      .then(setDef)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [word, lang]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let onDown: ((e: MouseEvent) => void) | undefined;
    const t = setTimeout(() => {
      onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      };
      document.addEventListener("mousedown", onDown);
    }, 100);
    return () => {
      clearTimeout(t);
      if (onDown) document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <div
        ref={ref}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t border-amber-200 max-h-[60vh] overflow-y-auto animate-slide-up"
      >
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-amber-200 rounded-full" />
        </div>
        <div className="px-5 pb-6 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif font-bold text-ink text-xl">{word}</span>
            {def && def.lemma !== word && (
              <span className="text-sm text-amber-600">← {def.lemma}</span>
            )}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
              Looking up…
            </div>
          )}

          {!loading && (!def || def.definitions.length === 0) && (
            <p className="text-sm text-stone-400 italic">No definition found.</p>
          )}

          {def && def.definitions.length > 0 && (
            <div className="space-y-2">
              {def.definitions.map((d, i) => (
                <div key={i}>
                  {d.pos && <span className="text-xs font-medium text-amber-700 italic">{d.pos}</span>}
                  <p className="text-sm text-ink leading-relaxed mt-0.5">{d.text}</p>
                </div>
              ))}
            </div>
          )}

          {def && (
            <a
              href={def.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-amber-600 hover:text-amber-800 hover:underline"
            >
              View on Wiktionary ↗
            </a>
          )}
        </div>
      </div>
    </>
  );
}

function VocabularyPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetWord = searchParams.get("word");

  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("alpha");
  const [activeWord, setActiveWord] = useState<{ word: string; lang: string | null } | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVocabulary()
      .then(setWords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  const groups = useMemo(() => buildGroups(words), [words]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.lemma.toLowerCase().includes(q) ||
        g.forms.some((f) => f.word.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  const sections = useMemo(() => buildSections(filtered, sortMode), [filtered, sortMode]);

  // Scroll to the target word on first load
  useEffect(() => {
    if (!targetWord || loading) return;
    const t = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => clearTimeout(t);
  }, [targetWord, loading]);

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

  function isTarget(group: LemmaGroup) {
    if (!targetWord) return false;
    return (
      group.lemma.toLowerCase() === targetWord.toLowerCase() ||
      group.forms.some((f) => f.word.toLowerCase() === targetWord.toLowerCase())
    );
  }

  const closeSheet = useCallback(() => setActiveWord(null), []);

  function renderGroup(group: LemmaGroup) {
    const target = isTarget(group);
    const occurrenceCount = group.forms.reduce((s, f) => s + f.occurrences.length, 0);
    const alternateForms = group.forms.filter(
      (f) => f.word.toLowerCase() !== group.lemma.toLowerCase(),
    );
    return (
      <div
        key={group.lemma}
        ref={target ? highlightRef : undefined}
        className={`rounded-xl border p-4 transition-colors ${
          target
            ? "bg-white border-amber-400 ring-2 ring-amber-300 animate-vocab-flash"
            : "bg-white border-amber-100"
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveWord({ word: group.lemma, lang: group.language })}
              className="font-serif font-semibold text-ink text-base hover:text-amber-700 transition-colors text-left"
            >
              {group.lemma}
            </button>
            {alternateForms.length > 0 && (
              <span className="text-xs text-stone-400">
                ({alternateForms.map((f) => f.word).join(", ")})
              </span>
            )}
            {group.language && (
              <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200">
                {group.language}
              </span>
            )}
            <span className="text-xs text-stone-400 bg-stone-100 rounded-full px-2 py-0.5">
              {occurrenceCount}×
            </span>
          </div>
          <div className="flex items-center gap-1">
            {group.forms.map((f) => (
              <button
                key={f.word}
                onClick={() => handleDelete(f.word)}
                disabled={deleting === f.word}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors min-h-[44px] md:min-h-0 flex items-center px-2"
                data-testid={`delete-${f.word}`}
              >
                {deleting === f.word ? "…" : "Delete"}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          {group.forms.flatMap((f) =>
            f.occurrences.map((occ, i) => (
              <div key={`${f.word}-${i}`} className="text-sm text-stone-600">
                {f.word !== group.lemma && (
                  <span className="text-xs text-amber-600 font-medium mr-1.5">{f.word}</span>
                )}
                {occ.book_title ? (
                  <a
                    href={`/reader/${occ.book_id}?chapter=${occ.chapter_index}`}
                    className="text-amber-700 font-medium hover:underline"
                  >
                    {occ.book_title}
                  </a>
                ) : (
                  <span className="text-stone-400 font-medium">(deleted book)</span>
                )}{" "}
                <span className="text-stone-400">{`Ch.${occ.chapter_index + 1}`}</span>
                {" — "}
                <span className="italic">&ldquo;{occ.sentence_text}&rdquo;</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" /> Library
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
        {words.length > 5 && (
          <div className="mb-6 space-y-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search words…"
              className="w-full rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex rounded-lg border border-amber-200 overflow-hidden" data-testid="sort-mode-control">
              {SORT_MODES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setSortMode(value)}
                  data-testid={`sort-${value}`}
                  className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
                    sortMode === value
                      ? "bg-amber-700 text-white"
                      : "bg-white text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-5 bg-amber-100 rounded w-full" />
            ))}
          </div>
        ) : words.length === 0 ? (
          <div className="text-center text-stone-400 mt-20 flex flex-col items-center gap-2">
            <EmptyVocabIcon className="w-14 h-14 text-amber-300" />
            <p className="font-serif text-lg text-stone-500 mt-1">No saved words yet.</p>
            <p className="text-sm">Double-click any word while reading to save it here.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-stone-400 mt-12 text-sm">No words match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="space-y-8">
            {sections.map(({ heading, groups: sectionGroups }) => (
              <div key={heading || "__flat__"}>
                {heading && (
                  <h2 className="font-serif font-bold text-xl text-amber-700 mb-3 border-b border-amber-100 pb-1">
                    {heading}
                  </h2>
                )}
                <div className="space-y-4">
                  {sectionGroups.map(renderGroup)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeWord && (
        <DefinitionSheet
          word={activeWord.word}
          lang={activeWord.lang}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

export default function VocabularyPage() {
  return (
    <Suspense>
      <VocabularyPageContent />
    </Suspense>
  );
}
