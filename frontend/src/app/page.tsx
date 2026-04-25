"use client";
import { useEffect, useRef, useState } from "react";
import { searchBooks, getPopularBooks, getMe, getReadingProgress, getUserStats, UserStats, BookMeta } from "@/lib/api";
import { getRecentBooks, removeRecentBook, recordRecentBook, RecentBook } from "@/lib/recentBooks";
import BookCard from "@/components/BookCard";
import UndoToast from "@/components/UndoToast";
import BookDetailModal from "@/components/BookDetailModal";
import ReadingStats from "@/components/ReadingStats";
import { FireIcon, ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, NoteIcon, InsightIcon, VocabIcon, BookCoverPlaceholderIcon, GlobeIcon, SummaryIcon, SpeakerIcon, GridViewIcon, ListViewIcon, SettingsIcon } from "@/components/Icons";
import { SearchBar } from "@/components/SearchBar";
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
  const { data: session, status } = useSession();

  const [tab, setTab] = useState<Tab>("library");
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedBook, setSelectedBook] = useState<BookMeta | null>(null);

  // ── Library / Home state ──
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [removedBookToast, setRemovedBookToast] = useState<RecentBook | null>(null);

  useEffect(() => {
    const books = getRecentBooks();
    setRecentBooks(books);
    if (books.length === 0) setTab("discover");
  }, []);

  // Unauthenticated users always see the Discover page first.
  useEffect(() => {
    if (status === "unauthenticated") setTab("discover");
  }, [status]);

  // Fetch user info and sync reading progress from backend when authenticated.
  useEffect(() => {
    if (status !== "authenticated") return;
    getMe().then((me) => {
      setIsAdmin(me.role === "admin");
    }).catch(() => {});
    getUserStats().then(setUserStats).catch(() => {});
    getReadingProgress().then((entries) => {
      const local = getRecentBooks();
      let changed = false;
      const merged = [...local];
      for (const entry of entries) {
        const backendTs = new Date(entry.last_read).getTime();
        const idx = merged.findIndex((b) => b.id === entry.book_id);
        if (idx === -1) continue;
        if (backendTs > merged[idx].lastRead || merged[idx].lastChapter !== entry.chapter_index) {
          merged[idx] = { ...merged[idx], lastChapter: entry.chapter_index, lastRead: Math.max(backendTs, merged[idx].lastRead) };
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem("recent_books", JSON.stringify(merged));
        setRecentBooks(merged);
      }
    }).catch(() => {});
  }, [status]);

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
    const fetch = getPopularBooks(popularLang, popularPage);
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

  function openBook(id: number) {
    const inLibrary = recentBooks.some((b) => b.id === id);
    if (inLibrary) {
      router.push(`/reader/${id}`);
    } else {
      router.push(`/import/${id}?next=/reader/${id}`);
    }
  }

  function handleBookClick(book: BookMeta) {
    setSelectedBook(book);
  }

  return (
    <main className="min-h-screen bg-parchment">
      {/* Header */}
      <header className="border-b border-amber-200 bg-white/60 backdrop-blur px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <h1 className="text-xl md:text-2xl font-serif font-bold text-ink">Book Reader AI</h1>
              <p className="text-xs md:text-sm text-amber-800 mt-0.5">Public domain classics with AI assistance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === "authenticated" ? <SearchBar /> : null}
            {status === "unauthenticated" ? (
              <button
                onClick={() => router.push("/login")}
                className="rounded-lg border border-amber-300 px-4 py-2.5 md:py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors min-h-[44px]"
              >
                Sign in
              </button>
            ) : (
              <button
                onClick={() => router.push("/profile")}
                title={session?.backendUser?.name ?? "Profile & Settings"}
                aria-label={session?.backendUser?.name ?? "Profile & Settings"}
                className="min-w-[44px] min-h-[44px] w-11 h-11 md:w-9 md:h-9 rounded-full overflow-hidden border border-amber-200 hover:border-amber-400 transition-colors"
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
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="border-b border-amber-200 bg-white/40 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex gap-1 items-center overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {([
            { key: "library" as Tab, label: "Home", count: recentBooks.length || undefined },
            { key: "discover" as Tab, label: "Discover" },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? "page" : undefined}
              className={`px-5 py-3 min-h-[44px] text-sm font-medium border-b-2 transition-colors ${
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
          {status === "authenticated" && (
            <button
              onClick={() => router.push("/upload")}
              className="px-5 py-3 min-h-[44px] text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-800 transition-colors"
            >
              Upload
            </button>
          )}
          {status === "authenticated" && (
            <button
              onClick={() => router.push("/notes")}
              className="px-5 py-3 min-h-[44px] text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-800 transition-colors"
            >
              Your Notes
            </button>
          )}
          {status === "authenticated" && (
            <button
              onClick={() => router.push("/vocabulary")}
              className="px-5 py-3 min-h-[44px] text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-800 transition-colors"
            >
              Your Word List
            </button>
          )}
          {/* Admin tab — only visible to admin users */}
          {isAdmin && (
            <button
              onClick={() => router.push("/admin")}
              data-testid="admin-tab"
              className="px-5 py-3 min-h-[44px] text-sm font-medium border-b-2 border-transparent text-amber-600 hover:text-amber-800 flex items-center gap-1.5"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Admin
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">

        {/* ════════════ Home Tab ════════════ */}
        {tab === "library" && (
          <div className="space-y-8">

            {/* Greeting */}
            {status === "authenticated" && session?.backendUser?.name && (
              <p className="font-serif text-xl text-ink">
                Welcome back, {session.backendUser.name.split(" ")[0]}
              </p>
            )}

            {/* Continue Reading */}
            {recentBooks.length > 0 && (
              <section>
                <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-2">
                  Continue Reading
                </p>
                <button
                  aria-label="Continue reading"
                  onClick={() => router.push(`/reader/${recentBooks[0].id}`)}
                  className="w-full text-left rounded-xl border border-amber-200 bg-white p-3 flex items-center gap-3 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 transition-all duration-200"
                  style={{ boxShadow: "var(--shadow-card)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)"; }}
                  onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card-hover)"; }}
                  onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)"; }}
                >
                  {recentBooks[0].cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={recentBooks[0].cover} alt="" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-12 h-16 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-100 flex items-center justify-center shrink-0">
                      <BookCoverPlaceholderIcon className="w-6 h-8 text-amber-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-serif font-semibold text-sm text-ink line-clamp-1">{recentBooks[0].title}</p>
                    <p className="text-xs text-amber-700 mt-0.5 line-clamp-1">{recentBooks[0].authors?.join(", ")}</p>
                    <p className="text-xs text-stone-400 mt-1">
                      Chapter {recentBooks[0].lastChapter + 1} · {timeAgo(recentBooks[0].lastRead)}
                    </p>
                  </div>
                  <ArrowRightIcon className="w-4 h-4 text-amber-400 shrink-0" />
                </button>
              </section>
            )}

            {/* Stats strip */}
            {status === "authenticated" && userStats && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 flex-1">
                    Your Progress
                  </p>
                  <button
                    onClick={() => setStatsExpanded((v) => !v)}
                    className="text-xs text-amber-600 hover:text-amber-800 transition-colors min-h-[44px] px-2 flex items-center"
                  >
                    {statsExpanded ? "Hide activity" : "Show activity"}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {userStats.streak > 0 && (
                    <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                      <FireIcon className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-lg font-bold text-amber-900 leading-none">{userStats.streak}</p>
                        <p className="text-[10px] text-stone-400 mt-0.5">day streak</p>
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                    <BookOpenIcon className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-stone-800 leading-none">{userStats.totals.books_started}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">books started</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                    <VocabIcon className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-stone-800 leading-none">{userStats.totals.vocabulary_words}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">words saved</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                    <NoteIcon className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-lg font-bold text-stone-800 leading-none">{userStats.totals.annotations}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">annotations</p>
                    </div>
                  </div>
                </div>

                {/* Collapsible full activity view */}
                {statsExpanded && (
                  <div className="mt-4">
                    <ReadingStats active heatmapOnly />
                  </div>
                )}
              </section>
            )}

            {/* Book grid */}
            {recentBooks.length > 0 ? (
              <section>
                {recentBooks.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-widest text-stone-400 mb-3">
                    Your Library
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {recentBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      book={book}
                      onClick={() => handleBookClick(book)}
                      badge={`Ch. ${book.lastChapter + 1} · ${timeAgo(book.lastRead)}`}
                      onRemove={() => {
                        if (removedBookToast) {
                          setRemovedBookToast(null);
                        }
                        removeRecentBook(book.id);
                        setRecentBooks(getRecentBooks());
                        setRemovedBookToast(book);
                      }}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-center py-20">
                <div className="inline-flex items-end justify-center gap-1.5 mb-6 opacity-30">
                  {[40, 56, 48, 60, 44].map((h, i) => (
                    <div
                      key={i}
                      className="w-6 rounded-t-sm bg-amber-700"
                      style={{ height: h }}
                    />
                  ))}
                </div>
                <h2 className="font-serif text-xl font-semibold text-ink mb-2">Your library is empty</h2>
                <p className="text-sm text-amber-700 mb-6 max-w-xs mx-auto">
                  Books you open will appear here for quick access. Explore 70,000+ free classics to get started.
                </p>
                <button
                  onClick={() => setTab("discover")}
                  className="rounded-lg bg-amber-700 px-6 py-2.5 min-h-[44px] text-white font-medium hover:bg-amber-800 transition-colors shadow-sm"
                >
                  Discover Books
                </button>
              </div>
            )}
          </div>
        )}

        {/* ════════════ Discover Tab ════════════ */}
        {tab === "discover" && (
          <div className="space-y-10">

            {/* ── Landing hero (unauthenticated visitors only) ── */}
            {status === "unauthenticated" && (
              <section className="pt-4 pb-2">
                {/* Headline */}
                <div className="text-center mb-8">
                  <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink leading-tight mb-3">
                    Read the world&rsquo;s greatest books<br className="hidden sm:block" /> in your language
                  </h2>
                  <p className="text-amber-800 text-base md:text-lg max-w-xl mx-auto mb-6">
                    70,000+ free classics from Project Gutenberg — with AI translation, vocabulary building, and reading insights.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                    <button
                      onClick={() => router.push("/login")}
                      className="rounded-lg bg-amber-700 px-7 py-3 min-h-[44px] text-white font-semibold text-base hover:bg-amber-800 transition-colors shadow-sm min-w-[160px]"
                    >
                      Sign in free
                    </button>
                    <button
                      onClick={() => document.getElementById("discover-search")?.scrollIntoView({ behavior: "smooth" })}
                      className="rounded-lg border border-amber-300 px-7 py-3 min-h-[44px] text-amber-800 font-medium text-base hover:bg-amber-50 transition-colors min-w-[160px] flex items-center justify-center gap-2"
                    >
                      Browse library <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Translation preview */}
                <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden mb-8" style={{ boxShadow: "var(--shadow-card)" }}>
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-100 bg-amber-50/60">
                    <GlobeIcon className="w-4 h-4 text-amber-600" aria-hidden="true" />
                    <span className="text-xs font-medium text-amber-800">AI Translation — Faust by Goethe (German → English)</span>
                  </div>
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-amber-100">
                    <div className="px-5 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-2">Original · Deutsch</p>
                      <p className="font-serif text-sm leading-relaxed text-ink/80">
                        Habe nun, ach! Philosophie,<br />
                        Juristerei und Medizin,<br />
                        Und leider auch Theologie<br />
                        Durchaus studiert, mit heißem Bemühn.<br />
                        Da steh ich nun, ich armer Tor!<br />
                        Und bin so klug als wie zuvor.
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-2">Translation · English</p>
                      <p className="font-serif text-sm leading-relaxed text-ink">
                        I have, alas! Philosophy,<br />
                        Medicine, Jurisprudence too,<br />
                        And to my cost Theology,<br />
                        With ardent labour studied through.<br />
                        And here I stand, with all my lore,<br />
                        Poor fool, no wiser than before.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Feature cards */}
                <div className="grid sm:grid-cols-3 gap-4 mb-6">
                  {[
                    {
                      icon: <GlobeIcon className="w-5 h-5 text-amber-600" aria-hidden="true" />,
                      title: "AI Translation",
                      body: "Read any classic in your native language. Switch languages mid-chapter without losing your place.",
                    },
                    {
                      icon: <VocabIcon className="w-5 h-5 text-amber-600" aria-hidden="true" />,
                      title: "Vocabulary Builder",
                      body: "Tap any word to save it. Build a personal reading vocabulary as you go, book by book.",
                    },
                    {
                      icon: <InsightIcon className="w-5 h-5 text-amber-600" aria-hidden="true" />,
                      title: "AI Reading Insights",
                      body: "Ask questions about what you just read and get instant answers grounded in the text.",
                    },
                  ].map(({ icon, title, body }) => (
                    <div key={title} className="rounded-xl border border-amber-200 bg-white p-4" style={{ boxShadow: "var(--shadow-card)" }}>
                      <div className="flex items-center gap-2 mb-2">
                        {icon}
                        <h3 className="font-semibold text-sm text-ink">{title}</h3>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">{body}</p>
                    </div>
                  ))}
                </div>

                {/* Secondary features row */}
                <div className="flex flex-wrap justify-center gap-4 text-xs text-amber-700 mb-2">
                  {[
                    { icon: <SummaryIcon className="w-3.5 h-3.5" aria-hidden="true" />, label: "Chapter Summaries" },
                    { icon: <SpeakerIcon className="w-3.5 h-3.5" aria-hidden="true" />, label: "Text-to-Speech" },
                    { icon: <NoteIcon className="w-3.5 h-3.5" aria-hidden="true" />, label: "Annotations" },
                    { icon: <BookOpenIcon className="w-3.5 h-3.5" aria-hidden="true" />, label: "Reading Stats" },
                  ].map(({ icon, label }) => (
                    <span key={label} className="flex items-center gap-1.5">
                      {icon}
                      {label}
                    </span>
                  ))}
                </div>

                <div className="border-t border-amber-100 mt-8" />
              </section>
            )}

            {/* Search section */}
            <section id="discover-search">
              <h2 className="font-serif font-semibold text-ink text-lg mb-1">Search</h2>
              <p className="text-sm text-amber-700 mb-3">
                70,000+ free public domain classics from Project Gutenberg
              </p>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  aria-label="Search by title or author"
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2.5 font-serif text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 text-base"
                  placeholder="Search by title or author..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <div className="flex gap-2">
                  <select
                    aria-label="Filter by language"
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-ink flex-1 sm:flex-none"
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
                    className="rounded-lg bg-amber-700 px-5 py-2.5 min-h-[44px] text-white font-medium hover:bg-amber-800 disabled:opacity-50 flex items-center justify-center gap-2 flex-1 sm:flex-none"
                    onClick={() => handleSearch()}
                    disabled={searching}
                  >
                    {searching && (
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    )}
                    {searching ? "Searching" : "Search"}
                  </button>
                </div>
              </div>

              {/* Quick search pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {FEATURED.map((f) => (
                  <button
                    key={f.query}
                    className="text-xs rounded-full border border-amber-300 px-3 py-1 min-h-[44px] text-amber-800 hover:bg-amber-100 transition-colors"
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
                <div role="status" aria-label="Loading search results">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-amber-200 bg-white p-3 animate-pulse">
                        <div className="w-full h-40 bg-amber-100 rounded-lg mb-2" />
                        <div className="h-3 bg-amber-100 rounded w-3/4 mb-1.5" />
                        <div className="h-3 bg-amber-100 rounded w-1/2" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {searchResults.map((book) => (
                    <BookCard key={book.id} book={book} onClick={() => handleBookClick(book)} />
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
                        className={`text-xs rounded-full px-3 py-1 min-h-[44px] border transition-colors ${
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
                    aria-label="Grid view"
                    className={`p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded transition-colors ${popularView === "grid" ? "bg-amber-100 text-amber-800" : "text-amber-500 hover:text-amber-700"}`}
                  >
                    <GridViewIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPopularView("list")}
                    title="List view"
                    aria-label="List view"
                    className={`p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded transition-colors ${popularView === "list" ? "bg-amber-100 text-amber-800" : "text-amber-500 hover:text-amber-700"}`}
                  >
                    <ListViewIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {popularLoading && (
                <div role="status" aria-label="Loading popular books">
                  {popularView === "grid" ? (
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
                  )}
                </div>
              )}

              {!popularLoading && popularBooks.length > 0 && (
                <>
                  {popularView === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {popularBooks.map((book) => (
                        <BookCard key={book.id} book={book} onClick={() => handleBookClick(book)} />
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-amber-100 border border-amber-200 rounded-xl overflow-hidden bg-white">
                      {popularBooks.map((book, idx) => (
                        <button
                          key={book.id}
                          onClick={() => handleBookClick(book)}
                          className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-amber-50 transition-colors"
                        >
                          <span className="text-xs text-amber-400 w-7 text-right shrink-0 tabular-nums">
                            {(popularPage - 1) * PER_PAGE + idx + 1}
                          </span>
                          {book.cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={book.cover} alt="" className="w-9 h-14 object-cover rounded shrink-0" />
                          ) : (
                            <div className="w-9 h-14 bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-100 rounded shrink-0 flex items-center justify-center">
                              <BookCoverPlaceholderIcon className="w-5 h-7 text-amber-500" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-serif text-sm font-semibold text-ink truncate">{book.title}</p>
                            <p className="text-xs text-amber-700 truncate">{book.authors.join(", ")}</p>
                          </div>
                          {book.download_count > 0 ? (
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
                        className="px-4 py-2.5 md:py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] md:min-h-0"
                      >
                        <ArrowLeftIcon className="w-4 h-4 inline" aria-hidden="true" /> Prev
                      </button>
                      <span className="text-sm text-amber-700">
                        Page {popularPage} of {Math.ceil(popularTotal / PER_PAGE)}
                      </span>
                      <button
                        onClick={() => setPopularPage((p) => p + 1)}
                        disabled={popularPage >= Math.ceil(popularTotal / PER_PAGE)}
                        className="px-4 py-2.5 md:py-1.5 text-sm rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px] md:min-h-0"
                      >
                        Next <ArrowRightIcon className="w-4 h-4 inline" aria-hidden="true" />
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

      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          recentBook={recentBooks.find((rb) => rb.id === selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onRead={() => {
            setSelectedBook(null);
            openBook(selectedBook.id);
          }}
        />
      )}

      {removedBookToast && (
        <UndoToast
          message={`"${removedBookToast.title}" removed from library`}
          onUndo={() => {
            recordRecentBook(removedBookToast, removedBookToast.lastChapter);
            setRecentBooks(getRecentBooks());
            setRemovedBookToast(null);
          }}
          onDone={() => setRemovedBookToast(null)}
        />
      )}
    </main>
  );
}
