"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getVocabulary, deleteVocabularyWord, exportVocabularyToObsidian, VocabularyWord } from "@/lib/api";

export default function VocabularyPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    getVocabulary()
      .then(setWords)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.backendToken]);

  // Group words alphabetically
  const grouped = words.reduce<Record<string, VocabularyWord[]>>((acc, w) => {
    const letter = w.word[0]?.toUpperCase() ?? "#";
    (acc[letter] ??= []).push(w);
    return acc;
  }, {});
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
    try {
      const { url } = await exportVocabularyToObsidian(bookId);
      setExportMsg(url);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Export failed");
    }
    setTimeout(() => setExportMsg(null), 6000);
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm"
        >
          ← Library
        </button>
        <h1 className="font-serif font-bold text-ink flex-1">Vocabulary</h1>
        <button
          onClick={() => handleExport()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors"
          data-testid="export-all-btn"
        >
          ↗ Export all to Obsidian
        </button>
      </header>

      {/* Export result toast */}
      {exportMsg && (
        <div className="mx-6 mt-4 border border-amber-300 bg-amber-50 rounded-xl px-4 py-3 text-sm text-ink">
          {exportMsg.startsWith("http") ? (
            <>
              Exported!{" "}
              <a
                href={exportMsg}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-700 underline break-all"
              >
                {exportMsg}
              </a>
            </>
          ) : (
            <span className="text-red-600">{exportMsg}</span>
          )}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-8">
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
            <p className="text-sm mt-1">
              Double-click any word while reading to save it here.
            </p>
          </div>
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
                        <h3 className="font-serif font-semibold text-ink text-base">{item.word}</h3>
                        <button
                          onClick={() => handleDelete(item.word)}
                          disabled={deleting === item.word}
                          className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 transition-colors"
                          data-testid={`delete-${item.word}`}
                        >
                          {deleting === item.word ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {item.occurrences.map((occ, i) => (
                          <div key={i} className="text-sm text-stone-600">
                            <a
                              href={`/reader/${occ.book_id}`}
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
