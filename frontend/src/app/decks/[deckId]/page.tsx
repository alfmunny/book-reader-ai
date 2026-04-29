"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DeckDetail,
  VocabularyWord,
  addDeckMember,
  getDeck,
  getVocabulary,
  removeDeckMember,
} from "@/lib/api";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CloseIcon,
  DeckIcon,
  PlusIcon,
  RetryIcon,
  TrashIcon,
} from "@/components/Icons";
import UndoToast from "@/components/UndoToast";
import { useFocusTrap } from "@/lib/useFocusTrap";

export default function DeckDetailPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams<{ deckId: string }>();
  const deckId = Number(params?.deckId);

  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removedToast, setRemovedToast] = useState<VocabularyWord | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    document.title = "Deck — Book Reader AI";
  }, []);

  const loadDeck = useCallback(() => {
    if (!Number.isFinite(deckId) || deckId <= 0) {
      setError(true);
      setLoading(false);
      return;
    }
    setError(false);
    setLoading(true);
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
  }, [deckId]);

  useEffect(() => {
    const cleanup = loadDeck();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, session?.backendToken]);

  const memberIds = useMemo(
    () => new Set(deck?.members ?? []),
    [deck?.members],
  );

  const memberWords = useMemo(
    () => vocab.filter((w) => memberIds.has(w.id)),
    [vocab, memberIds],
  );

  const candidateWords = useMemo(
    () => vocab.filter((w) => !memberIds.has(w.id)),
    [vocab, memberIds],
  );

  const isManual = deck?.mode === "manual";

  const handleRemove = useCallback(
    (vocabularyId: number) => {
      setDeck((prev) => {
        if (!prev) return prev;
        const removed = vocab.find((w) => w.id === vocabularyId) ?? null;
        if (removed) {
          setRemovedToast((current) => {
            if (current) {
              removeDeckMember(deckId, current.id).catch(() => {});
            }
            return removed;
          });
        }
        return { ...prev, members: prev.members.filter((id) => id !== vocabularyId) };
      });
    },
    [deckId, vocab],
  );

  const handleAdd = useCallback(
    (vocabularyId: number) => {
      setDeck((prev) =>
        prev ? { ...prev, members: [...prev.members, vocabularyId] } : prev,
      );
      addDeckMember(deckId, vocabularyId).catch(() => {
        setDeck((prev) =>
          prev
            ? { ...prev, members: prev.members.filter((id) => id !== vocabularyId) }
            : prev,
        );
      });
    },
    [deckId],
  );

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur px-4 md:px-6 py-3 md:py-4 flex items-center gap-3 md:gap-4">
        <button
          onClick={() => router.push("/decks")}
          className="text-amber-700 hover:text-amber-900 text-sm min-h-[44px] md:min-h-0 flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <ArrowLeftIcon className="w-4 h-4 shrink-0" /> Decks
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif font-bold text-ink truncate" title={deck?.name}>
            {deck?.name ?? "Deck"}
          </h1>
          {deck && (
            <p className="text-xs text-stone-600 mt-0.5">
              {deck.members.length} word{deck.members.length !== 1 ? "s" : ""}
              {deck.mode === "smart" ? " · smart" : ""}
            </p>
          )}
        </div>
        {deck && isManual && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-label="Add word to deck"
            disabled={candidateWords.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors min-h-[44px] md:min-h-0 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Add word</span>
          </button>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {loading ? (
          <div role="status" aria-label="Loading deck">
            <span className="sr-only">Loading deck...</span>
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
            <AlertCircleIcon className="w-10 h-10 text-red-300 mx-auto" aria-hidden="true" />
            <p className="font-serif text-lg text-ink mt-1">
              Could not load deck.
            </p>
            <p className="text-sm text-stone-600">Check your connection and try again.</p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <button
                type="button"
                onClick={loadDeck}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
              >
                <RetryIcon className="w-4 h-4" aria-hidden="true" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => router.push("/decks")}
                className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 text-sm hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
              >
                Back to decks
              </button>
            </div>
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
                <p className="font-serif text-lg text-stone-600 mt-1">
                  No words in this deck yet.
                </p>
                <p className="text-sm text-stone-600 max-w-xs">
                  {isManual
                    ? "Add words from your vocabulary to study them as a focused set."
                    : "This smart deck has no matching words yet — saved vocabulary that matches the rules will appear here."}
                </p>
                {isManual ? (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={candidateWords.length === 0}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Add word
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/decks")}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    Back to decks
                  </button>
                )}
              </div>
            ) : (
              <ul
                role="list"
                aria-label="Deck words"
                className="space-y-2 list-none p-0 m-0"
                data-testid="deck-detail-members"
              >
                {memberWords.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-xl border border-amber-200 bg-white px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="font-serif text-ink truncate flex-1 min-w-0" lang={w.language ?? undefined} title={w.word}>
                      {w.word}
                    </span>
                    {w.language && (
                      <span className="text-xs uppercase tracking-wide text-stone-600 shrink-0">
                        {w.language}
                      </span>
                    )}
                    {isManual && (
                      <button
                        type="button"
                        onClick={() => handleRemove(w.id)}
                        aria-label={`Remove ${w.word} from deck`}
                        className="shrink-0 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center rounded-lg text-stone-600 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {pickerOpen && deck && isManual && (
        <AddWordPicker
          candidates={candidateWords}
          onClose={() => setPickerOpen(false)}
          onAdd={(id) => {
            handleAdd(id);
          }}
        />
      )}

      {removedToast && (
        <UndoToast
          message={`"${removedToast.word}" removed`}
          onUndo={() => {
            setDeck((prev) =>
              prev && removedToast
                ? { ...prev, members: [...prev.members, removedToast.id] }
                : prev,
            );
            setRemovedToast(null);
          }}
          onDone={() => {
            removeDeckMember(deckId, removedToast.id).catch(() => {});
            setRemovedToast(null);
          }}
        />
      )}
    </main>
  );
}

interface AddWordPickerProps {
  candidates: VocabularyWord[];
  onClose: () => void;
  onAdd: (vocabularyId: number) => void;
}

function AddWordPicker({ candidates, onClose, onAdd }: AddWordPickerProps) {
  const [query, setQuery] = useState("");
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((w) => w.word.toLowerCase().includes(q))
    : candidates;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-stone-900/40"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-word-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md bg-parchment rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[80vh] animate-slide-up"
      >
        <div className="flex items-center gap-3 border-b border-amber-200 px-4 py-3">
          <h2
            id="add-word-picker-title"
            className="flex-1 font-serif text-lg text-ink"
          >
            Add word
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close add-word picker"
            className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center rounded-lg text-stone-600 hover:text-ink hover:bg-amber-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {candidates.length > 0 && (
          <div className="px-4 pt-3">
            <label htmlFor="add-word-picker-search" className="sr-only">
              Filter words
            </label>
            <input
              id="add-word-picker-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter your vocabulary…"
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-ink placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {candidates.length === 0 ? (
            <p className="text-sm text-stone-600 text-center py-6">
              All your saved words are already in this deck.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-stone-600 text-center py-6">
              No matches.
            </p>
          ) : (
            <ul role="list" aria-label="Available words" className="space-y-1.5 list-none p-0 m-0">
              {filtered.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(w.id);
                    }}
                    aria-label={`Add ${w.word} to deck`}
                    title={w.word}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:border-amber-400 hover:bg-amber-50 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  >
                    <span className="font-serif text-ink truncate flex-1 min-w-0" lang={w.language ?? undefined}>
                      {w.word}
                    </span>
                    {w.language && (
                      <span className="text-xs uppercase tracking-wide text-stone-600 shrink-0">
                        {w.language}
                      </span>
                    )}
                    <PlusIcon className="w-4 h-4 text-amber-700 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
