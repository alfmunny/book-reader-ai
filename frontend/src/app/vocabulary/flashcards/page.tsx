"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getDueFlashcards,
  reviewFlashcard,
  getFlashcardStats,
  Flashcard,
  FlashcardStats,
} from "@/lib/api";
import { ArrowLeftIcon, FlashcardIcon, CheckIcon } from "@/components/Icons";

const GRADES = [
  { label: "Again", value: 0, className: "bg-red-100 text-red-700 hover:bg-red-200 border-red-200" },
  { label: "Hard", value: 2, className: "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200" },
  { label: "Good", value: 3, className: "bg-green-100 text-green-700 hover:bg-green-200 border-green-200" },
  { label: "Easy", value: 5, className: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" },
];

export default function FlashcardsPage() {
  const router = useRouter();
  const { status } = useSession();

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [stats, setStats] = useState<FlashcardStats | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [due, statsData] = await Promise.all([getDueFlashcards(), getFlashcardStats()]);
      setCards(due);
      setStats(statsData);
      setCurrentIndex(0);
      setFlipped(false);
      setDone(due.length === 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") loadData();
  }, [status, loadData]);

  const currentCard = cards[currentIndex] ?? null;

  const handleGrade = useCallback(async (grade: number) => {
    if (!currentCard || submitting) return;
    setSubmitting(true);
    try {
      await reviewFlashcard(currentCard.vocabulary_id, grade);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= cards.length) {
        const updatedStats = await getFlashcardStats();
        setStats(updatedStats);
        setDone(true);
      } else {
        setCurrentIndex(nextIndex);
        setFlipped(false);
      }
    } finally {
      setSubmitting(false);
    }
  }, [currentCard, currentIndex, cards.length, submitting]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
      </div>
    );
  }

  const reviewed = stats ? stats.reviewed_today : 0;
  const total = cards.length + reviewed;
  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-parchment">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/vocabulary")}
            aria-label="Back to vocabulary"
            className="p-2 rounded-lg hover:bg-amber-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeftIcon className="w-5 h-5 text-ink" />
          </button>
          <div className="flex items-center gap-2">
            <FlashcardIcon className="w-5 h-5 text-amber-600" />
            <h1 className="font-serif text-xl text-ink font-semibold">Flashcards</h1>
          </div>
          {stats && (
            <span className="ml-auto text-sm text-stone-500">
              {stats.reviewed_today} / {total} today
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Done state */}
        {done ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <CheckIcon className="w-12 h-12 text-green-500" />
            <h2 className="font-serif text-2xl text-ink">All done for today!</h2>
            <p className="text-sm text-stone-500">
              You reviewed {stats?.reviewed_today ?? 0} card{(stats?.reviewed_today ?? 0) !== 1 ? "s" : ""}.
              Come back tomorrow for more.
            </p>
            <button
              onClick={() => router.push("/vocabulary")}
              className="mt-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors min-h-[44px]"
            >
              Back to Vocabulary
            </button>
          </div>
        ) : currentCard ? (
          <div className="space-y-4">
            {/* Card */}
            <div
              role="button"
              tabIndex={0}
              aria-label={flipped ? "Card back — click to flip" : "Card front — click to reveal"}
              onClick={() => setFlipped(f => !f)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setFlipped(f => !f); }}
              className="cursor-pointer rounded-2xl border border-amber-200 bg-white p-8 min-h-[200px] flex flex-col items-center justify-center gap-3 hover:-translate-y-0.5 transition-all duration-200 select-none"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <span className="text-xs text-stone-400 uppercase tracking-wide">
                {flipped ? "Definition" : "Word"}
              </span>
              {!flipped ? (
                <span className="font-serif text-3xl text-ink font-bold text-center">
                  {currentCard.word}
                </span>
              ) : (
                <div className="text-center space-y-2">
                  <p className="text-sm text-stone-500 italic">
                    Tap a grade button below to continue
                  </p>
                </div>
              )}
              {!flipped && (
                <span className="text-xs text-stone-400 mt-2">tap to reveal</span>
              )}
            </div>

            {/* Grade buttons — shown after flip */}
            {flipped && (
              <div className="grid grid-cols-4 gap-2 animate-fade-in">
                {GRADES.map(({ label, value, className }) => (
                  <button
                    key={value}
                    onClick={() => handleGrade(value)}
                    disabled={submitting}
                    className={`py-3 rounded-xl border font-medium text-sm transition-colors min-h-[44px] disabled:opacity-50 ${className}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Flip hint when not yet flipped */}
            {!flipped && (
              <div className="flex justify-center">
                <button
                  onClick={() => setFlipped(true)}
                  className="px-6 py-3 bg-amber-500 text-white rounded-xl font-medium hover:bg-amber-600 transition-colors min-h-[44px]"
                >
                  Show answer
                </button>
              </div>
            )}

            {/* Card counter */}
            <p className="text-center text-xs text-stone-400">
              {currentIndex + 1} of {cards.length} remaining
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
