"use client";
import { BookMeta } from "@/lib/api";
import { CloseIcon } from "@/components/Icons";
import GeneratedCover from "@/components/GeneratedCover";

interface Props {
  book: BookMeta;
  onClick: () => void;
  badge?: string; // e.g. "Last read 2h ago"
  /** When provided, a small × button appears in the card corner that
   *  calls this handler without navigating. Used on the "Your Library"
   *  tab to let users remove books from their local recent list. */
  onRemove?: () => void;
  /** Marks a book the reader brought themselves. Library books stay unmarked —
   *  the badge marks the exception, not the rule. */
  ownedByUser?: boolean;
}

export default function BookCard({ book, onClick, badge, onRemove, ownedByUser }: Props) {
  return (
    <div className="relative h-full">
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={`Remove ${book.title} from library`}
          aria-label={`Remove ${book.title} from library`}
          className="absolute top-0 right-0 z-10 min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 inline-flex items-center justify-center rounded-full bg-white/80 text-stone-600 border border-amber-200 text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        data-testid="book-card"
        onClick={onClick}
        aria-label={`Open ${book.title}${book.authors.length ? ` by ${book.authors.join(", ")}` : ""}${badge ? ` — ${badge}` : ""}`}
        className="text-left rounded-xl border border-amber-200 bg-white p-3 flex flex-col w-full h-full transition-all duration-200 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        style={{ boxShadow: "var(--shadow-card)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)"; }}
        onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card-hover)"; }}
        onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)"; }}
      >
        {book.cover ? (
          <img
            src={book.cover}
            alt=""
            loading="lazy"
            className="w-full h-40 object-cover rounded-lg mb-2"
          />
        ) : (
          <GeneratedCover
            title={book.title}
            authors={book.authors}
            seed={book.id}
            className="w-full h-40 mb-2"
          />
        )}
        {ownedByUser && (
          <span className="self-start mb-1 text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
            Your upload
          </span>
        )}
        <p className="font-serif font-semibold text-sm text-ink line-clamp-2 min-h-[2.5rem] flex-1" title={book.title}>
          {book.title}
        </p>
        <p className="text-xs text-amber-700 mt-1 line-clamp-1" title={book.authors.join(", ")}>
          {book.authors.join(", ")}
        </p>
        {badge && (
          <span className="mt-1.5 text-xs text-amber-700">{badge}</span>
        )}
      </button>
    </div>
  );
}
