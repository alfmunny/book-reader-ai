"use client";
import { useEffect, useState } from "react";
import { getCatalogBooks, BookMeta } from "@/lib/api";
import { getRecentBooks, RecentBook } from "@/lib/recentBooks";
import BookCard from "@/components/BookCard";
import BookDetailModal from "@/components/BookDetailModal";
import { BookCoverPlaceholderIcon, AlertCircleIcon, RetryIcon } from "@/components/Icons";
import { useRouter } from "next/navigation";

/**
 * Home — the curated catalog.
 *
 * Books are added by an admin session that audits the chapter split before
 * freezing it, so readers no longer import anything themselves (#2711). The
 * Gutenberg search and the Discover tab it lived in are gone; what remains is the
 * audited catalog, shown directly. The personal collection moved to /bookshelf.
 */
export default function Home() {
  const router = useRouter();

  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookMeta | null>(null);

  useEffect(() => {
    document.title = "Book Reader AI";
  }, []);

  useEffect(() => {
    setRecentBooks(getRecentBooks());
  }, []);

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    getCatalogBooks()
      .then(setBooks)
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [retryTick]);

  return (
    <main id="main-content" className="min-h-screen bg-parchment">

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <section aria-labelledby="home-catalog-heading" className="space-y-4">
          <div>
            <h2 id="home-catalog-heading" className="font-serif text-2xl font-semibold text-ink">
              The Library
            </h2>
            <p className="text-sm text-amber-800 mt-1">
              Classics prepared for reading — each one checked chapter by chapter before it lands here.
            </p>
          </div>

          {loading && (
            <div role="status" aria-label="Loading the library" className="flex items-center gap-2 text-amber-700 text-sm py-6">
              <span className="w-4 h-4 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin shrink-0" aria-hidden="true" />
              Loading the library…
            </div>
          )}

          {!loading && fetchError && (
            <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertCircleIcon className="w-8 h-8 text-amber-600" aria-hidden="true" />
              <p className="text-sm text-stone-600">Couldn&apos;t load the library.</p>
              <button
                onClick={() => setRetryTick((t) => t + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-4 py-2 min-h-[44px] md:min-h-0 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
              >
                <RetryIcon className="w-4 h-4" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {!loading && !fetchError && books.length === 0 && (
            <div className="text-center py-20">
              <BookCoverPlaceholderIcon className="w-12 h-16 text-amber-400 mx-auto mb-5 opacity-50" aria-hidden="true" />
              <h3 className="font-serif text-xl font-semibold text-ink mb-2">No books yet</h3>
              <p className="text-sm text-amber-700 max-w-sm mx-auto">
                Books appear here once they have been prepared and checked. Nothing has been
                published yet — check back shortly.
              </p>
            </div>
          )}

          {!loading && !fetchError && books.length > 0 && (
            <ul role="list" aria-label="The Library" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 list-none p-0 m-0">
              {books.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} onClick={() => setSelectedBook(book)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          recentBook={recentBooks.find((rb) => rb.id === selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onRead={() => {
            const id = selectedBook.id;
            setSelectedBook(null);
            router.push(`/reader/${id}`);
          }}
        />
      )}
    </main>
  );
}
