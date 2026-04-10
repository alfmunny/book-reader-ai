"use client";
import { BookMeta } from "@/lib/api";

interface Props {
  book: BookMeta;
  onClick: () => void;
  badge?: string; // e.g. "Last read 2h ago"
}

export default function BookCard({ book, onClick, badge }: Props) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-amber-200 bg-white shadow-sm hover:shadow-md transition-shadow p-3 flex flex-col w-full"
    >
      {book.cover ? (
        <img
          src={book.cover}
          alt={book.title}
          className="w-full h-40 object-cover rounded-lg mb-2"
        />
      ) : (
        <div className="w-full h-40 bg-amber-50 rounded-lg mb-2 flex items-center justify-center text-4xl border border-amber-100">
          📖
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
  );
}
