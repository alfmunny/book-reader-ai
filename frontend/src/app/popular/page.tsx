"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPopularBooks, BookMeta } from "@/lib/api";
import BookCard from "@/components/BookCard";

const LANGUAGES = [
  { code: "", label: "All languages" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
];

export default function PopularBooksPage() {
  const router = useRouter();
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState("");

  useEffect(() => {
    setLoading(true);
    getPopularBooks(lang)
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, [lang]);

  return (
    <main className="min-h-screen bg-parchment">
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push("/")}
          className="text-amber-700 hover:text-amber-900 text-sm"
        >
          ← Library
        </button>
        <h1 className="font-serif font-bold text-ink text-xl">Popular Classics</h1>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-sm text-amber-700 mb-4">
          The 100 most-downloaded public domain books from Project Gutenberg, curated across English, German, and French.
        </p>

        {/* Language filter */}
        <div className="flex gap-2 mb-6">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`text-sm rounded-full px-4 py-1.5 border transition-colors ${
                lang === l.code
                  ? "bg-amber-700 text-white border-amber-700"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                <div className="h-3 bg-amber-100 rounded w-3/4 mb-1.5" />
                <div className="h-3 bg-amber-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* Book grid */}
        {!loading && books.length > 0 && (
          <>
            <p className="text-xs text-amber-600 mb-3">
              {books.length} book{books.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onClick={() => router.push(`/reader/${book.id}`)}
                />
              ))}
            </div>
          </>
        )}

        {!loading && books.length === 0 && (
          <p className="text-center py-16 text-amber-700 font-serif text-lg">
            No popular books available yet. Run the seed script first.
          </p>
        )}
      </div>
    </main>
  );
}
