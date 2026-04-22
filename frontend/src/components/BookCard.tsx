"use client";
import { BookMeta } from "@/lib/api";
import { BookCoverPlaceholderIcon, CloseIcon } from "@/components/Icons";

interface Props {
  book: BookMeta;
  onClick: () => void;
  badge?: string; // e.g. "Last read 2h ago"
  /** When provided, a small × button appears in the card corner that
   *  calls this handler without navigating. Used on the "Your Library"
   *  tab to let users remove books from their local recent list. */
  onRemove?: () => void;
}

export default function BookCard({ book, onClick, badge, onRemove }: Props) {
  return (
    <div className="relative">
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from library"
          aria-label="Remove from library"
          className="absolute top-0 right-0 z-10 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full bg-white/80 text-stone-500 border border-amber-200 text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        data-testid="book-card"
        onClick={onClick}
        className="text-left rounded-xl border border-amber-200 bg-white p-3 flex flex-col w-full transition-all duration-200 hover:-translate-y-0.5"
        style={{ boxShadow: "var(--shadow-card)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card-hover)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)"; }}
      >
        {book.cover ? (
          <img
            src={book.cover}
            alt={book.title}
            className="w-full h-40 object-cover rounded-lg mb-2"
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg mb-2 flex flex-col items-center justify-center border border-amber-100 overflow-hidden relative">
            <BookCoverPlaceholderIcon className="w-10 h-14 text-amber-600" />
            <p className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 text-[10px] text-amber-700/60 text-center font-serif leading-tight line-clamp-2">
              {book.title}
            </p>
          </div>
        )}
        <p className="font-serif font-semibold text-sm text-ink line-clamp-2 flex-1">
          {book.title}
        </p>
        <p className="text-xs text-amber-700 mt-1 line-clamp-1">
          {book.authors.join(", ")}
        </p>
        {badge && (
          <span className="mt-1.5 text-xs text-amber-500">{badge}</span>
        )}
      </button>
    </div>
  );
}
