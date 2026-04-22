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

interface LemmaGroup {
  lemma: string;
  language: string | null;
  forms: VocabularyWord[];
}

function buildGroups(words: VocabularyWord[]): LemmaGroup[] {
  const map = new Map<string, LemmaGroup>();
  for (const w of words) {
    const key = (w.lemma || w.word).toLowerCase();
    if (!map.has(key)) {
      map.set(key, { lemma: w.lemma || w.word, language: w.language ?? null, forms: [] });
    }
    map.get(key)!.forms.push(w);
  }
  return Array.from(map.values()).sort((a, b) => a.lemma.localeCompare(b.lemma));
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
    const t = setTimeout(() => {
      function onDown(e: MouseEvent) {
        if (ref.current && !ref.current.contains(e.target as Node)) onClose();
      }
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }, 100);
    return () => clearTimeout(t);
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

  const letterGroups = useMemo(() =>
    filtered.reduce<Record<string, LemmaGroup[]>>((acc, g) => {
      const letter = g.lemma[0]?.toUpperCase() ?? "#";
      (acc[letter] ??= []).push(g);
      return acc;
    }, {}),
    [filtered]
  );
  const letters = Object.keys(letterGroups).sort();

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
        ) : filtered.length === 0 ? (
          <p className="text-center text-stone-400 mt-12 text-sm">No words match &ldquo;{search}&rdquo;</p>
        ) : (
          <div className="space-y-8">
            {letters.map((letter) => (
              <div key={letter}>
                <h2 className="font-serif font-bold text-xl text-amber-700 mb-3 border-b border-amber-100 pb-1">
                  {letter}
                </h2>
                <div className="space-y-4">
                  {letterGroups[letter].map((group) => {
                    const target = isTarget(group);
                    const occurrenceCount = group.forms.reduce((s, f) => s + f.occurrences.length, 0);
                    const alternateForms = group.forms.filter(
                      (f) => f.word.toLowerCase() !== group.lemma.toLowerCase(),
                    );
                    return (
                      <div
                        key={group.lemma}
                        ref={target ? highlightRef : undefined}
                        className={`bg-white rounded-xl border p-4 transition-colors ${
                          target ? "border-amber-400 ring-2 ring-amber-300" : "border-amber-100"
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
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
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
