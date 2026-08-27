"use client";
/**
 * Inline story panel (design: user-translations.md phase 2, #2752).
 *
 * ONE panel for every share kind — translation renderings and shared notes.
 *
 * The "sentence" variant is a WeRead-style dialog. For paragraph posts it
 * carries two tabs (owner design, 2026-08-30):
 *
 *   Comments            — the comment LIST anchored on the CURRENT
 *                         rendering's paragraph (editorial included — every
 *                         displayed translation paragraph is an anchor).
 *                         Tap a comment → its detail, one level deeper,
 *                         where the discussion (replies) happens.
 *   Other translations  — the version list. Tap a version → its detail
 *                         (rendering + ITS comment list) → tap a comment →
 *                         detail. Same depth everywhere.
 *
 * Editing/deleting your note lives in your note's detail page; likes join
 * the comment machinery with track B.
 */
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useScrollLock } from "@/lib/useScrollLock";
import {
  Story,
  StoryComment,
  EditorialCommentAnchor,
  listStoryComments,
  addStoryComment,
  listEditorialComments,
  addEditorialComment,
  deleteStory,
  deleteStoryComment,
} from "@/lib/api";
import { CloseIcon, TrashIcon, NoteIcon, ArrowLeftIcon } from "@/components/Icons";
import { COLORS } from "@/components/QuickHighlightPanel";

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

type CommentAnchor =
  | { kind: "story"; storyId: number }
  | { kind: "editorial"; editorial: EditorialCommentAnchor };

function anchorId(a: CommentAnchor): string {
  return a.kind === "story"
    ? `s:${a.storyId}`
    : `e:${a.editorial.book_id}:${a.editorial.target_language}:${a.editorial.chapter_index}:${a.editorial.paragraph_index}`;
}

function loadAnchor(a: CommentAnchor) {
  return a.kind === "story" ? listStoryComments(a.storyId) : listEditorialComments(a.editorial);
}

function postToAnchor(a: CommentAnchor, body: string, parentId?: number) {
  return a.kind === "story"
    ? addStoryComment(a.storyId, body, parentId)
    : addEditorialComment(a.editorial, body, parentId);
}

/** Flat self-loading thread for the paragraph-panel cards (non-sentence
 *  variant): top-level comments with replies indented, composer below. */
