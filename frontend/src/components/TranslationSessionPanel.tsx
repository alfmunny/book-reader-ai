"use client";
import { useEffect, useState } from "react";
import {
  TranslationSession,
  PublishedSession,
  publishTranslationSession,
  unpublishTranslationSession,
  getSessionCompleteness,
  listVersionComments,
  addVersionComment,
  listPublishedSessions,
  PublishedSession as PublishedSessionType,
  toggleReaction,
  listReactions,
  StoryComment,
  SessionProvider,
  createTranslationSession,
  updateTranslationSession,
  deleteTranslationSession,
} from "@/lib/api";
import { LANGUAGES } from "@/components/InsightChat";
import { getSettings } from "@/lib/settings";
import { TrashIcon, EditIcon, HeartIcon, ChatIcon } from "@/components/Icons";
import Avatar from "@/components/Avatar";
import { timeAgo, exactTime } from "@/lib/timeAgo";

type DiscussTarget = {
  id: number;
  name: string;
  author?: string;
  authorPicture?: string | null;
  description?: string | null;
  language?: string;
  provider?: string;
  models?: string[];
  chapters?: number;
  publishedAt?: string | null;
};

const langLabel = (code?: string) =>
  LANGUAGES.find((l) => l.code === code)?.label ?? code ?? "";

const discussFromCommunity = (cs: PublishedSessionType): DiscussTarget => ({
  id: cs.id,
  name: cs.name,
  author: cs.author_name,
  authorPicture: cs.author_picture,
  description: cs.description,
  language: cs.target_language,
  provider: cs.provider,
  models: cs.model_tags,
  chapters: cs.chapters_covered,
  publishedAt: cs.published_at,
});

interface Props {
  bookId: number;
  bookLanguage: string;
  sessions: TranslationSession[];
  /** null = Editorial */
  activeSessionId: number | null;
  chapterCount: number;
  chapterIndex: number;
  hasClaudeKey: boolean;
  hasDeepseekKey: boolean;
  onSelect: (session: TranslationSession | null) => void;
  /** Whole-book versions other readers published — the Community group
   *  (track B, #2752). Selecting one reads it; it is never editable. */
  publishedSessions?: PublishedSession[];
  onSessionsChanged: (sessions: TranslationSession[]) => void;
  onTranslateChapter: (force?: boolean) => void;
  /** Characters of the current chapter's source text — drives the rough
   *  token/cost estimate in the retranslate confirmation. */
  chapterChars?: number;
  translating: boolean;
  /** Signed-in reader's identity — the discussion dialog credits your own
   *  published versions to you, the same way it credits everyone else. */
  currentUserName?: string | null;
  currentUserPicture?: string | null;
  /** Persistent error from the last session action (translate/delete). */
  actionError?: string | null;
  onDismissError?: () => void;
  /** Live background-run progress; the translate button becomes a bar. */
  runProgress?: { done: number; total: number } | null;
  /** Editorial coverage for the Editorial entry's status (read-only). */
  editorialStatus?: { lang: string; done: number; total: number; thisChapter: boolean; loading: boolean } | null;
  /** All languages that have editorial translations, with coverage. */
  editorialLanguages?: { total: number; languages: Array<{ code: string; chapters: number }> } | null;
  translationLang?: string;
  onChangeLanguage?: (lang: string) => void;
  /** paragraphs translated / total in the current chapter (session view) */
  chapterProgress?: { done: number; total: number } | null;
}

