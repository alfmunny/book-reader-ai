"use client";
import { useEffect, useRef, useState } from "react";
import { searchBooks, BookMeta } from "@/lib/api";
import { getRecentBooks, RecentBook } from "@/lib/recentBooks";
import BookCard from "@/components/BookCard";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const FEATURED = [
  { query: "Faust", lang: "de" },
  { query: "Hamlet", lang: "en" },
  { query: "Don Quixote", lang: "en" },
  { query: "Moby Dick", lang: "en" },
  { query: "Crime and Punishment", lang: "en" },
  { query: "Pride and Prejudice", lang: "en" },
];

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();

  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("");
  const [searchResults, setSearchResults] = useState<BookMeta[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState(""); // tracks what was searched (for "no results" message)

  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);

  // Race-condition guard: drop responses from stale searches
  const searchGenRef = useRef(0);

  // Load recent books from localStorage on mount. These are books the user
  // has actually opened — NOT the full server cache (which includes 100+
  // seeded books the user has never touched).
  useEffect(() => {
    setRecentBooks(getRecentBooks());
  }, []);

  async function handleSearch(q = query, l = lang) {
    if (!q.trim()) return;
    const myGen = ++searchGenRef.current;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setSearchedQuery(q.trim());
    try {
      const data = await searchBooks(q, l);
      // Drop the result if a newer search was triggered while we were waiting
      if (myGen !== searchGenRef.current) return;
      setSearchResults(data.books);
    } catch (e: any) {
      if (myGen !== searchGenRef.current) return;
      setSearchError(e.message);
    } finally {
      if (myGen === searchGenRef.current) setSearching(false);
    }
  }

  function openBook(id: number) {
    router.push(`/reader/${id}`);
  }

  const showLibrary = recentBooks.length > 0;
  const showEmpty = !showLibrary && searchResults.length === 0;

  return (
    <main className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-ink">Book Reader AI</h1>
          <p className="text-sm text-amber-800 mt-0.5">Public domain classics with AI assistance</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/profile")}
            title={session?.backendUser?.name ?? "Profile & Settings"}
            className="w-9 h-9 rounded-full overflow-hidden border border-amber-200 hover:border-amber-400 transition-colors"
          >
            {session?.backendUser?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.backendUser.picture} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center bg-amber-100 text-amber-700 text-sm font-bold">
                {session?.backendUser?.name?.[0] ?? "?"}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-10">

        {/* ── Your Library (books the user has actually opened) ── */}
        {showLibrary && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-lg mb-3">
              Your Library
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {recentBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onClick={() => openBook(book.id)}
                  badge={`Ch. ${book.lastChapter + 1} · ${timeAgo(book.lastRead)}`}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Discover Books (Search) ────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-serif font-semibold text-ink text-lg">Discover Books</h2>
            <button
              onClick={() => router.push("/popular")}
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Browse 100 Popular Classics →
            </button>
          </div>
          <p className="text-sm text-amber-700 mb-3">
            Search 70,000+ free public domain classics from Project Gutenberg
          </p>

          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2.5 font-serif text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-base"
              placeholder="Search by title or author..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <select
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-ink"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="">Any language</option>
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="fr">French</option>
              <option value="it">Italian</option>
              <option value="es">Spanish</option>
            </select>
            <button
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-white font-medium hover:bg-amber-800 disabled:opacity-50 flex items-center gap-2"
              onClick={() => handleSearch()}
              disabled={searching}
            >
              {searching && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {searching ? "Searching" : "Search"}
            </button>
          </div>

          {/* Quick search pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {FEATURED.map((f) => (
              <button
                key={f.query}
                className="text-xs rounded-full border border-amber-300 px-3 py-1 text-amber-800 hover:bg-amber-100 transition-colors"
                onClick={() => { setQuery(f.query); setLang(f.lang); handleSearch(f.query, f.lang); }}
                disabled={searching}
              >
                {f.query}
              </button>
            ))}
          </div>

          {/* Error message */}
          {searchError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
              {searchError}
            </div>
          )}

          {/* Loading skeletons — visible while search is in flight */}
          {searching && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                  <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                  <div className="h-3 bg-amber-100 rounded w-3/4 mb-1.5" />
                  <div className="h-3 bg-amber-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Search results */}
          {!searching && searchResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {searchResults.map((book) => (
                <BookCard key={book.id} book={book} onClick={() => openBook(book.id)} />
              ))}
            </div>
          )}

          {/* No results message — only after a completed search with 0 results */}
          {!searching && searchedQuery && searchResults.length === 0 && !searchError && (
            <div className="text-center py-10 text-amber-700">
              <p className="text-lg font-serif mb-1">No books found for &ldquo;{searchedQuery}&rdquo;</p>
              <p className="text-sm text-amber-600">Try a different title, author, or language filter.</p>
            </div>
          )}
        </section>

        {showEmpty && !searchedQuery && (
          <p className="text-center py-10 text-amber-700 font-serif text-lg">
            Search for a classic to begin reading
          </p>
        )}
      </div>
    </main>
  );
}