function StoryDiscussion({
  storyId,
  initialCount,
  currentUserId,
  isAdmin,
  onChanged,
  testId = "detail-discussion",
}: {
  storyId: number;
  initialCount: number;
  currentUserId?: number;
  isAdmin?: boolean;
  onChanged: () => void;
  testId?: string;
}) {
  const [comments, setComments] = useState<StoryComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStoryComments(storyId)
      .then((r) => { if (!cancelled) setComments(r.comments); })
      .catch(() => { if (!cancelled) setError("Could not load the discussion."); });
    return () => { cancelled = true; };
  }, [storyId]);

  async function add() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await addStoryComment(storyId, draft.trim());
      setComments((c) => [...(c ?? []), created]);
      setDraft("");
      onChanged();
    } catch {
      setError("Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: number) {
    try {
      await deleteStoryComment(commentId);
      setComments((c) => (c ?? []).filter((x) => x.id !== commentId && x.parent_comment_id !== commentId));
      onChanged();
    } catch {
      setError("Could not delete the comment.");
    }
  }

  const top = (comments ?? []).filter((c) => !c.parent_comment_id);
  const repliesOf = (id: number) => (comments ?? []).filter((c) => c.parent_comment_id === id);
  const row = (c: StoryComment, indent: boolean) => (
    <div key={c.id} className={`text-xs flex items-start gap-1.5 ${indent ? "pl-5" : ""}`}>
      <Avatar name={c.author_name} picture={c.author_picture} size="w-4 h-4" />
      <span className="font-medium text-ink">{c.author_name}</span>{" "}
      <span className="text-stone-600 flex-1">{c.body}</span>
      {(c.user_id === currentUserId || isAdmin) && (
        <button
          onClick={() => remove(c.id)}
          aria-label="Delete comment"
          className="text-stone-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <div className="pt-2 border-t border-amber-100 space-y-2" data-testid={testId}>
      <p className="text-[11px] font-medium text-stone-500">Comments ({comments?.length ?? initialCount})</p>
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      {top.map((c) => (
        <div key={c.id} className="space-y-1.5">
          {row(c, false)}
          {repliesOf(c.id).map((r) => row(r, true))}
        </div>
      ))}
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a comment…"
          aria-label="Comment text"
          className="flex-1 text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={add}
          disabled={busy || !draft.trim()}
          className="text-xs px-2.5 py-1.5 rounded bg-amber-700 text-white disabled:opacity-50 hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          Post
        </button>
      </div>
      {/* Likes land here with track B — once, for every surface. */}
    </div>
  );
}

type View =
  | { mode: "list" }
  | { mode: "editMine" }
  | { mode: "story"; storyId: number }
  | { mode: "myVersion"; index: number }
  | { mode: "comments" }
  | { mode: "comment"; commentId: number; anchor: CommentAnchor; from: "comments" | number };

interface Props {
  stories: Story[];
  /** Paragraph the panel is anchored to (1-based in the title). */
  paragraphIndex: number;
  /** Overrides the default "Shares on paragraph N" title (sentence anchors). */
  title?: string;
  /** Anchor point (viewport coords). On desktop the panel pops up near it,
   *  WeRead-style; small screens keep the bottom sheet. */
  position?: { x: number; y: number } | null;
  /** "sentence" = the WeRead dialog described above. */
  variant?: "sentence";
  /** The reader's own note on this sentence — pinned on top, "My note".
   *  text is the RAW note_text (may be empty for a bare highlight). */
  myNote?: { text: string; authorName: string; picture?: string | null } | null;
  /** Highlight colors merged from the popover — one dialog, not two. */
  annotationBar?: {
    existingColor?: string | null;
    onColor: (color: "yellow" | "blue" | "green" | "pink") => void;
  };
  /** Persist the reader's note text (creates the highlight if needed). */
  onSaveMyNote?: (text: string) => Promise<void>;
  /** Remove the reader's highlight + note on this sentence. */
  onDeleteMyNote?: () => Promise<void>;
  /** The reader's OWN renderings of this paragraph, pinned first. */
  myVersions?: Array<{
    sessionName: string;
    model?: string | null;
    text: string;
    posted: boolean;
    storyId?: number;
    authorName: string;
    picture?: string | null;
  }>;
  /** Bottom publish box (paragraph posts): caption in, one tap to post. */
  composer?: {
    placeholder: string;
    submitLabel: string;
    emptyText: string;
    onSubmit: (caption: string) => Promise<void>;
  };
  /** Two-view posts dialog: the Comments tab's anchor is the CURRENT
   *  rendering's paragraph — a story post, or the editorial anchor. No
   *  anchor (private, unposted) shows emptyText instead. */
  commentsTab?: {
    anchor?: CommentAnchor;
    label: string;
    emptyText: string;
  };
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
  annotationBar,
  onSaveMyNote,
  onDeleteMyNote,
  myVersions,
  composer,
  commentsTab,
  currentUserId,
  isAdmin,
  onClose,
  onChanged,
}: Props) {
  const [view, setView] = useState<View>(commentsTab ? { mode: "comments" } : { mode: "list" });
  const [noteDraft, setNoteDraft] = useState(myNote?.text ?? "");
  const [openThread, setOpenThread] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Anchored comments: one cache, loaded per active anchor ──────────────
  const [commentCache, setCommentCache] = useState<Record<string, StoryComment[]>>({});
  const [draft, setDraft] = useState("");
  const activeAnchor: CommentAnchor | null =
    view.mode === "comments"
      ? commentsTab?.anchor ?? null
      : view.mode === "story"
        ? { kind: "story", storyId: view.storyId }
        : view.mode === "comment"
          ? view.anchor
          : null;
  const activeKey = activeAnchor ? anchorId(activeAnchor) : null;
  useEffect(() => {
    if (!activeKey || !activeAnchor || commentCache[activeKey]) return;
    let cancelled = false;
    loadAnchor(activeAnchor)
      .then((r) => { if (!cancelled) setCommentCache((c) => ({ ...c, [activeKey]: r.comments })); })
      .catch(() => { if (!cancelled) setError("Could not load the comments."); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const anchorComments = activeKey ? commentCache[activeKey] ?? [] : [];
  const topLevel = anchorComments.filter((c) => !c.parent_comment_id);
  const repliesOf = (id: number) => anchorComments.filter((c) => c.parent_comment_id === id);

  async function addComment(parentId?: number) {
    if (!activeAnchor || !activeKey || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await postToAnchor(activeAnchor, draft.trim(), parentId);
      setCommentCache((c) => ({ ...c, [activeKey]: [...(c[activeKey] ?? []), created] }));
      setDraft("");
      onChanged();
    } catch {
      setError("Could not post the comment.");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId: number) {
    if (!activeKey) return;
    try {
      await deleteStoryComment(commentId);
      setCommentCache((c) => ({
        ...c,
        [activeKey]: (c[activeKey] ?? []).filter((x) => x.id !== commentId && x.parent_comment_id !== commentId),
      }));
      onChanged();
    } catch {
      setError("Could not delete the comment.");
    }
  }

  async function handleDeleteStory(storyId: number) {
    if (busy) return;
    setBusy(true);
    try {
      await deleteStory(storyId);
      onChanged();
      setView(commentsTab ? { mode: "comments" } : { mode: "list" });
    } catch {
      setError("Could not delete the share.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMyNote() {
    if (!onSaveMyNote || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSaveMyNote(noteDraft.trim());
      setView({ mode: "list" });
    } catch {
      setError("Could not save your note.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMyNote() {
    if (!onDeleteMyNote || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onDeleteMyNote();
      setNoteDraft("");
      setView({ mode: "list" });
    } catch {
      setError("Could not delete your note.");
    } finally {
      setBusy(false);
    }
  }

  const [composerDraft, setComposerDraft] = useState("");
  async function handleComposerSubmit() {
    if (!composer || busy) return;
    setBusy(true);
    setError(null);
    try {
      await composer.onSubmit(composerDraft.trim());
      setComposerDraft("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish the post.");
    } finally {
      setBusy(false);
    }
  }

  // WeRead dialog treatment: near the clicked sentence but never covering
  // it — below when it fits, flipped above (bottom-anchored) otherwise —
  // over a dimmed scroll-locked page, bubble arrow pointing at the
  // sentence. Mobile keeps the bottom sheet. window is safe here — client
  // component, computed after mount-time interactions.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true);
  useScrollLock(true);
  const anchored = !!position && typeof window !== "undefined" && window.innerWidth >= 768;
  const W = 416; // matches w-[26rem]
  const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  let panelLeft = 0, arrowX = 0, below = true;
  let anchorStyle: React.CSSProperties = { boxShadow: "var(--shadow-card-hover)" };
  if (anchored) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - position!.y - 24 - 16;
    const spaceAbove = position!.y - 28 - 16;
    below = spaceBelow >= 280 || spaceBelow >= spaceAbove;
    panelLeft = clampN(position!.x - W / 2, 16, vw - W - 16);
    arrowX = clampN(position!.x - panelLeft, 24, W - 24);
    anchorStyle = below
      ? { left: panelLeft, top: position!.y + 24, maxHeight: Math.min(480, spaceBelow), boxShadow: "var(--shadow-card-hover)" }
      : { left: panelLeft, bottom: vh - position!.y + 28, maxHeight: Math.min(480, spaceAbove), boxShadow: "var(--shadow-card-hover)" };
  }

  const detailStory = view.mode === "story" ? stories.find((s) => s.id === view.storyId) : undefined;
  const detailVersion = view.mode === "myVersion" ? myVersions?.[view.index] : undefined;
  const detailComment = view.mode === "comment" ? anchorComments.find((c) => c.id === view.commentId) : undefined;
  // The Comments tab means the CURRENT rendering's thread; details reached
  // from the list stay under Other translations with their back arrow.
  const activeCommentsView = !!commentsTab &&
    (view.mode === "comments" || (view.mode === "comment" && view.from === "comments"));
  const headerTitle =
    view.mode === "editMine"
      ? (myNote ? "My note" : "Write a note")
      : view.mode === "comment"
        ? "Comment"
        : view.mode === "story"
          ? (detailStory?.kind === "translation" ? "Reader's translation" : "Reader's note")
          : view.mode === "myVersion"
            ? "My translation"
            : title ?? `Shares on paragraph ${paragraphIndex + 1}`;

  function goBack() {
    if (view.mode === "comment") {
      setView(view.from === "comments" ? { mode: "comments" } : { mode: "story", storyId: view.from });
    } else {
      setView({ mode: "list" });
    }
  }

  const commentRow = (c: StoryComment, opts: { clickable?: boolean; indent?: boolean; from?: "comments" | number } = {}) => {
    const replies = repliesOf(c.id).length;
    const open = opts.clickable && activeAnchor
      ? () => setView({ mode: "comment", commentId: c.id, anchor: activeAnchor, from: opts.from ?? "comments" })
      : undefined;
    return (
      <div
        key={c.id}
        role={open ? "button" : undefined}
        tabIndex={open ? 0 : undefined}
        aria-label={open ? `Open comment by ${c.author_name}` : undefined}
        onClick={open}
        onKeyDown={open ? (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          open();
        } : undefined}
        data-testid={`comment-${c.id}`}
        className={`text-xs flex items-start gap-1.5 ${opts.indent ? "pl-5" : ""} ${
          open ? "cursor-pointer rounded p-1.5 -m-1.5 hover:bg-amber-50/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" : ""
        }`}
      >
        <Avatar name={c.author_name} picture={c.author_picture} size="w-4 h-4" />
        <span className="font-medium text-ink">{c.author_name}</span>{" "}
        <span className={`text-stone-600 flex-1 ${open ? "line-clamp-2" : ""}`}>{c.body}</span>
        {open && replies > 0 && (
          <span className="text-[10px] text-amber-700 shrink-0">{replies} repl{replies === 1 ? "y" : "ies"}</span>
        )}
        {!open && (c.user_id === currentUserId || isAdmin) && (
          <button
            onClick={() => removeComment(c.id)}
            aria-label="Delete comment"
            className="text-stone-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const commentComposer = (placeholder: string, parentId?: number) => (
    <div className="flex gap-1.5">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") addComment(parentId); }}
        placeholder={placeholder}
        aria-label="Comment text"
        className="flex-1 text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      <button
        onClick={() => addComment(parentId)}
        disabled={busy || !draft.trim()}
        className="text-xs px-2.5 py-1.5 rounded bg-amber-700 text-white disabled:opacity-50 hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        Post
      </button>
    </div>
  );

  const renderStoryCard = (story: Story) => (
    <div key={story.id} data-testid={`story-${story.id}`}>
      <div
        role={variant === "sentence" ? "button" : undefined}
        tabIndex={variant === "sentence" ? 0 : undefined}
        aria-label={variant === "sentence" ? `Open ${story.kind === "translation" ? "translation" : "note"} by ${story.author_name}` : undefined}
        onClick={variant === "sentence" ? () => setView({ mode: "story", storyId: story.id }) : undefined}
        onKeyDown={variant === "sentence" ? (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          setView({ mode: "story", storyId: story.id });
        } : undefined}
        className={`rounded-lg border border-amber-100 p-3 ${
          variant === "sentence" ? "cursor-pointer hover:bg-amber-50/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" : ""
        }`}
      >
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
            variant !== "sentence" && <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">note</span>
          )}
          <span className="flex-1" />
          {variant !== "sentence" && (story.user_id === currentUserId || isAdmin) && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteStory(story.id); }}
              aria-label="Delete this share"
              className="text-stone-400 hover:text-red-600 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {story.kind === "translation" ? (
          <div className={`mt-1.5 space-y-1.5 ${variant === "sentence" ? "line-clamp-3" : ""}`}>
            {story.paragraphs?.map((p) => (
              <p key={p.paragraph_index} lang={story.target_language ?? undefined} className="text-[13px] leading-relaxed font-serif text-ink whitespace-pre-wrap">
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
          <div className="mt-2" data-testid={`story-thread-${story.id}`}>
            <StoryDiscussion
              storyId={story.id}
              initialCount={story.comment_count}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onChanged={onChanged}
              testId={`story-discussion-${story.id}`}
            />
          </div>
        )}
      </div>
    </div>
  );

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
      aria-label={headerTitle}
      className={
        anchored
          ? "fixed z-50 w-[26rem] flex flex-col rounded-xl border border-amber-200 bg-white animate-fade-in"
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
            below ? "-top-[7px] border-l border-t" : "-bottom-[7px] border-r border-b"
          }`}
          style={{ left: arrowX - 6 }}
        />
      )}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
        {view.mode !== "list" && view.mode !== "comments" && (
          <button
            onClick={goBack}
            aria-label="Back"
            data-testid="story-panel-back"
            className="min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 inline-flex items-center justify-center text-stone-500 hover:text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
        )}
        <h3 className="font-serif font-semibold text-sm text-ink flex-1">{headerTitle}</h3>
        <button
          onClick={onClose}
          aria-label="Close shares panel"
          className="min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 inline-flex items-center justify-center text-stone-500 hover:text-ink rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {commentsTab && view.mode !== "editMine" && (
        <div role="tablist" aria-label="Paragraph views" data-testid="dialog-tabs" className="flex border-b border-amber-100">
          {([
            { key: "comments", label: "Comments" },
            { key: "translations", label: "Other translations" },
          ] as const).map((t) => {
            const active = t.key === "comments" ? activeCommentsView : !activeCommentsView;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setView(t.key === "comments" ? { mode: "comments" } : { mode: "list" })}
                className={`flex-1 text-xs py-2 min-h-[44px] md:min-h-0 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  active ? "text-amber-800 border-b-2 border-amber-600 -mb-px" : "text-stone-500 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {view.mode === "list" && annotationBar && (
        <div
          role="toolbar"
          aria-label="Highlight options"
          data-testid="story-panel-toolbar"
          className="flex items-center gap-2.5 px-4 py-2.5 border-b border-amber-100"
        >
          {COLORS.map((c) => (
            <button
              key={c.key}
              title={c.label}
              aria-label={c.label}
              aria-pressed={annotationBar.existingColor === c.key}
              onClick={() => annotationBar.onColor(c.key)}
              className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <span
                className={`w-6 h-6 rounded-full ${c.bg} border-2 transition-all hover:scale-110 ${
                  annotationBar.existingColor === c.key ? `${c.border} scale-110` : "border-transparent"
                }`}
              />
            </button>
          ))}
          {onSaveMyNote && !myNote && (
            <>
              <span className="w-px h-5 bg-amber-100" aria-hidden="true" />
              <button
                onClick={() => { setNoteDraft(""); setView({ mode: "editMine" }); }}
                aria-label="Write note"
                className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-ink min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
              >
                <NoteIcon className="w-4 h-4" aria-hidden="true" />
                Write note
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100" role="alert">{error}</p>
      )}

      {view.mode === "comments" ? (
        <div className="px-4 py-3 space-y-2.5 overflow-y-auto" data-testid="comments-view">
          <p className="text-[11px] text-stone-500">{commentsTab?.label}</p>
          {!commentsTab?.anchor ? (
            <p className="text-xs text-stone-500 italic py-3 text-center" data-testid="comments-empty">{commentsTab?.emptyText}</p>
          ) : (
            <>
              {topLevel.length === 0 && (
                <p className="text-xs text-stone-500 italic">No comments yet — be the first.</p>
              )}
              {topLevel.map((c) => commentRow(c, { clickable: true, from: "comments" }))}
              {commentComposer("Add a comment…")}
            </>
          )}
        </div>
      ) : view.mode === "comment" && detailComment ? (
        <div className="px-4 py-3 space-y-3 overflow-y-auto" data-testid="comment-detail">
          <div className="flex items-start gap-2">
            <Avatar name={detailComment.author_name} picture={detailComment.author_picture} size="w-7 h-7" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{detailComment.author_name}</p>
              {detailComment.created_at && (
                <p className="text-[11px] text-stone-400">{detailComment.created_at.slice(0, 10)}</p>
              )}
            </div>
            {(detailComment.user_id === currentUserId || isAdmin) && (
              <button
                onClick={async () => { await removeComment(detailComment.id); goBack(); }}
                aria-label="Delete comment"
                className="text-stone-400 hover:text-red-600 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">{detailComment.body}</p>
          <div className="pt-2 border-t border-amber-100 space-y-2">
            <p className="text-[11px] font-medium text-stone-500">Replies ({repliesOf(detailComment.id).length})</p>
            {repliesOf(detailComment.id).map((r) => commentRow(r, { indent: true }))}
            {commentComposer("Reply…", detailComment.id)}
          </div>
          {/* Likes join here with track B */}
        </div>
      ) : view.mode === "editMine" ? (
        <div className="px-4 py-3 space-y-2.5 overflow-y-auto" data-testid="my-note-editor">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={5}
            autoFocus
            placeholder="Your thought on this sentence…"
            aria-label="My note text"
            className="w-full text-sm font-serif border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex items-center gap-2">
            {myNote && onDeleteMyNote && (
              <button
                onClick={handleDeleteMyNote}
                disabled={busy}
                aria-label="Delete my note and highlight"
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              >
                <TrashIcon className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            )}
            <span className="flex-1" />
            <button
              onClick={handleSaveMyNote}
              disabled={busy}
              className="text-sm px-4 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : view.mode === "myVersion" && detailVersion ? (
        <div className="px-4 py-3 space-y-3 overflow-y-auto" data-testid="my-version-detail">
          <div className="flex items-center gap-2">
            <Avatar name={detailVersion.authorName} picture={detailVersion.picture} size="w-7 h-7" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{detailVersion.authorName}</p>
              <p className="text-[11px] text-stone-400">{detailVersion.sessionName}</p>
            </div>
            {detailVersion.model && (
              <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-[10px]">{detailVersion.model}</span>
            )}
            <span className="px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[11px]">Private</span>
          </div>
          <p className="text-[13px] leading-relaxed font-serif text-ink whitespace-pre-wrap">{detailVersion.text}</p>
          {/* Private — nobody else can see it, so no comment anchor here. */}
        </div>
      ) : view.mode === "story" && detailStory ? (
        <div className="px-4 py-3 space-y-3 overflow-y-auto" data-testid="story-detail">
          {variant === "sentence" && detailStory.kind === "translation" && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="version-switcher" role="tablist" aria-label="Translation versions">
              {myVersions?.map((v, i) => {
                const active = v.posted ? v.storyId === detailStory.id : false;
                return (
                  <button
                    key={`chip-mine-${i}`}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setView(v.posted && v.storyId ? { mode: "story", storyId: v.storyId } : { mode: "myVersion", index: i })}
                    className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                      active ? "border-amber-600 bg-amber-700 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    {v.sessionName} · mine
                  </button>
                );
              })}
              {stories.filter((st) => st.kind === "translation" && !myVersions?.some((v) => v.storyId === st.id)).map((st) => (
                <button
                  key={`chip-${st.id}`}
                  role="tab"
                  aria-selected={st.id === detailStory.id}
                  onClick={() => setView({ mode: "story", storyId: st.id })}
                  className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    st.id === detailStory.id ? "border-amber-600 bg-amber-700 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  {st.author_name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Avatar name={detailStory.author_name} picture={detailStory.author_picture} size="w-7 h-7" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{detailStory.author_name}</p>
              {detailStory.created_at && (
                <p className="text-[11px] text-stone-400">{detailStory.created_at.slice(0, 10)}</p>
              )}
            </div>
            {(detailStory.user_id === currentUserId || isAdmin) && (
              <button
                onClick={() => handleDeleteStory(detailStory.id)}
                disabled={busy}
                aria-label="Delete this share"
                className="text-stone-400 hover:text-red-600 disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          {detailStory.kind === "translation" && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{detailStory.session_name}</span>
                {detailStory.paragraphs?.[0]?.model && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-[10px]">{detailStory.paragraphs[0].model}</span>
                )}
              </div>
              {detailStory.paragraphs?.map((p) => (
                <p key={p.paragraph_index} lang={detailStory.target_language ?? undefined} className="text-[13px] leading-relaxed font-serif text-ink whitespace-pre-wrap">
                  {p.text}
                </p>
              ))}
            </div>
          )}
          {detailStory.note_text && (
            <p className="text-sm font-serif text-ink leading-relaxed">{detailStory.note_text}</p>
          )}
          {detailStory.caption && (
            <p className="text-xs text-stone-600">{detailStory.caption}</p>
          )}
          <div className="pt-2 border-t border-amber-100 space-y-2" data-testid="detail-discussion">
            <p className="text-[11px] font-medium text-stone-500">Comments ({topLevel.length || detailStory.comment_count})</p>
            {topLevel.map((c) => commentRow(c, { clickable: true, from: detailStory.id }))}
            {commentComposer("Add a comment…")}
          </div>
        </div>
      ) : (
        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {stories.length === 0 && (myVersions?.length ?? 0) === 0 && composer && (
            <p className="text-xs text-stone-500 italic" data-testid="posts-empty">{composer.emptyText}</p>
          )}
          {myVersions?.map((v, i) => {
            const open = v.posted && v.storyId
              ? () => setView({ mode: "story", storyId: v.storyId! })
              : () => setView({ mode: "myVersion", index: i });
            return (
            <div
              key={`mine-${i}`}
              role="button"
              tabIndex={0}
              aria-label={v.posted && v.storyId ? `Open my post from ${v.sessionName}` : `Open my version ${v.sessionName}`}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                open();
              }}
              className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 cursor-pointer hover:bg-amber-100/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              data-testid={`my-version-${i}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-stone-500">
                <Avatar name={v.authorName} picture={v.picture} />
                <span className="px-1.5 py-0.5 rounded-full bg-amber-200/70 text-amber-900">My version</span>
                <span className="font-medium text-ink">{v.sessionName}</span>
                {v.model && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono text-[10px]">{v.model}</span>
                )}
                <span className="flex-1" />
                {v.posted ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700">Posted</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">Private</span>
                )}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed font-serif text-ink whitespace-pre-wrap line-clamp-3">{v.text}</p>
            </div>
            );
          })}
          {myNote && (
            <div
              role={variant === "sentence" ? "button" : undefined}
              tabIndex={variant === "sentence" ? 0 : undefined}
              aria-label={variant === "sentence" ? "Open my note" : undefined}
              onClick={variant === "sentence" ? () => { setNoteDraft(myNote.text); setView({ mode: "editMine" }); } : undefined}
              onKeyDown={variant === "sentence" ? (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                setNoteDraft(myNote.text);
                setView({ mode: "editMine" });
              } : undefined}
              className={`rounded-lg border border-amber-200 bg-amber-50/50 p-3 ${
                variant === "sentence" ? "cursor-pointer hover:bg-amber-100/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" : ""
              }`}
              data-testid="my-note"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
                <Avatar name={myNote.authorName} picture={myNote.picture} />
                <span className="font-medium text-ink">{myNote.authorName}</span>
                <span className="flex-1" />
                <span className="px-1.5 py-0.5 rounded-full bg-amber-200/70 text-amber-900">My note</span>
              </div>
              <p className="mt-1.5 text-sm font-serif text-ink">
                {myNote.text || <span className="text-stone-400 italic">Highlight — tap to add a note.</span>}
              </p>
            </div>
          )}
          {stories
            .filter((st) => !myVersions?.some((v) => v.storyId === st.id))
            .map(renderStoryCard)}
        </div>
      )}

      {view.mode === "list" && composer && (
        <div className="px-4 py-3 border-t border-amber-100 space-y-2" data-testid="post-composer">
          <textarea
            value={composerDraft}
            onChange={(e) => setComposerDraft(e.target.value)}
            rows={2}
            placeholder={composer.placeholder}
            aria-label="Post caption"
            className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={handleComposerSubmit}
            disabled={busy}
            className="w-full text-sm px-4 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            {busy ? "Publishing…" : composer.submitLabel}
          </button>
        </div>
      )}
    </div>
    </>
  );
}
