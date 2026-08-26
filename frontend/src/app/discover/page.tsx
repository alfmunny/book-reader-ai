"use client";
/**
 * Discover — the storyline feed (design: user-translations.md phase 2, #2752).
 *
 * Recent shares across all books: translation renderings and shared notes,
 * each linking into the reader at its anchor chapter. Content is a live
 * reference — the feed always shows the author's current rendering.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Story, getStoryFeed } from "@/lib/api";
import SiteHeader from "@/components/SiteHeader";
import { BookOpenIcon, ChatIcon } from "@/components/Icons";

function StoryCard({ story }: { story: Story }) {
  return (
    <article
      className="rounded-xl border border-amber-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{ boxShadow: "var(--shadow-card)" }}
      data-testid={`feed-story-${story.id}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-500">
        <span className="font-medium text-ink">{story.author_name}</span>
        {story.kind === "translation" ? (
          <>
            <span>shared a translation</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{story.session_name}</span>
          </>
        ) : (
          <span>shared a note</span>
        )}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 text-stone-400">
          <ChatIcon className="w-3.5 h-3.5" aria-hidden="true" />
          {story.comment_count}
        </span>
      </div>

      {story.kind === "translation" ? (
        <div className="mt-2 space-y-1.5">
          {story.paragraphs?.map((p) => (
            <p key={p.paragraph_index} lang={story.target_language ?? undefined} className="text-sm font-serif text-ink">
              {p.text}
            </p>
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <blockquote className="text-xs text-stone-500 border-l-2 border-amber-200 pl-2 italic">
            {story.sentence_text}
          </blockquote>
          {story.note_text && <p className="mt-1.5 text-sm font-serif text-ink">{story.note_text}</p>}
        </div>
      )}

      {story.caption && <p className="mt-2 text-xs text-stone-600">{story.caption}</p>}

      <Link
        href={`/reader/${story.book_id}?chapter=${story.chapter_index}`}
        className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
      >
        <BookOpenIcon className="w-3.5 h-3.5" aria-hidden="true" />
        {story.book_title} · chapter {story.chapter_index + 1}
      </Link>
    </article>
  );
}

export default function DiscoverPage() {
  const { status } = useSession();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    getStoryFeed()
      .then((r) => setStories(r.stories))
      .catch(() => setError(true));
  }, [status]);

  return (
    <main className="min-h-screen bg-parchment">
      <SiteHeader />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-serif text-2xl font-bold text-ink">Discover</h1>
        <p className="mt-1 text-sm text-stone-500">
          What other readers are translating and thinking, across the library.
        </p>

        {error && (
          <p className="mt-6 text-sm text-red-700" role="alert">Could not load the feed — try reloading.</p>
        )}

        {!error && stories === null && (
          <div className="mt-6 space-y-4" role="status" aria-label="Loading feed">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-amber-100 bg-white/60 h-28 animate-pulse" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        )}

        {stories !== null && stories.length === 0 && (
          <div className="mt-10 text-center">
            <BookOpenIcon className="w-10 h-10 mx-auto text-amber-300" aria-hidden="true" />
            <h2 className="mt-3 font-serif text-lg text-ink">Nothing shared yet</h2>
            <p className="mt-1 text-sm text-stone-500 max-w-sm mx-auto">
              Share a paragraph from one of your translation versions, or a note
              you made while reading — it will appear here for other readers.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm px-4 py-2 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Open a book
            </Link>
          </div>
        )}

        {stories !== null && stories.length > 0 && (
          <div className="mt-6 space-y-4">
            {stories.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
