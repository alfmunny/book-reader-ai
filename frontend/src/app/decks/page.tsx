"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DeckSummary, deleteDeck, listDecks } from "@/lib/api";
import DeckCard from "@/components/DeckCard";
import UndoToast from "@/components/UndoToast";
import { ArrowLeftIcon, DeckIcon, AlertCircleIcon, RetryIcon } from "@/components/Icons";

export default function DecksPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [removedDeckToast, setRemovedDeckToast] = useState<DeckSummary | null>(null);

  useEffect(() => {
    document.title = "Decks — Book Reader AI";
  }, []);

  const loadDecks = useCallback(() => {
    setFetchError(false);
    setLoading(true);
    listDecks()
      .then((d) => {
        setDecks(d);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDecks();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken]);

  const handleDelete = useCallback((id: number) => {
    setDecks((prev) => {
      const removed = prev.find((d) => d.id === id);
      if (removed) {
        // If a previous toast is still showing, commit that delete immediately
        setRemovedDeckToast((current) => {
          if (current) {
            deleteDeck(current.id).catch(() => {});
          }
          return removed;
        });
      }
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const showNewDeckBtn = !loading && !fetchError && decks.length > 0;

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] md:min-h-0 flex items-center"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" /> Library
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold text-ink truncate">Decks</h1>
          {!loading && !fetchError && (
            <p className="text-xs text-stone-600 mt-0.5">
              {decks.length} deck{decks.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {showNewDeckBtn && (
          <button
            type="button"
            onClick={() => router.push("/decks/new")}
            data-testid="decks-new-btn"
            aria-label="New deck"
            className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px] md:min-h-0 shrink-0"
          >
            <DeckIcon className="w-4 h-4" />
            <span className="hidden sm:inline">New deck</span>
          </button>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {loading ? (
          <div role="status" aria-label="Loading decks">
            <span className="sr-only">Loading decks...</span>
            <div className="space-y-3 animate-pulse">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-amber-100 rounded-xl" />
              ))}
            </div>
          </div>
        ) : fetchError ? (
          <div role="alert" className="text-center text-stone-600 mt-16 flex flex-col items-center gap-2">
            <AlertCircleIcon className="w-12 h-12 text-red-300 mx-auto mb-1" aria-hidden="true" />
            <p className="font-serif text-lg text-red-700 mt-1">Failed to load decks.</p>
            <p className="text-sm">Check your connection and try again.</p>
            <button
              type="button"
              onClick={loadDecks}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px] md:min-h-0"
            >
              <RetryIcon className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : decks.length === 0 ? (
          <div
            data-testid="decks-empty-state"
            className="text-center mt-16 flex flex-col items-center gap-3"
          >
            <DeckIcon className="w-14 h-14 text-amber-300" />
            <p className="font-serif text-lg text-stone-600 mt-1">No study decks yet.</p>
            <p className="text-sm text-stone-600 max-w-xs">
              Build focused review lists from your saved vocabulary. Start with a manual
              deck — pick a few words and study just them.
            </p>
            <button
              type="button"
              onClick={() => router.push("/decks/new")}
              data-testid="decks-empty-new-btn"
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 text-sm font-medium transition-colors min-h-[44px] md:min-h-0"
            >
              <DeckIcon className="w-4 h-4" />
              New deck
            </button>
          </div>
        ) : (
          <ul role="list" aria-label="Your decks" className="space-y-4 list-none p-0 m-0">
            {decks.map((d) => (
              <li key={d.id}>
                <DeckCard
                  deck={d}
                  onClick={() => router.push(`/decks/${d.id}`)}
                  onDelete={handleDelete}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {removedDeckToast && (
        <UndoToast
          message={`"${removedDeckToast.name}" deleted`}
          onUndo={() => {
            setDecks((prev) => [...prev, removedDeckToast]);
            setRemovedDeckToast(null);
          }}
          onDone={() => {
            deleteDeck(removedDeckToast.id).catch(() => {});
            setRemovedDeckToast(null);
          }}
        />
      )}
    </main>
  );
}
