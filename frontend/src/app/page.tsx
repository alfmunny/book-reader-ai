"use client";
import { useEffect, useRef, useState } from "react";
import { searchBooks, getPopularBooks, getClassics, getMe, BookMeta } from "@/lib/api";
import { getRecentBooks, removeRecentBook, RecentBook } from "@/lib/recentBooks";
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

const POPULAR_LANGS = [
  { code: "", label: "All" },
  { code: "en", label: "English" },
  { code: "ru", label: "Russian" },
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [userPlan, setUserPlan] = useState("free");
  const [freeIds, setFreeIds] = useState<Set<number>>(new Set());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // ── Library state ──
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);

  useEffect(() => {
    const books = getRecentBooks();
    setRecentBooks(books);
    if (books.length === 0) setTab("discover");
  }, []);

  // Fetch user info (admin status, plan) and free classics IDs on mount.
  useEffect(() => {
    getMe().then((me) => {
      setIsAdmin(me.role === "admin");
      setUserPlan(me.plan ?? "free");
    }).catch(() => {});
    getClassics().then((classics) => {
      setFreeIds(new Set(classics.map((b) => b.id)));
    }).catch(() => {});
  }, []);

  // ── Discover state ──
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("");
  const [searchResults, setSearchResults] = useState<BookMeta[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");

  const [popularBooks, setPopularBooks] = useState<BookMeta[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularLang, setPopularLang] = useState("");
  const [popularPage, setPopularPage] = useState(1);
  const [popularTotal, setPopularTotal] = useState(0);
  const [popularView, setPopularView] = useState<"grid" | "list">("grid");

  const PER_PAGE = 50;

  const searchGenRef = useRef(0);

  useEffect(() => {
    if (tab !== "discover") return;
    setPopularLoading(true);
    const fetch =
      popularLang === "ru"
        ? getClassics().then((books) => {
            const ru = books.filter((b) => b.original_language === "ru");
            return { books: ru, total: ru.length, page: 1, per_page: 50 };
          })
        : getPopularBooks(popularLang, popularPage);
    fetch
      .then((data) => {
        setPopularBooks(data.books);
        setPopularTotal(data.total);
      })
      .catch(() => { setPopularBooks([]); setPopularTotal(0); })
      .finally(() => setPopularLoading(false));
  }, [tab, popularLang, popularPage]);

  function handlePopularLangChange(lang: string) {
    setPopularLang(lang);
    setPopularPage(1);
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

  function isLocked(id: number) {
    return freeIds.size > 0 && !freeIds.has(id) && userPlan !== "paid";
  }

  function openBook(id: number) {
    if (isLocked(id)) {
      setShowUpgradeModal(true);
      return;
    }
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
        <div className="max-w-5xl mx-auto px-6 flex gap-1 items-center">
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
          {/* Admin tab — only visible to admin users */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              data-testid="admin-tab"
              className="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-800 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Admin
            </button>
          )}
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
                    onRemove={() => {
                      if (!confirm(`Remove "${book.title}" from your library?`)) return;
                      removeRecentBook(book.id);
                      setRecentBooks(getRecentBooks());
                    }}
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
                  <option value="ja">Japanese</option>
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
              <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-serif font-semibold text-ink text-lg">Popular Classics</h2>
                  <div className="flex gap-1.5">
                    {POPULAR_LANGS.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => handlePopularLangChange(l.code)}
                        className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                          popularLang === l.code
                            ? "bg-amber-700 text-white border-amber-700"
                            : "border-amber-300 text-amber-700 hover:bg-amber-50"
                        }`}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 border border-amber-200 rounded-lg p-0.5 bg-white">
                  <button
                    onClick={() => setPopularView("grid")}
                    title="Grid view"
                    className={`p-1.5 rounded transition-colors ${popularView === "grid" ? "bg-amber-100 text-amber-800" : "text-amber-500 hover:text-amber-700"}`}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                      <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                      <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setPopularView("list")}
                    title="List view"
                    className={`p-1.5 rounded transition-colors ${popularView === "list" ? "bg-amber-100 text-amber-800" : "text-amber-500 hover:text-amber-700"}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 16 16">
                      <line x1="3" y1="4" x2="13" y2="4"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="12" x2="13" y2="12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {popularLoading && (
                popularView === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                        <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                        <div className="h-3 bg-amber-100 rounded w-3/4 mb-1.5" />
                        <div className="h-3 bg-amber-100 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-amber-100 border border-amber-200 rounded-xl overflow-hidden bg-white">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                        <div className="w-8 h-3 bg-amber-100 rounded shrink-0" />
                        <div className="w-8 h-12 bg-amber-100 rounded shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-amber-100 rounded w-2/3" />
                          <div className="h-3 bg-amber-100 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {!popularLoading && popularBooks.length > 0 && (
                <>
                  {popularView === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {popularBooks.map((book) => (
                        <div key={book.id} className="relative">
                          <BookCard book={book} onClick={() => openBook(book.id)} />
                          {isLocked(book.id) && (
                            <div className="absolute top-2 right-2 pointer-events-none">
                              <div className="bg-black/60 rounded-full p-1">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-amber-100 border border-amber-200 rounded-xl overflow-hidden bg-white">
                      {popularBooks.map((book, idx) => (
                        <button
                          key={book.id}
                          onClick={() => openBook(book.id)}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors"
                        >
                          <span className="text-xs text-amber-400 w-7 text-right shrink-0 tabular-nums">
                            {(popularPage - 1) * PER_PAGE + idx + 1}
                          </span>
                          {book.cover ? (
                            <img src={book.cover} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
                          ) : (
                            <div className="w-8 h-12 bg-amber-50 border border-amber-100 rounded shrink-0 flex items-center justify-center text-base">📖</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-serif text-sm font-semibold text-ink truncate">{book.title}</p>
                            <p className="text-xs text-amber-700 truncate">{book.authors.join(", ")}</p>
                          </div>
                          {isLocked(book.id) ? (
                            <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          ) : book.download_count > 0 ? (
                            <span className="text-xs text-amber-400 shrink-0 tabular-nums">
                              {book.download_count.toLocaleString()}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {popularTotal > PER_PAGE && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                      <button
                        onClick={() => setPopularPage((p) => p - 1)}
                        disabled={popularPage === 1}
                        className="px-4 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Prev
                      </button>
                      <span className="text-sm text-amber-700">
                        Page {popularPage} of {Math.ceil(popularTotal / PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setPopularPage((p) => p + 1)}
                        disabled={popularPage >= Math.ceil(popularTotal / PER_PAGE)}
                        className="px-4 py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next →
                      </button>
                    </div>
                  )}
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

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="font-serif text-xl font-bold text-ink mb-2">Premium Book</h2>
            <p className="text-sm text-amber-800 mb-1">
              100 free classics are available to all readers.
            </p>
            <p className="text-sm text-amber-700 mb-6">
              Unlock lifetime access to all 70,000+ Project Gutenberg books with a one-time upgrade.
            </p>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full rounded-xl bg-amber-700 text-white py-2.5 font-medium hover:bg-amber-800 mb-3"
            >
              Upgrade — coming soon
            </button>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full text-sm text-amber-600 hover:text-amber-800 py-1"
            >
              Browse free classics instead
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
