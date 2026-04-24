"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getAllAnnotations, getAllInsights, getVocabulary, AnnotationWithBook, BookInsightWithBook, VocabularyWord } from "@/lib/api";
import { NoteIcon, InsightIcon, VocabIcon, EmptyNotesIcon, ArrowLeftIcon, ArrowRightIcon, WordIcon } from "@/components/Icons";

interface BookSummary {
  bookId: number;
  title: string;
  annCount: number;
  insCount: number;
  vocCount: number;
  lastActivity: string; // ISO string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotesOverviewPage() {
  const router = useRouter();
  const { status } = useSession();

  const [annotations, setAnnotations] = useState<AnnotationWithBook[]>([]);
  const [insights, setInsights] = useState<BookInsightWithBook[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status !== "authenticated") return;
    setFetchError(false);
    Promise.all([getAllAnnotations(), getAllInsights(), getVocabulary()])
      .then(([anns, ins, voc]) => {
        setAnnotations(anns);
        setInsights(ins);
        setVocab(voc);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const books = useMemo<BookSummary[]>(() => {
    const map = new Map<number, BookSummary>();

    function ensure(bookId: number, title: string | null) {
      if (!map.has(bookId)) {
        map.set(bookId, {
          bookId,
          title: title ?? `Book #${bookId}`,
          annCount: 0,
          insCount: 0,
          vocCount: 0,
          lastActivity: new Date(0).toISOString(),
        });
      }
      return map.get(bookId)!;
    }

    for (const a of annotations) {
      const b = ensure(a.book_id, a.book_title);
      b.annCount++;
      if (a.created_at && a.created_at > b.lastActivity) b.lastActivity = a.created_at;
    }
    for (const i of insights) {
      const b = ensure(i.book_id, i.book_title);
      b.insCount++;
      if (i.created_at && i.created_at > b.lastActivity) b.lastActivity = i.created_at;
    }
    for (const v of vocab) {
      for (const o of v.occurrences) {
        const b = ensure(o.book_id, o.book_title);
        b.vocCount++;
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );
  }, [annotations, insights, vocab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? books.filter((b) => b.title.toLowerCase().includes(q)) : books;
  }, [books, search]);

  const totalAnn = annotations.length;
  const totalIns = insights.length;
  const totalVoc = new Set(vocab.map((v) => v.word)).size;

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 md:py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-amber-700 hover:text-amber-900 text-sm font-medium shrink-0"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline" aria-hidden="true" />Library
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-serif font-bold text-ink">Your Notes</h1>
          </div>
          {!loading && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                <NoteIcon className="w-3 h-3" />{totalAnn}
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
                <InsightIcon className="w-3 h-3" />{totalIns}
              </span>
              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                <WordIcon className="w-3 h-3" />{totalVoc}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
        {/* Search */}
        <input
          className="w-full rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          placeholder="Search books…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading ? (
          <div className="flex justify-center py-20">
            <span className="w-6 h-6 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="text-center text-stone-400 mt-20 flex flex-col items-center gap-2">
            <p className="font-serif text-lg text-red-500 mt-1">Failed to load notes.</p>
            <p className="text-sm">Please refresh the page to try again.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-stone-400">
            <EmptyNotesIcon className="w-14 h-14 mx-auto mb-4 text-amber-400/60" />
            {books.length === 0 ? (
              <>
                <p className="font-serif text-lg text-ink mb-1">No notes yet</p>
                <p className="text-sm">Annotate sentences or save AI insights while reading.</p>
              </>
            ) : (
              <p className="text-sm">No books match your search.</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((book) => (
              <button
                key={book.bookId}
                onClick={() => router.push(`/notes/${book.bookId}`)}
                className="w-full text-left rounded-xl border border-amber-200 bg-white/80 px-5 py-4 hover:border-amber-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-semibold text-ink text-base leading-snug group-hover:text-amber-900 transition-colors truncate">
                      {book.title}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {book.annCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                          <NoteIcon className="w-3 h-3 shrink-0" />
                          {book.annCount}
                        </span>
                      )}
                      {book.insCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5">
                          <InsightIcon className="w-3 h-3 shrink-0" />
                          {book.insCount}
                        </span>
                      )}
                      {book.vocCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                          <VocabIcon className="w-3 h-3 shrink-0" />
                          {book.vocCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-xs text-stone-400">{timeAgo(book.lastActivity)}</span>
                    <p className="text-amber-600 group-hover:text-amber-800 mt-0.5"><ArrowRightIcon className="w-5 h-5" aria-hidden="true" /></p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
