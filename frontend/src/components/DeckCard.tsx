"use client";
import Link from "next/link";
import type { DeckSummary } from "@/lib/api";
import { DeckIcon, TrashIcon } from "@/components/Icons";

interface DeckCardProps {
  deck: DeckSummary;
  href?: string;
  onClick?: () => void;
  onDelete?: (id: number) => void | Promise<void>;
}

export default function DeckCard({ deck, href, onClick, onDelete }: DeckCardProps) {
  const modeLabel = deck.mode === "smart" ? "Smart" : "Manual";

  const cardContent = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <DeckIcon className="w-4 h-4 text-amber-600 shrink-0" />
        <h2 className="font-serif font-semibold text-ink text-base truncate" title={deck.name}>
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
        <p className="text-sm text-stone-600 mt-1.5 line-clamp-2" title={deck.description}>{deck.description}</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-stone-600">
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
    </>
  );

  return (
    <article
      data-testid={`deck-card-${deck.id}`}
      className="rounded-xl border border-amber-100 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        {href ? (
          <Link
            href={href}
            aria-label={`Open deck ${deck.name}`}
            data-testid={`deck-card-link-${deck.id}`}
            className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            {cardContent}
          </Link>
        ) : onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-label={`Open deck ${deck.name}`}
            data-testid={`deck-card-link-${deck.id}`}
            className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            {cardContent}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{cardContent}</div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(deck.id)}
            aria-label={`Delete deck ${deck.name}`}
            data-testid={`deck-delete-${deck.id}`}
            className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-600 hover:text-red-600 transition-colors shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </article>
  );
}