export default function TranslationSessionPanel({
  bookId,
  bookLanguage,
  sessions,
  activeSessionId,
  chapterCount,
  chapterIndex,
  currentUserName,
  currentUserPicture,
  hasClaudeKey,
  hasDeepseekKey,
  onSelect,
  publishedSessions,
  onSessionsChanged,
  onTranslateChapter,
  chapterChars = 0,
  translating,
  actionError,
  onDismissError,
  runProgress,
  editorialStatus,
  editorialLanguages,
  translationLang,
  onChangeLanguage,
  chapterProgress,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [lang, setLang] = useState(() => LANGUAGES.find((l) => l.code !== bookLanguage)?.code ?? "en");
  const [provider, setProvider] = useState<SessionProvider>(() => {
    // Profile default first, when its key exists; else whichever key is saved.
    const preferred = getSettings().versionProviderDefault ?? "deepseek";
    const keyFor = { deepseek: hasDeepseekKey, claude: hasClaudeKey };
    if (keyFor[preferred]) return preferred;
    return hasDeepseekKey || !hasClaudeKey ? "deepseek" : "claude";
  });
  const [style, setStyle] = useState("");
  // Public by default (owner, 2026-08-29) — sharing is the norm here
  const [visibility, setVisibility] = useState<"private" | "public">("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The row's pencil opens a full Edit dialog (owner, 2026-08-28) —
  // name, language, provider, style, visibility — mirroring Create;
  // the active-panel inline fields are gone.
  const [editDialog, setEditDialog] = useState<TranslationSession | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "", target_language: "en", provider: "deepseek" as SessionProvider,
    style_prompt: "", status: "private" as "private" | "public", description: "",
  });
  const [confirmRetranslate, setConfirmRetranslate] = useState(false);
  // Whole-book publication (track B): the gate lives on the server; here we
  // surface the shortfall so the reader knows what is left to translate.
  const [publishBusy, setPublishBusy] = useState(false);
  // A whole version can be liked and discussed (owner, 2026-08-30) — the
  // Community card and your own published version share this block.
  const [versionLike, setVersionLike] = useState<{ count: number; liked: boolean }>({ count: 0, liked: false });
  const [versionComments, setVersionComments] = useState<StoryComment[]>([]);
  const [versionDraft, setVersionCommentDraft] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  // Browse-all dialog: search, sort, load-more (owner, 2026-08-30)
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQ, setBrowseQ] = useState("");
  const [browseSort, setBrowseSort] = useState<"popular" | "recent">("popular");
  const [browseItems, setBrowseItems] = useState<PublishedSessionType[]>([]);
  const [browseMore, setBrowseMore] = useState(false);
  const [browseBusy, setBrowseBusy] = useState(false);
  const BROWSE_PAGE = 10;

  async function loadBrowse(reset: boolean) {
    setBrowseBusy(true);
    try {
      const r = await listPublishedSessions(bookId, {
        q: browseQ.trim() || undefined,
        sort: browseSort,
        limit: BROWSE_PAGE,
        offset: reset ? 0 : browseItems.length,
      });
      setBrowseItems((prev) => (reset ? r.items : [...prev, ...r.items]));
      setBrowseMore(r.has_more);
    } catch {
      if (reset) setBrowseItems([]);
      setBrowseMore(false);
    } finally {
      setBrowseBusy(false);
    }
  }

  useEffect(() => {
    if (!browseOpen) return;
    const t = setTimeout(() => { loadBrowse(true); }, browseQ ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseOpen, browseQ, browseSort]);

  const communityRow = (cs: PublishedSessionType, compact: boolean) => (
    <button
      key={`pub-${cs.id}`}
      role="radio"
      aria-checked={activeSessionId === cs.id}
      onClick={() => { onSelect(cs); setBrowseOpen(false); }}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        activeSessionId === cs.id
          ? "border-amber-600 ring-1 ring-amber-600 bg-white"
          : "border-amber-200 bg-white hover:bg-amber-50/50"
      }`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        {cs.author_picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cs.author_picture} alt="" aria-hidden="true" className="w-4 h-4 rounded-full object-cover shrink-0" />
        ) : (
          <span aria-hidden="true" className="w-4 h-4 rounded-full bg-amber-200 text-amber-900 inline-flex items-center justify-center text-[9px] font-semibold shrink-0">
            {(cs.author_name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-xs text-stone-600 shrink-0">{cs.author_name}</span>
        <span lang={cs.target_language} className="font-medium text-ink text-sm truncate">{cs.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 shrink-0">{cs.target_language}</span>
        {!compact && cs.model_tags.slice(0, 1).map((m) => (
          <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0 font-mono">{m}</span>
        ))}
        <span className="flex-1" />
        <span
          role="button"
          tabIndex={0}
          aria-label={`Likes and comments on ${cs.name}`}
          title="Likes and comments"
          data-testid={`version-discuss-${cs.id}`}
          onClick={(e) => { e.stopPropagation(); setDiscussVersion(discussFromCommunity(cs)); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            setDiscussVersion(discussFromCommunity(cs));
          }}
          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-stone-400 hover:text-amber-700 rounded px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <ChatIcon className="w-3.5 h-3.5" />
          {cs.comments > 0 && cs.comments}
        </span>
        {cs.likes > 0 && (
          <span className="text-[10px] text-stone-500 shrink-0 inline-flex items-center gap-0.5">
            <HeartIcon className="w-3 h-3" /> {cs.likes}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 shrink-0">{cs.chapters_covered}/{chapterCount} ch</span>
      </span>
    </button>
  );
  // What the discussion dialog shows above the thread: who made this
  // translation, their blurb, and how it was made (owner, 2026-08-30) —
  // a version is a piece of work, not just a row to comment under.
  const [discussVersion, setDiscussVersion] = useState<DiscussTarget | null>(null);
  const discussedId = discussVersion?.id ?? null;
  useEffect(() => {
    if (discussedId == null) { setVersionComments([]); setVersionLike({ count: 0, liked: false }); return; }
    let cancelled = false;
    listVersionComments(discussedId)
      .then((r) => { if (!cancelled) setVersionComments(r.comments); })
      .catch(() => { if (!cancelled) setVersionComments([]); });
    listReactions("session", [discussedId])
      .then((r) => {
        if (cancelled) return;
        setVersionLike(r.reactions[String(discussedId)] ?? { count: 0, liked: false });
      })
      .catch(() => { if (!cancelled) setVersionLike({ count: 0, liked: false }); });
    return () => { cancelled = true; };
  }, [discussedId]);

  async function toggleVersionLike() {
    if (discussedId == null) return;
    const before = versionLike;
    setVersionLike({ count: before.count + (before.liked ? -1 : 1), liked: !before.liked });
    try {
      const r = await toggleReaction("session", discussedId);
      setVersionLike({ count: r.count, liked: r.liked });
    } catch {
      setVersionLike(before);
    }
  }

  async function postVersionComment() {
    if (discussedId == null || !versionDraft.trim() || versionBusy) return;
    setVersionBusy(true);
    try {
      const created = await addVersionComment(discussedId, versionDraft.trim());
      setVersionComments((c) => [...c, created]);
      setVersionCommentDraft("");
    } catch {
      setError("Could not post the comment.");
    } finally {
      setVersionBusy(false);
    }
  }

  const versionDiscussionDialog = discussVersion && (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="Translation discussion">
      <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-md max-h-[70vh] flex flex-col" style={{ boxShadow: "var(--shadow-card-hover)" }} data-testid="version-discussion">
        <div className="flex items-start gap-2 mb-2">
          {discussVersion.author && (
            <Avatar name={discussVersion.author} picture={discussVersion.authorPicture} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink break-words">{discussVersion.name}</p>
            {discussVersion.author && (
              <p className="text-[11px] text-stone-500">
                by {discussVersion.author}
                {discussVersion.publishedAt && (
                  <>
                    {" · "}
                    <time title={exactTime(discussVersion.publishedAt)}>{timeAgo(discussVersion.publishedAt)}</time>
                  </>
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => setDiscussVersion(null)}
            aria-label="Close discussion"
            className="text-stone-500 hover:text-ink min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 inline-flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            ✕
          </button>
        </div>
        {discussVersion.description && (
          <p className="text-[13px] leading-relaxed text-stone-600 mb-2 whitespace-pre-wrap">{discussVersion.description}</p>
        )}
        <div className="flex items-center gap-1 flex-wrap text-[10px] mb-2" data-testid="version-meta">
          {discussVersion.language && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{langLabel(discussVersion.language)}</span>
          )}
          {(discussVersion.models?.length
            ? discussVersion.models
            : discussVersion.provider ? [discussVersion.provider] : []
          ).map((m) => (
            <span key={m} className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-mono">{m}</span>
          ))}
          {discussVersion.chapters !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
              {discussVersion.chapters} chapter{discussVersion.chapters === 1 ? "" : "s"}
            </span>
          )}
        </div>
      <div className="space-y-2 overflow-y-auto">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleVersionLike}
          aria-label={versionLike.liked ? "Unlike this version" : "Like this version"}
          aria-pressed={versionLike.liked}
          data-testid="version-like"
          className={`inline-flex items-center gap-1 text-[11px] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors ${
            versionLike.liked ? "text-red-500 hover:text-red-600" : "text-stone-400 hover:text-red-500"
          }`}
        >
          <HeartIcon className="w-4 h-4" filled={versionLike.liked} />
          {versionLike.count > 0 && versionLike.count}
        </button>
        <span className="text-[11px] text-stone-500">{versionComments.length} comment{versionComments.length === 1 ? "" : "s"}</span>
      </div>
      {versionComments.length === 0 && (
        <p className="text-[11px] text-stone-400 py-1">No comments yet — say what you think of this translation.</p>
      )}
      {versionComments.map((c) => (
        <div key={c.id} className="text-xs" data-testid={`version-comment-${c.id}`}>
          <div className="flex items-center gap-1.5">
            <Avatar name={c.author_name} picture={c.author_picture} size="w-4 h-4" />
            <span className="font-medium text-ink">{c.author_name}</span>
            {c.created_at && (
              <time title={exactTime(c.created_at)} className="text-[10px] text-stone-400">{timeAgo(c.created_at)}</time>
            )}
          </div>
          <p className="mt-0.5 pl-[22px] text-[13px] leading-relaxed text-stone-600 whitespace-pre-wrap">{c.body}</p>
        </div>
      ))}
      </div>
      <div className="flex gap-1.5 pt-2 mt-1 border-t border-amber-100">
        <input
          value={versionDraft}
          onChange={(e) => setVersionCommentDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") postVersionComment(); }}
          placeholder="Comment on this translation…"
          aria-label="Version comment"
          className="flex-1 text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          onClick={postVersionComment}
          disabled={versionBusy || !versionDraft.trim()}
          className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white disabled:opacity-50 hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          Post
        </button>
      </div>
      </div>
    </div>
  );
  // Version-list filter (owner request, 2026-08-27): by name, language, model.
  const [filterText, setFilterText] = useState("");
  const [filterLang, setFilterLang] = useState("all");
  const [filterProvider, setFilterProvider] = useState("all");

  const active = sessions.find((s) => s.id === activeSessionId) ?? null;

  const showFilter = sessions.length > 3;
  const sessionLangs = Array.from(new Set(sessions.map((s) => s.target_language)));
  const visibleSessions = sessions.filter((s) => {
    // The active version stays visible regardless of filters — hiding the
    // thing currently rendered in the reader would be disorienting.
    if (s.id === activeSessionId) return true;
    if (filterText && !s.name.toLowerCase().includes(filterText.trim().toLowerCase())) return false;
    if (filterLang !== "all" && s.target_language !== filterLang) return false;
    if (filterProvider !== "all" && s.provider !== filterProvider) return false;
    return true;
  });
  const providerReady = provider === "deepseek" ? hasDeepseekKey : hasClaudeKey;

  async function handleCreate() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTranslationSession({
        book_id: bookId,
        name: name.trim(),
        target_language: lang,
        provider,
        status: visibility,
        ...(style.trim() ? { style_prompt: style.trim() } : {}),
      });
      onSessionsChanged([...sessions, created]);
      onSelect(created);
      setCreating(false);
      setName("");
      setStyle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the version.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishToggle(session: TranslationSession) {
    if (publishBusy) return;
    setPublishBusy(true);
    setError(null);
    try {
      const updated = session.status === "published"
        ? await unpublishTranslationSession(session.id)
        : await publishTranslationSession(session.id);
      const merged = { ...session, ...updated, coverage: session.coverage };
      onSessionsChanged(sessions.map((s) => (s.id === session.id ? merged : s)));
      if (activeSessionId === session.id) onSelect(merged);
      setEditDialog(null);
    } catch (e) {
      // The server refuses an incomplete book — show what is missing
      let msg = e instanceof Error ? e.message : "Could not publish the version.";
      try {
        const state = await getSessionCompleteness(session.id);
        if (!state.complete) {
          msg = `Translate the whole book first — ${state.translated_paragraphs} of ${state.total_paragraphs} paragraphs done, ${state.missing_chapters.length} chapter(s) left.`;
        }
      } catch { /* keep the server message */ }
      setError(msg);
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleEditSave() {
    if (!editDialog || busy || !editDraft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTranslationSession(editDialog.id, {
        name: editDraft.name.trim(),
        target_language: editDraft.target_language,
        provider: editDraft.provider,
        style_prompt: editDraft.style_prompt,
        status: editDraft.status,
        description: editDraft.description,
      });
      const merged = { ...editDialog, ...updated, coverage: editDialog.coverage };
      onSessionsChanged(sessions.map((s) => (s.id === editDialog.id ? merged : s)));
      // Reselect so the reader picks up changes (e.g. language) immediately
      if (activeSessionId === editDialog.id) onSelect(merged);
      setEditDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the version.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(session: TranslationSession) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteTranslationSession(session.id);
      onSessionsChanged(sessions.filter((s) => s.id !== session.id));
      if (activeSessionId === session.id) onSelect(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the version.");
    } finally {
      setBusy(false);
    }
  }




  const chaptersCovered = active
    ? Object.keys(active.coverage ?? {}).length
    : 0;

  const chapterComplete = !!chapterProgress && chapterProgress.total > 0 && chapterProgress.done >= chapterProgress.total;
  const chapterPartial = !!chapterProgress && chapterProgress.done > 0 && chapterProgress.done < chapterProgress.total;

  // Rough, transparent estimate: input ≈ chars/4 tokens, output about the
  // same. Marked as approximate in the dialog — the point is awareness, not
  // accounting (owner, 2026-08-27: "make the user aware this costs money").
  const estTokens = Math.max(1, Math.round((chapterChars / 4) * 2));
  const price = active?.provider === "claude"
    ? { name: "claude-sonnet-5", cost: (chapterChars / 4) * 3e-6 + (chapterChars / 4) * 15e-6 }
    : { name: "deepseek-v4-flash", cost: (chapterChars / 4) * 0.22e-6 + (chapterChars / 4) * 0.66e-6 };
  const estCost = price.cost < 0.01 ? "< $0.01" : `≈ $${price.cost.toFixed(2)}`;

  return (
    <div className="mb-4" data-testid="translation-session-panel">
      <p className="block text-xs text-amber-700 mb-1">Editorial translation</p>
      <div className={`rounded-lg border mb-3 ${activeSessionId === null ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white"}`} data-testid="editorial-card">
        <button
          role="radio"
          aria-checked={activeSessionId === null}
          onClick={() => onSelect(null)}
          className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] md:min-h-0 text-sm text-left transition-colors hover:bg-amber-50/50 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <span className="font-medium text-ink flex-1">Editorial</span>
          {editorialStatus && !editorialStatus.loading && (
            <span
              data-testid="editorial-chip-status"
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${editorialStatus.thisChapter ? "bg-green-50 text-green-700" : "bg-stone-100 text-stone-500"}`}
              title={`${editorialStatus.done} / ${editorialStatus.total} chapters have an editorial translation`}
            >
              {editorialStatus.thisChapter ? `✓ ${editorialStatus.done}/${editorialStatus.total} ch` : `– ${editorialStatus.done}/${editorialStatus.total} ch`}
            </span>
          )}
        </button>
      </div>

      <div className="mb-3" data-testid="editorial-languages">
        {/* Coverage lives IN the options (owner, 2026-08-27): every language
            is pickable, and "0/28 ch" right in the dropdown explains an
            empty editorial view before it happens. */}
        <label htmlFor="reader-trans-lang" className="block text-[11px] text-stone-500 mb-1">Target language</label>
        <select
          id="reader-trans-lang"
          className="w-full text-sm rounded-lg border border-amber-300 px-3 py-2 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          value={translationLang}
          onChange={(e) => onChangeLanguage?.(e.target.value)}
        >
          {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => {
            const covered = editorialLanguages?.languages.find((x) => x.code === l.code)?.chapters ?? 0;
            const suffix = editorialLanguages ? ` — ${covered}/${editorialLanguages.total} ch` : "";
            return (
              <option key={l.code} value={l.code}>{l.label}{suffix}</option>
            );
          })}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">For this book only — numbers show chapters with an editorial translation.</p>
        {editorialLanguages && editorialLanguages.languages.length === 0 && (
          <p className="mt-1 text-[11px] text-stone-500 italic">None yet — editorial translations are prepared offline.</p>
        )}
      </div>

      <p className="block text-xs text-amber-700 mb-1">Other translation versions</p>
      {showFilter && (
        <div className="mb-2 space-y-1.5" data-testid="version-filter">
          <input
            aria-label="Filter versions by name"
            placeholder="Filter by name…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full text-xs border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-1.5">
            <select
              aria-label="Filter versions by language"
              value={filterLang}
              onChange={(e) => setFilterLang(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-amber-200 rounded px-1.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All languages</option>
              {sessionLangs.map((l) => (
                <option key={l} value={l}>{LANGUAGES.find((x) => x.code === l)?.label ?? l}</option>
              ))}
            </select>
            <select
              aria-label="Filter versions by model"
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="flex-1 min-w-0 text-xs border border-amber-200 rounded px-1.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="all">All models</option>
              <option value="deepseek">deepseek-v4-flash</option>
              <option value="claude">claude-sonnet-5</option>
            </select>
          </div>
        </div>
      )}
      <div className="space-y-1.5" role="radiogroup" aria-label="Other translation versions">

        {showFilter && visibleSessions.length === 0 && (
          <p className="text-xs text-stone-500 italic px-1" data-testid="no-version-match">No versions match the filter.</p>
        )}
        {visibleSessions.map((s) => (
          <div key={s.id} className={`rounded-lg border transition-colors ${
            activeSessionId === s.id ? "border-amber-600 ring-1 ring-amber-600 bg-white" : "border-amber-200 bg-white"
          }`}>
            {(

              <div className="flex items-center gap-1.5 px-3 py-2">
                <button
                  role="radio"
                  aria-checked={activeSessionId === s.id}
                  onClick={() => onSelect(s)}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  <span lang={s.target_language} className="font-medium text-ink text-sm truncate">{s.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 shrink-0">{s.target_language}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0 font-mono">{s.provider}</span>
                  {s.status === "public" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 shrink-0">public</span>
                  )}
                  {s.status === "published" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">published</span>
                  )}
                </button>
                {s.status === "published" && (
                  <button
                    onClick={() => setDiscussVersion({
                      id: s.id, name: s.name, author: currentUserName ?? undefined, authorPicture: currentUserPicture,
                      description: s.description, language: s.target_language,
                      provider: s.provider, chapters: Object.keys(s.coverage ?? {}).length,
                      publishedAt: s.updated_at,
                    })}
                    aria-label={`Likes and comments on ${s.name}`}
                    title="Likes and comments"
                    data-testid={`version-discuss-${s.id}`}
                    className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-400 hover:text-amber-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <ChatIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditDialog(s);
                    setError(null);
                    setEditDraft({
                      name: s.name,
                      target_language: s.target_language,
                      provider: s.provider,
                      style_prompt: s.style_prompt ?? "",
                      status: s.status === "public" ? "public" : "private",
                      description: s.description ?? "",
                    });
                  }}
                  aria-label={`Edit version ${s.name}`}
                  className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <EditIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  aria-label={`Delete version ${s.name}`}
                  className="shrink-0 p-1 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-red-500 hover:text-red-600 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {(publishedSessions?.length ?? 0) > 0 && (
          <div className="mt-3" data-testid="community-versions">
            <p className="block text-xs text-amber-700 mb-1">Community · complete translations</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Community translations">
              {publishedSessions!.map((cs) => communityRow(cs as PublishedSessionType, true))}
            </div>
            <button
              onClick={() => setBrowseOpen(true)}
              className="mt-1.5 text-xs text-amber-700 hover:underline min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
            >
              More community translations →
            </button>
          </div>
        )}

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="text-sm text-amber-700 hover:text-amber-800 hover:underline min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
          >
            ＋ Add your own version
          </button>
        ) : null}
        {versionDiscussionDialog}

        {browseOpen && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="Community translations">
            <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-lg max-h-[80vh] flex flex-col" style={{ boxShadow: "var(--shadow-card-hover)" }} data-testid="community-browse">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium text-ink flex-1">Community translations</p>
                <button
                  onClick={() => setBrowseOpen(false)}
                  aria-label="Close community translations"
                  className="text-stone-500 hover:text-ink min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 inline-flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  value={browseQ}
                  onChange={(e) => setBrowseQ(e.target.value)}
                  placeholder="Search by version or author…"
                  aria-label="Search community translations"
                  className="flex-1 text-sm border border-amber-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <select
                  aria-label="Sort community translations"
                  value={browseSort}
                  onChange={(e) => setBrowseSort(e.target.value as "popular" | "recent")}
                  className="text-sm border border-amber-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="popular">Most liked</option>
                  <option value="recent">Newest</option>
                </select>
              </div>
              <div className="space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="All community translations">
                {browseItems.length === 0 && !browseBusy && (
                  <p className="text-xs text-stone-500 italic py-4 text-center">
                    {browseQ ? "No translations match that search." : "No community translations for this book yet."}
                  </p>
                )}
                {browseItems.map((cs) => communityRow(cs, false))}
              </div>
              {browseMore && (
                <button
                  onClick={() => loadBrowse(false)}
                  disabled={browseBusy}
                  className="mt-2 text-xs text-amber-700 hover:underline disabled:opacity-50 min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                >
                  {browseBusy ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          </div>
        )}

        {editDialog && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="Edit translation version">
          <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-md space-y-2.5" style={{ boxShadow: "var(--shadow-card-hover)" }} data-testid="edit-session-form">
            <p className="text-sm font-medium text-ink">Edit version</p>
            <input
              aria-label="Version name"
              value={editDraft.name}
              onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              autoFocus
            />
            <textarea
              aria-label="Version description"
              value={editDraft.description}
              onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Describe this translation — your approach, who it's for…"
              rows={2}
              maxLength={500}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <select
              aria-label="Version target language"
              value={editDraft.target_language}
              onChange={(e) => setEditDraft((d) => ({ ...d, target_language: e.target.value }))}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <select
              aria-label="Version provider"
              value={editDraft.provider}
              onChange={(e) => setEditDraft((d) => ({ ...d, provider: e.target.value as SessionProvider }))}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="deepseek" disabled={!hasDeepseekKey}>DeepSeek · deepseek-v4-flash{hasDeepseekKey ? "" : " (no key)"}</option>
              <option value="claude" disabled={!hasClaudeKey}>Claude · claude-sonnet-5{hasClaudeKey ? "" : " (no key)"}</option>
            </select>
            <select
              aria-label="Version visibility"
              value={editDraft.status}
              onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value as "private" | "public" }))}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="private">Private — only you see this version</option>
              <option value="public">Public — renderings are posted as you translate</option>
            </select>
            <textarea
              aria-label="Style and requirements"
              placeholder="Style & requirements (optional)"
              value={editDraft.style_prompt}
              onChange={(e) => setEditDraft((d) => ({ ...d, style_prompt: e.target.value }))}
              rows={3}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {/* Errors belong where the action is, not out in the sidebar
                (owner, 2026-08-30). */}
            {error && (
              <p role="alert" data-testid="edit-dialog-error" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                {error}
              </p>
            )}
            <p className="text-[11px] text-stone-500">
              {editDialog.status === "published"
                ? "Published — other readers can select and read this version."
                : "Publishing lets other readers select this version; it needs the whole book translated."}
            </p>
            {/* One footer row: publication on the left, save/cancel on the
                right — the same button language throughout. */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePublishToggle(editDialog)}
                disabled={publishBusy || busy}
                className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                {publishBusy ? "Working…" : editDialog.status === "published" ? "Unpublish" : "Publish"}
              </button>
              <span className="flex-1" />
              <button
                onClick={() => { setEditDialog(null); setError(null); }}
                className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-200 text-stone-600 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={busy || !editDraft.name.trim()}
                className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Save
              </button>
            </div>
          </div>
          </div>
        )}
        {creating && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="New translation version">
          <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-md space-y-2.5" style={{ boxShadow: "var(--shadow-card-hover)" }} data-testid="new-session-form">
            <p className="text-sm font-medium text-ink">New translation version</p>
            <input
              aria-label="Version name"
              placeholder="Version name (e.g. 诗意版)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              autoFocus
            />
            <select
              aria-label="Version target language"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <select
              aria-label="Version provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as SessionProvider)}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="deepseek" disabled={!hasDeepseekKey}>DeepSeek · deepseek-v4-flash{hasDeepseekKey ? "" : " (no key)"}</option>
              <option value="claude" disabled={!hasClaudeKey}>Claude · claude-sonnet-5{hasClaudeKey ? "" : " (no key)"}</option>
            </select>
            <select
              aria-label="Version visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "private" | "public")}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="private">Private — only you see this version</option>
              <option value="public">Public — renderings are posted as you translate</option>
            </select>
            <textarea
              aria-label="Style and requirements"
              placeholder="Style & requirements (optional) — e.g. 优雅的书面语，保留诗行结构"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              rows={2}
              className="w-full text-sm border border-amber-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCreating(false); setError(null); }} className="text-xs px-2 py-1.5 min-h-[44px] md:min-h-0 text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={busy || !name.trim() || !providerReady}
                className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                Create version
              </button>
            </div>
            {!providerReady && (
              <p className="text-[11px] text-amber-700">Add a {provider === "deepseek" ? "DeepSeek" : "Claude"} API key in your profile to use this provider.</p>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Reading another reader's published version: read-only by design —
          the translate/edit panel below belongs to your own versions. */}
      {!active && activeSessionId != null && (() => {
        const community = publishedSessions?.find((p) => p.id === activeSessionId);
        if (!community) return null;
        return (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3" data-testid="community-readonly">
            <p className="text-xs text-ink">
              Reading <span className="font-medium">{community.author_name}</span>&rsquo;s <span lang={community.target_language}>{community.name}</span>.
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              A community translation — you can read it and write notes on it, but only its author can change it.
            </p>
          </div>
        );
      })()}

      {/* Active session: style panel + chapter translate */}
      {active && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 space-y-2" data-testid="session-style-panel">
          {actionError && (
            <div role="alert" data-testid="session-action-error" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-start justify-between gap-2">
              <span className="flex-1">{actionError}</span>
              {onDismissError && (
                <button onClick={onDismissError} aria-label="Dismiss error" className="shrink-0 font-bold text-red-400 hover:text-red-600 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">×</button>
              )}
            </div>
          )}
          <button
            onClick={() => (chapterComplete ? setConfirmRetranslate(true) : onTranslateChapter(false))}
            disabled={translating}
            aria-busy={translating}
            data-testid="translate-chapter-button"
            className="relative w-full px-3 py-2 min-h-[44px] md:min-h-0 rounded-lg overflow-hidden bg-amber-700 hover:bg-amber-800 disabled:hover:bg-amber-700 text-white text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            {/* The button IS the progress bar during a run */}
            {runProgress && runProgress.total > 0 && (
              <span
                aria-hidden="true"
                data-testid="translate-progress-fill"
                className="absolute inset-y-0 left-0 bg-amber-500/80 transition-all duration-500"
                style={{ width: `${Math.round((runProgress.done / runProgress.total) * 100)}%` }}
              />
            )}
            <span className="relative">
              {runProgress && runProgress.total > 0
                ? `Translating ${runProgress.done} / ${runProgress.total}…`
                : translating ? "Translating…"
                : chapterComplete ? "Retranslate this chapter"
                : chapterPartial ? `Translate remaining (${chapterProgress!.total - chapterProgress!.done})`
                : "Translate this chapter"}
            </span>
          </button>
          {confirmRetranslate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Confirm retranslation">
              <div className="bg-white rounded-xl border border-amber-200 shadow-xl p-4 w-full max-w-sm space-y-3" data-testid="retranslate-confirm">
                <p className="text-sm font-semibold text-ink">Retranslate this chapter?</p>
                <p className="text-xs text-stone-600 leading-relaxed">
                  This re-runs {price.name} over the whole chapter and <b>costs real tokens</b>:
                  roughly {estTokens.toLocaleString()} tokens, {estCost} on your key (rough estimate).
                  Manually edited and posted paragraphs are kept.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setConfirmRetranslate(false)}
                    className="px-3 py-1.5 min-h-[44px] md:min-h-0 text-sm text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setConfirmRetranslate(false); onTranslateChapter(true); }}
                    className="px-4 py-1.5 min-h-[44px] md:min-h-0 text-sm rounded-lg bg-amber-700 text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                  >
                    Retranslate ({estCost})
                  </button>
                </div>
              </div>
            </div>
          )}
          <p className="text-[11px] text-stone-600" data-testid="session-coverage">
            {chapterProgress ? `${chapterProgress.done} / ${chapterProgress.total} paragraphs in this chapter · ` : ""}
            {chaptersCovered} / {chapterCount} chapters started
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
