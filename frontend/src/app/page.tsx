"use client";
import { useEffect, useRef, useState } from "react";
import { searchBooks, getPopularBooks, BookMeta } from "@/lib/api";
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

const LANGUAGES = [
  { code: "", label: "All" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
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

type Tab = "library" | "discover";

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();

  const [tab, setTab] = useState<Tab>("library");

  // ── Library state ──
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);

  useEffect(() => {
    const books = getRecentBooks();
    setRecentBooks(books);
    if (books.length === 0) setTab("discover");
  }, []);

  // ── Discover state ──
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("");
  const [searchResults, setSearchResults] = useState<BookMeta[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");

  const [popularBooks, setPopularBooks] = useState<BookMeta[]>([]);
  const [popularLang, setPopularLang] = useState("");
  const [popularLoading, setPopularLoading] = useState(false);
  const popularLoaded = useRef(false);

  const searchGenRef = useRef(0);

  // Load popular books when discover tab is first shown
  useEffect(() => {
    if (tab === "discover" && !popularLoaded.current) {
      popularLoaded.current = true;
      setPopularLoading(true);
      getPopularBooks(popularLang)
        .then(setPopularBooks)
        .catch(() => setPopularBooks([]))
        .finally(() => setPopularLoading(false));
    }
  }, [tab, popularLang]);

  function handlePopularLangChange(newLang: string) {
    setPopularLang(newLang);
    setPopularLoading(true);
    getPopularBooks(newLang)
      .then(setPopularBooks)
      .catch(() => setPopularBooks([]))
      .finally(() => setPopularLoading(false));
  }

  async function handleSearch(q = query, l = lang) {
    if (!q.trim()) return;
    const myGen = ++searchGenRef.current;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setSearchedQuery(q.trim());
    try {
      const data = await searchBooks(q, l);
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
    // Books already in the user's library skip the import page — they've
    // been opened before, so the translations/TTS are likely already cached
    // or intentionally skipped. First-time opens go through /import to let
    // the user pre-generate translations (and optionally audio).
    const inLibrary = recentBooks.some((b) => b.id === id);
    if (inLibrary) {
      router.push(`/reader/${id}`);
    } else {
      router.push(`/import/${id}?next=/reader/${id}`);
    }
  }

  return (
    <main className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-serif font-bold text-ink">Book Reader AI</h1>
            <p className="text-sm text-amber-800 mt-0.5">Public domain classics with AI assistance</p>
          </div>
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

      {/* Tab bar */}
      <nav className="border-b border-amber-200 bg-white/40 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 flex gap-1">
          {([
            { key: "library" as Tab, label: "Your Library", count: recentBooks.length || undefined },
            { key: "discover" as Tab, label: "Discover" },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-amber-700 text-amber-900"
                  : "border-transparent text-amber-600 hover:text-amber-800"
              }`}
            >
              {label}
              {count !== undefined && (
                <span className="ml-1.5 text-xs opacity-60">({count})</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* ════════════ Library Tab ════════════ */}
        {tab === "library" && (
          <>
            {recentBooks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {recentBooks.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    onClick={() => openBook(book.id)}
                    badge={`Ch. ${book.lastChapter + 1} · ${timeAgo(book.lastRead)}`}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="font-serif text-lg text-ink mb-2">Your library is empty</p>
                <p className="text-sm text-amber-700 mb-4">Books you open will appear here for quick access.</p>
                <button
                  onClick={() => setTab("discover")}
                  className="rounded-lg bg-amber-700 px-5 py-2.5 text-white font-medium hover:bg-amber-800"
                >
                  Discover Books
                </button>
              </div>
            )}
          </>
        )}

        {/* ════════════ Discover Tab ════════════ */}
        {tab === "discover" && (
          <div className="space-y-10">
            {/* Search section */}
            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-1">Search</h2>
              <p className="text-sm text-amber-700 mb-3">
                70,000+ free public domain classics from Project Gutenberg
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

              {searchError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
                  {searchError}
                </div>
              )}

              {searching && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                      <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                      <div className="h-3 bg-amber-100 rounded w-3/4 mb-1.5" />
                      <div className="h-3 bg-amber-100 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {searchResults.map((book) => (
                    <BookCard key={book.id} book={book} onClick={() => openBook(book.id)} />
                  ))}
                </div>
              )}

              {!searching && searchedQuery && searchResults.length === 0 && !searchError && (
                <div className="text-center py-10 text-amber-700">
                  <p className="text-lg font-serif mb-1">No books found for &ldquo;{searchedQuery}&rdquo;</p>
                  <p className="text-sm text-amber-600">Try a different title, author, or language filter.</p>
                </div>
              )}
            </section>

            {/* Popular Classics section */}
            <section>
              <h2 className="font-serif font-semibold text-ink text-lg mb-3">Popular Classics</h2>

              <div className="flex gap-2 mb-4">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handlePopularLangChange(l.code)}
                    className={`text-sm rounded-full px-4 py-1.5 border transition-colors ${
                      popularLang === l.code
                        ? "bg-amber-700 text-white border-amber-700"
                        : "border-amber-300 text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {popularLoading && (
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

              {!popularLoading && popularBooks.length > 0 && (
                <>
                  <p className="text-xs text-amber-600 mb-3">
                    {popularBooks.length} book{popularBooks.length !== 1 ? "s" : ""}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {popularBooks.map((book) => (
                      <BookCard key={book.id} book={book} onClick={() => openBook(book.id)} />
                    ))}
                  </div>
                </>
              )}

              {!popularLoading && popularBooks.length === 0 && (
                <p className="text-center py-10 text-amber-700 text-sm">
                  No popular books available yet.
                </p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
