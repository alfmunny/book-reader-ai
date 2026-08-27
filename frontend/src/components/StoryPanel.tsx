"use client";
/**
 * Inline story panel (design: user-translations.md phase 2, #2752).
 *
 * ONE panel for every share kind on a paragraph — translation renderings
 * (author, session name, model tag, caption) and shared notes (highlight
 * quote + the reader's thought) — with the discussion thread right there.
 * For translators it doubles as a per-paragraph comparison view; for
 * readers it is the classic WeRead shared-notes margin.
 */
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useScrollLock } from "@/lib/useScrollLock";
import {
  Story,
  StoryComment,
  listStoryComments,
  addStoryComment,
  deleteStory,
  deleteStoryComment,
} from "@/lib/api";
import { CloseIcon, TrashIcon, EditIcon } from "@/components/Icons";

/** Small round author avatar: picture when the account has one, an
 *  initial-letter disc otherwise. */
function Avatar({ name, picture, size = "w-5 h-5" }: { name: string; picture?: string | null; size?: string }) {
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt="" aria-hidden="true" className={`${size} rounded-full shrink-0 object-cover`} />;
  }
  return (
    <span aria-hidden="true" className={`${size} rounded-full shrink-0 bg-amber-200 text-amber-900 inline-flex items-center justify-center text-[10px] font-semibold`}>
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

interface Props {
  stories: Story[];
  /** Paragraph the panel is anchored to (1-based in the title). */
  paragraphIndex: number;
  /** Overrides the default "Shares on paragraph N" title (sentence anchors). */
  title?: string;
  /** Anchor point (viewport coords). On desktop the panel pops up beside it,
   *  WeRead-style; small screens keep the bottom sheet. */
  position?: { x: number; y: number } | null;
  /** "sentence" = the WeRead notes list: no quote (the sentence is right
   *  there), no discussion UI (likes/comments come with track B). */
  variant?: "sentence";
  /** The reader's own note on this sentence — pinned on top, "My note". */
  myNote?: { text: string; authorName: string; picture?: string | null } | null;
  /** Opens the reader's highlight editor (color / note / delete). */
  onEditMyNote?: () => void;
  currentUserId?: number;
  isAdmin?: boolean;
  onClose: () => void;
  /** Parent refetches the chapter's stories after a mutation. */
  onChanged: () => void;
}

export default function StoryPanel({
  stories,
  paragraphIndex,
  title,
  position,
  variant,
  myNote,
  onEditMyNote,
  currentUserId,
  isAdmin,
  onClose,
  onChanged,
}: Props) {
  const [openThread, setOpenThread] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, StoryComment[]>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (openThread == null) return;
    listStoryComments(openThread)
      .then((r) => setComments((c) => ({ ...c, [openThread]: r.comments })))
      .catch(() => setError("Could not load the discussion."));
  }, [openThread]);

  async function handleComment(storyId: number) {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addStoryComment(storyId, draft.trim());
      setComments((c) => ({ ...c, [storyId]: [...(c[storyId] ?? []), created] }));
      setDraft("");
      onChanged();
    } catch {
      setError("Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteStory(storyId: number) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteStory(storyId);
      onChanged();
    } catch {
      setError("Could not delete the share.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteComment(storyId: number, commentId: number) {
    try {
      await deleteStoryComment(commentId);
      setComments((c) => ({ ...c, [storyId]: (c[storyId] ?? []).filter((x) => x.id !== commentId) }));
      onChanged();
    } catch {
      setError("Could not delete the comment.");
    }
  }

  // WeRead dialog treatment (owner, 2026-08-28): the panel floats in the
  // middle band of the screen over a dimmed page, scroll-locked, with a
  // speech-bubble arrow pointing at the clicked sentence. Mobile keeps the
  // bottom sheet (also dimmed + locked). window is safe here — client
  // component, computed on render after mount-time interactions.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);
  useScrollLock(true);
  const anchored = !!position && typeof window !== "undefined" && window.innerWidth >= 768;
  const PANEL_W = 416; // matches w-[26rem]
  const panelLeft = anchored
    ? Math.min(Math.max(16, position!.x - PANEL_W / 2), window.innerWidth - PANEL_W - 16)
    : 0;
  const panelTop = anchored ? Math.max(72, window.innerHeight * 0.22) : 0;
  // Arrow points up at the sentence when it sits above the panel band,
  // down at it otherwise; clamped inside the panel's rounded corners.
  const arrowUp = anchored && position!.y <= panelTop;
  const arrowX = anchored
    ? Math.min(Math.max(24, position!.x - panelLeft), PANEL_W - 24)
    : 0;
  const anchorStyle = anchored
    ? { left: panelLeft, top: panelTop, boxShadow: "var(--shadow-card-hover)" }
    : { boxShadow: "var(--shadow-card-hover)" };
  return (
    <>
    <div
      className="fixed inset-0 z-40 bg-black/40 animate-fade-in"
      data-testid="story-panel-backdrop"
      onClick={onClose}
      aria-hidden="true"
    />
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? `Shares on paragraph ${paragraphIndex + 1}`}
      className={
        anchored
          ? "fixed z-50 w-[26rem] max-h-[56vh] flex flex-col rounded-xl border border-amber-200 bg-white animate-fade-in"
          : "fixed inset-x-0 bottom-0 md:inset-auto md:right-6 md:bottom-6 md:w-[26rem] z-50 max-h-[70vh] flex flex-col rounded-t-xl md:rounded-xl border border-amber-200 bg-white animate-slide-up"
      }
      style={anchorStyle}
      data-testid="story-panel"
    >
      {anchored && (
        <span
          aria-hidden="true"
          data-testid="story-panel-arrow"
          className={`absolute w-3 h-3 bg-white border-amber-200 rotate-45 ${
            arrowUp ? "-top-[7px] border-l border-t" : "-bottom-[7px] border-r border-b"
          }`}
          style={{ left: arrowX - 6 }}
        />
      )}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
        <h3 className="font-serif font-semibold text-sm text-ink flex-1">
          {title ?? `Shares on paragraph ${paragraphIndex + 1}`}
        </h3>
        <button
          onClick={onClose}
          aria-label="Close shares panel"
          className="min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 inline-flex items-center justify-center text-stone-500 hover:text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100" role="alert">{error}</p>
      )}

      <div className="overflow-y-auto px-4 py-3 space-y-4">
        {myNote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3" data-testid="my-note">
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
              <Avatar name={myNote.authorName} picture={myNote.picture} />
              <span className="font-medium text-ink">{myNote.authorName}</span>
              <span className="flex-1" />
              <span className="px-1.5 py-0.5 rounded-full bg-amber-200/70 text-amber-900">My note</span>
              {onEditMyNote && (
                <button
                  onClick={onEditMyNote}
                  aria-label="Edit my highlight and note"
                  className="text-stone-400 hover:text-amber-800 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  <EditIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm font-serif text-ink">{myNote.text}</p>
          </div>
        )}
        {stories.map((story) => (
          <div key={story.id} className="rounded-lg border border-amber-100 p-3" data-testid={`story-${story.id}`}>
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-stone-500">
              <Avatar name={story.author_name} picture={story.author_picture} />
              <span className="font-medium text-ink">{story.author_name}</span>
              {story.kind === "translation" ? (
                <>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{story.session_name}</span>
                  {story.paragraphs?.[0]?.model && (
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-[10px]">{story.paragraphs[0].model}</span>
                  )}
                </>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">note</span>
              )}
              <span className="flex-1" />
              {(story.user_id === currentUserId || isAdmin) && (
                <button
                  onClick={() => handleDeleteStory(story.id)}
                  aria-label="Delete this share"
                  className="text-stone-400 hover:text-red-600 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {story.kind === "translation" ? (
              <div className="mt-1.5 space-y-1.5">
                {story.paragraphs?.map((p) => (
                  <p key={p.paragraph_index} lang={story.target_language ?? undefined} className="text-sm font-serif text-ink">
                    {p.text}
                  </p>
                ))}
              </div>
            ) : (
              <div className="mt-1.5">
                {variant !== "sentence" && (
                  <blockquote className="text-xs text-stone-500 border-l-2 border-amber-200 pl-2 italic">
                    {story.sentence_text}
                  </blockquote>
                )}
                {story.note_text && <p className="mt-1 text-sm font-serif text-ink">{story.note_text}</p>}
              </div>
            )}

            {story.caption && (
              <p className="mt-1.5 text-xs text-stone-600">{story.caption}</p>
            )}

            {variant !== "sentence" && (
              <button
                onClick={() => setOpenThread(openThread === story.id ? null : story.id)}
                className="mt-2 text-[11px] text-amber-700 hover:underline min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
              >
                {openThread === story.id ? "Hide discussion" : `Discussion (${story.comment_count})`}
              </button>
            )}

            {openThread === story.id && (
              <div className="mt-2 space-y-2" data-testid={`story-thread-${story.id}`}>
                {(comments[story.id] ?? []).map((c) => (
                  <div key={c.id} className="text-xs flex items-start gap-1.5">
                    <Avatar name={c.author_name} picture={c.author_picture} size="w-4 h-4" />
                    <span className="font-medium text-ink">{c.author_name}</span>{" "}
                    <span className="text-stone-600">{c.body}</span>
                    {(c.user_id === currentUserId || isAdmin) && (
                      <button
                        onClick={() => handleDeleteComment(story.id, c.id)}
                        aria-label="Delete comment"
                        className="ml-1.5 text-stone-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleComment(story.id); }}
                    placeholder="Add to the discussion…"
                    aria-label="Comment text"
                    className="flex-1 text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={() => handleComment(story.id)}
                    disabled={busy || !draft.trim()}
                    className="text-xs px-2.5 py-1.5 rounded bg-amber-700 text-white disabled:opacity-50 hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    </>
  );
}
