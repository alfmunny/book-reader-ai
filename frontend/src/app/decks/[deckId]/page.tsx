"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DeckDetail,
  VocabularyWord,
  getDeck,
  getVocabulary,
} from "@/lib/api";
import { ArrowLeftIcon, DeckIcon } from "@/components/Icons";

export default function DeckDetailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams<{ deckId: string }>();
  const deckId = Number(params?.deckId);

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = "Deck — Book Reader AI";
  }, []);

  useEffect(() => {
    if (!Number.isFinite(deckId) || deckId <= 0) {
      setError(true);
      setLoading(false);
      return;
    }
    let alive = true;
    Promise.all([getDeck(deckId), getVocabulary()])
      .then(([d, v]) => {
        if (!alive) return;
        setDeck(d);
        setVocab(v);
        if (d?.name) document.title = `${d.name} — Book Reader AI`;
      })
      .catch(() => {
        if (!alive) return;
        setError(true);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [deckId, session?.backendToken]);

  const memberWords = useMemo(() => {
    if (!deck) return [];
    const memberIds = new Set(deck.members);
    return vocab.filter((w) => memberIds.has(w.id));
  }, [deck, vocab]);

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/decks")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] flex items-center"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" /> Decks
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold text-ink truncate">
            {deck?.name ?? "Deck"}
          </h1>
          {deck && (
            <p className="text-xs text-stone-400 mt-0.5">
              {deck.members.length} word{deck.members.length !== 1 ? "s" : ""}
              {deck.mode === "smart" ? " · smart" : ""}
            </p>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {loading ? (
          <div role="status" aria-label="Loading deck">
            <div className="space-y-3 animate-pulse">
              <div className="h-6 w-2/3 bg-amber-100 rounded" />
              <div className="h-4 w-full bg-amber-100 rounded" />
              <div className="h-4 w-5/6 bg-amber-100 rounded" />
              <div className="h-20 bg-amber-100 rounded-xl mt-4" />
              <div className="h-20 bg-amber-100 rounded-xl" />
            </div>
          </div>
        ) : error || !deck ? (
          <div
            role="alert"
            className="text-center mt-16 flex flex-col items-center gap-3"
          >
            <DeckIcon className="w-14 h-14 text-amber-300" />
            <p className="font-serif text-lg text-stone-500 mt-1">
              Could not load deck.
            </p>
            <button
              type="button"
              onClick={() => router.push("/decks")}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors min-h-[44px]"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Back to decks
            </button>
          </div>
        ) : (
          <>
            {deck.description && (
              <p className="text-sm text-stone-600 font-serif leading-relaxed mb-6">
                {deck.description}
              </p>
            )}

            {memberWords.length === 0 ? (
              <div
                data-testid="deck-detail-empty-state"
                className="text-center mt-16 flex flex-col items-center gap-3"
              >
                <DeckIcon className="w-14 h-14 text-amber-300" />
                <p className="font-serif text-lg text-stone-500 mt-1">
                  No words in this deck yet.
                </p>
                <p className="text-sm text-stone-400 max-w-xs">
                  Add words from your vocabulary to study them as a focused set.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/decks")}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px]"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  Back to decks
                </button>
              </div>
            ) : (
              <ul
                aria-label="Deck words"
                className="space-y-2"
                data-testid="deck-detail-members"
              >
                {memberWords.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-xl border border-amber-200 bg-white px-4 py-3 flex items-baseline justify-between gap-3"
                  >
                    <span className="font-serif text-ink truncate">
                      {w.word}
                    </span>
                    {w.language && (
                      <span className="text-xs uppercase tracking-wide text-stone-400 shrink-0">
                        {w.language}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
