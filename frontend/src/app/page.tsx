"use client";
import { useEffect, useState } from "react";
import { searchBooks, getCachedBooks, BookMeta } from "@/lib/api";
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

  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [cachedBooks, setCachedBooks] = useState<BookMeta[]>([]);
  const [cachedLoading, setCachedLoading] = useState(true);

  // Load recent books from localStorage and cached books from backend on mount
  useEffect(() => {
    setRecentBooks(getRecentBooks());
    getCachedBooks()
      .then(setCachedBooks)
      .catch(() => {})
      .finally(() => setCachedLoading(false));
  }, []);

  async function handleSearch(q = query, l = lang) {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try {
      const data = await searchBooks(q, l);
      setSearchResults(data.books);
    } catch (e: any) {
      setSearchError(e.message);
    } finally {
      setSearching(false);
    }
  }

  function openBook(id: number) {
    router.push(`/reader/${id}`);
  }

  const showLibrary = cachedBooks.length > 0;
  const showRecent = recentBooks.length > 0;
  const showEmpty = !showRecent && !showLibrary && !cachedLoading && searchResults.length === 0;

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
            onClick={() => router.push("/settings")}
            title="Settings"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 hover:text-amber-900 transition-colors text-lg"
          >
            ⚙
          </button>
          <button
            onClick={() => router.push("/profile")}
            title={session?.backendUser?.name ?? "Profile"}
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

        {/* ── Recently Read ─────────────────────────────────────────── */}
        {showRecent && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-lg mb-3">Continue Reading</h2>
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

        {/* ── Cached Library ────────────────────────────────────────── */}
        {showLibrary && (
          <section>
            <h2 className="font-serif font-semibold text-ink text-lg mb-3">
              Your Library
              <span className="ml-2 text-sm font-normal text-amber-600">
                ({cachedBooks.length} book{cachedBooks.length !== 1 ? "s" : ""} saved locally)
              </span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {cachedBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onClick={() => openBook(book.id)}
                />
              ))}
            </div>
          </section>
        )}

        {cachedLoading && !showRecent && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                <div className="h-3 bg-amber-100 rounded w-3/4 mb-1" />
                <div className="h-3 bg-amber-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {/* ── Search ────────────────────────────────────────────────── */}
        <section>
          {(showRecent || showLibrary) && (
            <h2 className="font-serif font-semibold text-ink text-lg mb-3">Discover Books</h2>
          )}

          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2 font-serif text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Search Project Gutenberg (e.g. Faust, Hamlet, Moby Dick)..."
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
              className="rounded-lg bg-amber-700 px-5 py-2 text-white font-medium hover:bg-amber-800 disabled:opacity-50"
              onClick={() => handleSearch()}
              disabled={searching}
            >
              {searching ? "…" : "Search"}
            </button>
          </div>

          {/* Quick search pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {FEATURED.map((f) => (
              <button
                key={f.query}
                className="text-xs rounded-full border border-amber-300 px-3 py-1 text-amber-800 hover:bg-amber-100"
                onClick={() => { setQuery(f.query); setLang(f.lang); handleSearch(f.query, f.lang); }}
              >
                {f.query}
              </button>
            ))}
          </div>

          {searchError && <p className="text-red-600 mb-4 text-sm">{searchError}</p>}

          {searchResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {searchResults.map((book) => (
                <BookCard key={book.id} book={book} onClick={() => openBook(book.id)} />
              ))}
            </div>
          )}
        </section>

        {showEmpty && (
          <p className="text-center py-16 text-amber-700 font-serif text-lg">
            Search for a classic to begin reading
          </p>
        )}
      </div>
    </main>
  );
}
