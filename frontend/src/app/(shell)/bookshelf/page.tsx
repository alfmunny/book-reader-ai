"use client";
import { useEffect, useState } from "react";
import { getMe, getReadingProgress, getUserStats, getDraftAudits, getMyUploads, UserStats, BookMeta, DraftAudit } from "@/lib/api";
import { getRecentBooks, removeRecentBook, recordRecentBook, RecentBook } from "@/lib/recentBooks";
import BookCard from "@/components/BookCard";
import UndoToast from "@/components/UndoToast";
import BookDetailModal from "@/components/BookDetailModal";
import ReadingStats from "@/components/ReadingStats";
import GeneratedCover from "@/components/GeneratedCover";
import { FireIcon, ArrowRightIcon, BookOpenIcon, NoteIcon, VocabIcon, BookCoverPlaceholderIcon } from "@/components/Icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Your Bookshelf — the reader's own collection, reading progress and stats.
 *
 * Split out of the homepage tab strip (#2711): the home page now shows the
 * curated catalog, so the personal collection needs a route of its own.
 */
export default function Bookshelf() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [userStatsFetchError, setUserStatsFetchError] = useState(false);
  const [userStatsRetryTick, setUserStatsRetryTick] = useState(0);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [removedBookToast, setRemovedBookToast] = useState<RecentBook | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookMeta | null>(null);
  const [drafts, setDrafts] = useState<DraftAudit[]>([]);
  // Which shelf books the reader brought themselves. localStorage cannot say —
  // entries saved before `source` was recorded carry no marker at all.
  const [uploadIds, setUploadIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    document.title = "Your Bookshelf — Book Reader AI";
  }, []);

  useEffect(() => {
    setRecentBooks(getRecentBooks());
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    getMe().catch(() => {});
    getDraftAudits().then(setDrafts).catch(() => {});
    getMyUploads().then((b) => setUploadIds(new Set(b.map((x) => x.id)))).catch(() => {});
    setUserStatsFetchError(false);
    getUserStats().then(setUserStats).catch(() => setUserStatsFetchError(true));
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
  }, [status, userStatsRetryTick]);

  return (
    <main id="main-content" className="min-h-screen bg-parchment">

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-8">
          {status === "authenticated" && session?.backendUser?.name && (
            <p className="font-serif text-xl text-ink">
              Welcome back, {session.backendUser.name.split(" ")[0]}
            </p>
          )}

          {/* An unfinished audit cannot live in the tab, so the shelf carries it
              until the reader says it is done. Without this the persisted draft
              exists but there is no way back to it. */}
          {drafts.length > 0 && (
            <section aria-labelledby="bookshelf-drafts-heading">
              <h2 id="bookshelf-drafts-heading" className="text-xs font-semibold uppercase tracking-widest text-stone-600 mb-2">
                In progress
              </h2>
              <ul role="list" aria-label="Books you are still reviewing" className="list-none p-0 m-0 space-y-2">
                {drafts.map((d) => {
                  const ready = d.chapter_count > 0 && d.reviewed_count === d.chapter_count;
                  return (
                    <li
                      key={d.book_id}
                      className="flex items-center gap-3 rounded-xl border border-amber-200 bg-white p-3"
                      style={{ boxShadow: "var(--shadow-card)" }}
                    >
                      <GeneratedCover title={d.title} authors={d.authors} seed={d.book_id} className="w-11 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-serif font-semibold text-sm text-ink line-clamp-1" title={d.title}>{d.title}</p>
                        <p className="text-xs text-stone-600 mt-0.5 tabular-nums">
                          {ready
                            ? `All ${d.chapter_count} chapters reviewed — ready`
                            : `${d.reviewed_count} of ${d.chapter_count} chapters reviewed`}
                        </p>
                        <span
                          role="progressbar"
                          aria-label={`${d.title} review progress`}
                          aria-valuenow={d.reviewed_count}
                          aria-valuemin={0}
                          aria-valuemax={d.chapter_count}
                          className="mt-1.5 block h-1 w-full max-w-[240px] rounded-full bg-amber-100 overflow-hidden"
                        >
                          <span
                            className={`block h-full ${ready ? "bg-emerald-600" : "bg-amber-700"}`}
                            style={{ width: `${d.chapter_count ? (d.reviewed_count / d.chapter_count) * 100 : 0}%` }}
                          />
                        </span>
                      </div>
                      <Link
                        href={`/upload/${d.book_id}/chapters`}
                        className="text-xs font-medium px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors inline-flex items-center shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                      >
                        {ready ? "Add to shelf" : "Continue audit"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Continue Reading */}
          {recentBooks.length > 0 && (
            <section aria-labelledby="bookshelf-continue-reading-heading">
              <h2 id="bookshelf-continue-reading-heading" className="text-xs font-semibold uppercase tracking-widest text-stone-600 mb-2">
                Continue Reading
              </h2>
              <Link
                href={`/reader/${recentBooks[0].id}`}
                aria-label={`Continue reading ${recentBooks[0].title}`}
                className="w-full text-left rounded-xl border border-amber-200 bg-white p-3 flex items-center gap-3 hover:-translate-y-0.5 focus-visible:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 transition-all duration-200"
                style={{ boxShadow: "var(--shadow-card)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card)"; }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card-hover)"; }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-card)"; }}
              >
                {recentBooks[0].cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={recentBooks[0].cover} alt="" loading="lazy" className="w-12 h-16 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-12 h-16 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-100 flex items-center justify-center shrink-0">
                    <BookCoverPlaceholderIcon className="w-6 h-8 text-amber-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-serif font-semibold text-sm text-ink line-clamp-1" title={recentBooks[0].title}>{recentBooks[0].title}</p>
                  <p className="text-xs text-amber-700 mt-0.5 line-clamp-1" title={recentBooks[0].authors?.join(", ")}>{recentBooks[0].authors?.join(", ")}</p>
                  <p className="text-xs text-stone-600 mt-1">
                    Chapter {recentBooks[0].lastChapter + 1} · {timeAgo(recentBooks[0].lastRead)}
                  </p>
                </div>
                <ArrowRightIcon className="w-4 h-4 text-amber-700 shrink-0" />
              </Link>
            </section>
          )}

          {/* Stats strip */}
          {status === "authenticated" && (userStats || userStatsFetchError) && (
            <section aria-labelledby="bookshelf-progress-heading">
              <div className="flex items-center gap-2 mb-3">
                <h2 id="bookshelf-progress-heading" className="text-xs font-semibold uppercase tracking-widest text-stone-600 flex-1">
                  Your Progress
                </h2>
                <button
                  onClick={() => setStatsExpanded((v) => !v)}
                  aria-expanded={statsExpanded}
                  aria-controls="stats-activity-panel"
                  className="text-xs text-amber-700 hover:text-amber-800 transition-colors min-h-[44px] md:min-h-0 px-2 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  {statsExpanded ? "Hide activity" : "Show activity"}
                </button>
              </div>

              {userStatsFetchError ? (
                <div role="alert" className="flex items-center justify-between rounded-xl border border-amber-100 bg-white px-4 py-3">
                  <p className="text-sm text-stone-500">Couldn&apos;t load stats.</p>
                  <button
                    onClick={() => setUserStatsRetryTick((t) => t + 1)}
                    className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {userStats!.streak > 0 && (
                      <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                        <FireIcon className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <p className="text-lg font-bold text-amber-900 leading-none">{userStats!.streak}</p>
                          <p className="text-[10px] text-stone-600 mt-0.5">day streak</p>
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                      <BookOpenIcon className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-lg font-bold text-stone-800 leading-none">{userStats!.totals.books_started}</p>
                        <p className="text-[10px] text-stone-600 mt-0.5">books started</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                      <VocabIcon className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-lg font-bold text-stone-800 leading-none">{userStats!.totals.vocabulary_words}</p>
                        <p className="text-[10px] text-stone-600 mt-0.5">words saved</p>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center gap-3">
                      <NoteIcon className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-lg font-bold text-stone-800 leading-none">{userStats!.totals.annotations}</p>
                        <p className="text-[10px] text-stone-600 mt-0.5">annotations</p>
                      </div>
                    </div>
                  </div>

                  {statsExpanded && (
                    <div id="stats-activity-panel" className="mt-4">
                      <ReadingStats active heatmapOnly />
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Book grid */}
          {recentBooks.length > 0 ? (
            <section aria-label="Your Bookshelf">
              {recentBooks.length > 1 && (
                <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-600 mb-3">
                  Your Bookshelf
                </h2>
              )}
              <ul role="list" aria-label="Your Bookshelf" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 list-none p-0 m-0">
                {recentBooks.map((book) => (
                  <li key={book.id}>
                    <BookCard
                      book={book}
                      ownedByUser={uploadIds.has(book.id)}
                      onClick={() => setSelectedBook(book)}
                      badge={`Ch. ${book.lastChapter + 1} · ${timeAgo(book.lastRead)}`}
                      onRemove={() => {
                        if (removedBookToast) setRemovedBookToast(null);
                        removeRecentBook(book.id);
                        setRecentBooks(getRecentBooks());
                        setRemovedBookToast(book);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="text-center py-20">
              <div className="inline-flex items-end justify-center gap-1.5 mb-6 opacity-30">
                {[40, 56, 48, 60, 44].map((h, i) => (
                  <div key={i} className="w-6 rounded-t-sm bg-amber-700" style={{ height: h }} />
                ))}
              </div>
              <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                {drafts.length > 0 ? "Nothing on the shelf yet" : "Your bookshelf is empty"}
              </h2>
              <p className="text-sm text-amber-700 mb-6 max-w-xs mx-auto">
                {drafts.length > 0
                  ? "You have a book part-way through review — finish it and it lands here."
                  : "Books you open will appear here for quick access. Browse the library to find one to start."}
              </p>
              <Link
                href="/"
                className="inline-flex items-center rounded-lg bg-amber-700 px-6 py-2.5 min-h-[44px] md:min-h-0 text-white font-medium hover:bg-amber-800 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
              >
                Browse the library
              </Link>
            </div>
          )}
        </div>
      </div>

      {selectedBook && (
        <BookDetailModal
          book={selectedBook}
          recentBook={recentBooks.find((rb) => rb.id === selectedBook.id)}
          ownedByUser={uploadIds.has(selectedBook.id)}
          onClose={() => setSelectedBook(null)}
          onRead={() => {
            setSelectedBook(null);
            router.push(`/reader/${selectedBook.id}`);
          }}
        />
      )}

      {removedBookToast && (
        <UndoToast
          message={`"${removedBookToast.title}" removed from your bookshelf`}
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
