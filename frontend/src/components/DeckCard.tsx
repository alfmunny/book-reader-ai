"use client";
import type { DeckSummary } from "@/lib/api";
import { DeckIcon, TrashIcon } from "@/components/Icons";

interface DeckCardProps {
  deck: DeckSummary;
  onDelete?: (id: number) => void | Promise<void>;
}

export default function DeckCard({ deck, onDelete }: DeckCardProps) {
  const modeLabel = deck.mode === "smart" ? "Smart" : "Manual";
  return (
    <article
      data-testid={`deck-card-${deck.id}`}
      className="rounded-xl border border-amber-100 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <DeckIcon className="w-4 h-4 text-amber-600 shrink-0" />
            <h2 className="font-serif font-semibold text-ink text-base truncate">
              {deck.name}
            </h2>
            <span
              data-testid={`deck-mode-${deck.id}`}
              className="text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5 border border-amber-200"
            >
              {modeLabel}
            </span>
          </div>
          {deck.description && (
            <p className="text-sm text-stone-500 mt-1.5 line-clamp-2">{deck.description}</p>
          )}
          <div className="mt-3 flex items-center gap-3 text-xs text-stone-500">
            <span>
              <span
                data-testid={`deck-member-count-${deck.id}`}
                className="font-medium text-ink"
              >
                {deck.member_count}
              </span>{" "}
              {deck.member_count === 1 ? "word" : "words"}
            </span>
            {deck.due_today > 0 && (
              <span className="rounded-full bg-amber-700 text-white px-2 py-0.5">
                <span data-testid={`deck-due-today-${deck.id}`}>{deck.due_today}</span>{" "}
                due today
              </span>
            )}
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(deck.id)}
            aria-label={`Delete deck ${deck.name}`}
            data-testid={`deck-delete-${deck.id}`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-500 hover:text-red-600 transition-colors shrink-0"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
}
