"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getBookChapters, synthesizeSpeech, getMe, getBookTranslationStatus, getBookTranslationLanguages, BookTranslationLanguages, getChapterTranslation, saveReadingProgress, getAnnotations, createAnnotation, getVocabulary, saveVocabularyWord, exportVocabularyToObsidian, saveInsight, listStories, createStory, deleteStory, Story, updateAnnotation, deleteAnnotation, listTranslationSessions, getSessionChapter, translateSession, editSessionParagraph, deleteSessionParagraph, TranslationSession, SessionChapter, TranslationStatus, BookMeta, BookChapter, ApiError, Annotation, VocabularyWord, ChapterSource, WordDefinition } from "@/lib/api";
import { recordRecentBook, saveLastChapter, getLastChapter } from "@/lib/recentBooks";
import { getSettings, saveSettings, FontSize, Theme, LineHeight, ContentWidth, FontFamily } from "@/lib/settings";
import TypographyPanel from "@/components/TypographyPanel";
import TableOfContents from "@/components/TableOfContents";
import InsightChat, { LANGUAGES } from "@/components/InsightChat";
import TTSControls from "@/components/TTSControls";
import TranslationView from "@/components/TranslationView";
import SentenceReader from "@/components/SentenceReader";
import StoryPanel from "@/components/StoryPanel";
import { anchorsOverlap, poolNoteStories } from "@/lib/storyPooling";
import SelectionToolbar from "@/components/SelectionToolbar";
import AnnotationToolbar from "@/components/AnnotationToolbar";
import QuickHighlightPanel from "@/components/QuickHighlightPanel";
import VocabularyToast from "@/components/VocabularyToast";
import UndoToast from "@/components/UndoToast";
import VocabWordTooltip from "@/components/VocabWordTooltip";
import TranslationSessionPanel from "@/components/TranslationSessionPanel";
import AuthPromptModal from "@/components/AuthPromptModal";
import { SunIcon, MoonIcon, SepiaIcon, ChatIcon, GlobeIcon, NoteIcon, EditIcon, ShareIcon, BookmarkIcon, BookOpenIcon, ExportIcon, PlayIcon, PauseIcon, CloseIcon, KeyboardIcon, FocusIcon, ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronRightIcon, ListViewIcon, EmptyVocabIcon, ArrowUpRightIcon } from "@/components/Icons";
import { useFocusTrap } from "@/lib/useFocusTrap";

// Gemini Flash pricing constants — used for total queue cost estimate in the translation sidebar.
const FLASH_COST_PER_M = 2.5; // USD per 1M output tokens
const TOKENS_PER_WORD = 1.4;
const WORDS_DEFAULT = 2000;


// In-memory cache: bookId → chapters (survives client-side navigation)
const chaptersCache = new Map<string, BookChapter[]>();
const metaCache = new Map<string, BookMeta>();
const sourceCache = new Map<string, ChapterSource>();

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [meta, setMeta] = useState<BookMeta | null>(metaCache.get(bookId) ?? null);
  const [chapters, setChapters] = useState<BookChapter[]>(chaptersCache.get(bookId) ?? []);
  const [chapterSource, setChapterSource] = useState<ChapterSource | null>(sourceCache.get(bookId) ?? null);
  const [chapterIndex, setChapterIndex] = useState(() => {
    // ?chapter=N from vocabulary deep links takes priority over last-read
    const qch = searchParams?.get("chapter");
    if (qch !== null && qch !== undefined) {
      const n = parseInt(qch, 10);
      if (!isNaN(n) && n >= 0) return n;
    }
    return getLastChapter(Number(bookId));
  });
  const [loading, setLoading] = useState(!chaptersCache.has(bookId));
  const [error, setError] = useState("");

  const [selectedText, setSelectedText] = useState("");
  const [chatSheetText, setChatSheetText] = useState<string | null>(null);

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationsError, setAnnotationsError] = useState(false);
  const [annotationsRetryTick, setAnnotationsRetryTick] = useState(0);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [annotationPanel, setAnnotationPanel] = useState<{
    sentenceText: string;
    chapterIndex: number;
  } | null>(null);
  const [quickHighlightPanel, setQuickHighlightPanel] = useState<{
    sentenceText: string;
    chapterIndex: number;
    position: { x: number; y: number };
    existingAnnotation?: Annotation;
  } | null>(null);
  const [typographyAnchorPos, setTypographyAnchorPos] = useState<{ x: number; y: number } | null>(null);
  const [scrollTargetSentence, setScrollTargetSentence] = useState<string | undefined>();
  // Keyboard sentence-selection mode (#2584)
  const [sentenceSelectMode, setSentenceSelectMode] = useState(false);
  const [selectedSentenceFlatIdx, setSelectedSentenceFlatIdx] = useState<number | null>(null);
  // Keyboard word-lookup mode (#2589) — active within sentence-select mode
  const [wordSelectMode, setWordSelectMode] = useState(false);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);
  const didUrlScrollRef = useRef(false);

  // Vocabulary toast
  const [vocabToastWord, setVocabToastWord] = useState<string | null>(null);

  // Obsidian export toast — { msg: string; ok: boolean } distinguishes success from error
  const [obsidianToast, setObsidianToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Enqueue-all feedback toast — replaces blocking alert()
  const [enqueueToast, setEnqueueToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Annotation delete undo toast
  const [deletedAnnotationToast, setDeletedAnnotationToast] = useState<Annotation | null>(null);
  const [annotationUndoError, setAnnotationUndoError] = useState<string | null>(null);

  // Retry-failed error toast — replaces blocking alert()
  const [retryToast, setRetryToast] = useState<string | null>(null);

  // Screen-reader announcement for annotation/highlight save success (WCAG 4.1.3)
  const [savedAnnotationMsg, setSavedAnnotationMsg] = useState("");

  // TTS Read-button playback state — fed by TTSControls via callback props.
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
  const [ttsDuration, setTtsDuration] = useState(0);
  const [ttsIsPlaying, setTtsIsPlaying] = useState(false);
  const [ttsIsLoading, setTtsIsLoading] = useState(false);
  const [ttsChunks, setTtsChunks] = useState<{ text: string; duration: number }[]>([]);
  const ttsSeekRef = useRef<(t: number) => void>(() => {});
  const ttsControlsRef = useRef<{ pause: () => void; play: () => void } | null>(null);
  const ttsIsPlayingRef = useRef(false);

  // Annotation display toggle (persisted; applied after mount — see below)


  // Sidebar — hidden by default, resizable, tabbed
  // Remember the sidebar across visits (owner request, 2026-08-25). Stored
  // state is applied AFTER mount: reading it in a useState initializer makes
  // the client's first render differ from the server's HTML — the "Hydration
  // failed" overlay the owner hit on 2026-08-26. Open state restores on
  // desktop only — the same state drives the mobile bottom sheet, which must
  // not auto-open on load.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"toc" | "chat" | "notes" | "vocab" | "translate">("chat");
  // State (not a ref): effects that react to restored values — the persist
  // effect and the translationLang===bookLanguage correction — must re-run
  // with FRESH state after the restore, not fire on mount with stale
  // defaults (the fr→de clobber caught by e2e/annotation-translation).
  const [settingsRestored, setSettingsRestored] = useState(false);
  useEffect(() => {
    const s = getSettings();
    if (window.innerWidth >= 768 && s.readerSidebarOpen) setSidebarOpen(true);
    setSidebarTab(s.readerSidebarTab);
    setSettingsRestored(true);
  }, []);
  useEffect(() => {
    if (!settingsRestored) return;
    saveSettings({ readerSidebarOpen: sidebarOpen, readerSidebarTab: sidebarTab });
  }, [settingsRestored, sidebarOpen, sidebarTab]);
  const [vocabWords, setVocabWords] = useState<VocabularyWord[]>([]);
  const [vocabFetchError, setVocabFetchError] = useState(false);
  const [vocabRetryTick, setVocabRetryTick] = useState(0);
  // Base forms plus every recorded surface form — the reader underlines and
  // recognizes the exact forms met in the text (owner design, 2026-08-26).
  const vocabWordsSet = useMemo(
    () =>
      new Set(
        vocabWords.flatMap((v) => [
          v.word.toLowerCase(),
          ...v.occurrences
            .map((o) => o.surface_form?.toLowerCase())
            .filter((s): s is string => !!s),
        ]),
      ),
    [vocabWords],
  );
  const [vocabView, setVocabView] = useState<"chapter" | "book">("chapter");
  const [notesView, setNotesView] = useState<"chapter" | "all">("chapter");
  const [collapsedNoteChapters, setCollapsedNoteChapters] = useState<Set<number>>(new Set());
  // Word definition tooltip (shown when "Word" is clicked in SelectionToolbar)
  const [vocabTooltip, setVocabTooltip] = useState<{ word: string; context: string; rect: DOMRect } | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Immersive mode — on mobile, hide header/toolbar; tap to toggle
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [translateExpanded, setTranslateExpanded] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobileRef = useRef(false);
  useEffect(() => {
    isMobileRef.current = window.innerWidth < 768;
    if (isMobileRef.current) {
      const t = setTimeout(() => setToolbarVisible(false), 2500);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const el = document.getElementById("reader-scroll");
    if (!el) return;
    function onScroll() {
      if (!isMobileRef.current) return;
      setToolbarVisible(false);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading, chapterIndex]);

  function handleReaderTap(e: React.MouseEvent | React.TouchEvent) {
    if (!isMobileRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-seg]") || target.closest("select") || target.closest("button") || target.closest("a")) return;

    // Tap zones: left 20% → prev chapter, right 20% → next chapter, center → toggle toolbar
    const clientX = "clientX" in e ? e.clientX : (e as React.TouchEvent).changedTouches?.[0]?.clientX ?? 0;
    const width = window.innerWidth;
    if (clientX < width * 0.2) {
      if (chapterIndex > 0) goToChapter(chapterIndex - 1);
      return;
    }
    if (clientX > width * 0.8) {
      if (chapterIndex < chapters.length - 1) goToChapter(chapterIndex + 1);
      return;
    }
    setNotesExpanded(false);
    setTranslateExpanded(false);
    setToolbarVisible((v) => !v);
  }

  // Chat sheet (mobile bottom dialog) ref — needed for focus management
  const chatSheetRef = useRef<HTMLDivElement>(null);
  useFocusTrap(chatSheetRef, sidebarOpen || !!chatSheetText);

  // Move focus into the chat sheet when it opens; restore on close (WCAG 2.4.3)
  useEffect(() => {
    const open = sidebarOpen || !!chatSheetText;
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    chatSheetRef.current?.focus();
    return () => { prev?.focus?.(); };
  }, [sidebarOpen, chatSheetText]);

  // Dismiss chat sheet on Escape (WAI-ARIA dialog pattern)
  useEffect(() => {
    const open = sidebarOpen || !!chatSheetText;
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setSidebarOpen(false); setChatSheetText(null); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen, chatSheetText]);

  // Swipe gesture for chapter navigation
  const swipeStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (!isMobileRef.current) return;
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isMobileRef.current || !swipeStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;
    const dt = Date.now() - swipeStartRef.current.t;
    swipeStartRef.current = null;

    // Must be fast (<500ms), horizontal (>80px), and not too vertical
    if (dt > 500 || Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    if (dx > 0 && chapterIndex > 0) {
      goToChapter(chapterIndex - 1);
    } else if (dx < 0 && chapterIndex < chapters.length - 1) {
      goToChapter(chapterIndex + 1);
    }
  }

  function onResizeStart(e: React.MouseEvent) {
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      if (!isResizing.current) return;
      // Dragging left → larger sidebar; right → smaller
      const delta = resizeStartX.current - ev.clientX;
      setSidebarWidth(Math.max(240, Math.min(700, resizeStartWidth.current + delta)));
    }
    function onUp() {
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Settings-seeded default for translation (insight lang is read directly in InsightChat)


  // Gemini key reminder — fetch live status so we don't rely on the stale session JWT
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean | null>(null); // null = not yet loaded
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [hasDeepseekKey, setHasDeepseekKey] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [geminiReminderVisible, setGeminiReminderVisible] = useState(false);
  const geminiReminderShown = useRef(false);

  // Re-fetched when the translate or chat tab opens so a key saved in the
  // profile (possibly in another tab) unlocks providers without a reload
  // (owner report, 2026-08-27: DeepSeek stayed disabled after saving its key).
  useEffect(() => {
    if (!session?.backendToken && session !== undefined) return;
    getMe().then((me) => {
      setHasGeminiKey(me.hasGeminiKey);
      setHasClaudeKey(me.hasClaudeKey);
      setHasDeepseekKey(me.hasDeepseekKey);
      setIsAdmin(me.role === "admin");
    }).catch(() => {
      // Leave hasGeminiKey as null on failure — notifyAIUsed checks === false
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.backendToken, sidebarOpen && (sidebarTab === "translate" || sidebarTab === "chat")]);

  function notifyAIUsed() {
    // Remind only when NO provider key exists at all — a Claude/DeepSeek-only
    // setup is fully usable and should not be nagged about Gemini.
    if (hasGeminiKey === false && !hasClaudeKey && !hasDeepseekKey && !geminiReminderShown.current) {
      geminiReminderShown.current = true;
      setGeminiReminderVisible(true);
    }
  }

  // Translation state
  const translationCache = useRef(new Map<string, { paragraphs: string[]; label: string }>());
  const currentChapterKey = useRef<string>(""); // tracks which chapter is currently displayed
  // Applied after mount to keep server and client first renders identical
  // (same hydration hazard as the sidebar state above).
  const [translationEnabled, setTranslationEnabled] = useState<boolean>(false);
  const [translationLang, setTranslationLang] = useState<string>("en");
  useEffect(() => {
    const s = getSettings();
    if (s.translationEnabled) setTranslationEnabled(true);
    if (s.showOthersShares) setShowShares(true);
    // Target language is PER BOOK (owner, 2026-08-26: "sometimes you want
    // this book in one language and another book in another") — the profile
    // preference only seeds the first visit.
    let lang = s.translationLang;
    try {
      const perBook = localStorage.getItem(`translation-lang:${bookId}`);
      if (perBook) lang = perBook;
    } catch { /* private mode */ }
    setTranslationLang(lang);
  }, [bookId]);
  // ── Story shares (design: user-translations.md phase 2, #2752) ──
  // Off by default — reading stays calm unless the reader opts in.
  const [showShares, setShowShares] = useState(false);
  const [chapterStories, setChapterStories] = useState<Story[]>([]);
  const [postsDialog, setPostsDialog] = useState<{ paraIdx: number; position: { x: number; y: number } } | null>(null);
  const [storiesVersion, setStoriesVersion] = useState(0);
  const [shareDialog, setShareDialog] = useState<
    | { kind: "note"; annotationId: number }
    | { kind: "translation"; paraIdx: number; sessionId: number; sessionName: string; text: string; lang?: string }
    | null
  >(null);
  const [shareCaption, setShareCaption] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  // Per-paragraph retranslate asks first — it costs tokens and replaces
  // the current rendering (owner, 2026-08-28).
  const [confirmRetransPara, setConfirmRetransPara] = useState<number | null>(null);

  const setBookTranslationLang = (lang: string) => {
    setTranslationLang(lang);
    try { localStorage.setItem(`translation-lang:${bookId}`, lang); } catch { /* private mode */ }
  };


  // Translation stories anchor to paragraphs (margin count markers); note
  // stories anchor to their SENTENCE (WeRead pattern, owner 2026-08-27) and
  // render as dashed underlines + a superscript dot in the text itself.
  const storiesByPara = useMemo(() => {
    const map: Record<number, Story[]> = {};
    for (const st of chapterStories) {
      if (st.kind === "translation" && st.paragraph_start != null && st.paragraph_end != null) {
        for (let i = st.paragraph_start; i <= st.paragraph_end; i++) (map[i] ??= []).push(st);
      }
    }
    return map;
  }, [chapterStories]);

  const postParagraphs = useMemo(
    () => new Set(Object.keys(storiesByPara).map(Number)),
    [storiesByPara],
  );
  const sharedNoteAnchors = useMemo(
    () =>
      chapterStories
        .filter((st) => st.kind === "note" && st.sentence_text)
        .map((st) => ({ sentenceText: st.sentence_text!.trim(), count: 1 })),
    [chapterStories],
  );
  const [sharedNotesFor, setSharedNotesFor] = useState<{ sentenceText: string; position: { x: number; y: number } | null } | null>(null);
  const sharedNotesStories = useMemo(
    () =>
      sharedNotesFor == null
        ? []
        : poolNoteStories(chapterStories, sharedNotesFor.sentenceText),
    [chapterStories, sharedNotesFor],
  );

  async function handleShare() {
    if (!shareDialog || shareBusy) return;
    setShareBusy(true);
    try {
      const caption = shareCaption.trim() ? { caption: shareCaption.trim() } : {};
      if (shareDialog.kind === "translation") {
        await createStory({
          kind: "translation", book_id: Number(bookId), chapter_index: chapterIndex,
          session_id: shareDialog.sessionId,
          paragraph_start: shareDialog.paraIdx, paragraph_end: shareDialog.paraIdx,
          ...caption,
        });
      } else await createStory({
        kind: "note", book_id: Number(bookId), chapter_index: chapterIndex,
        annotation_id: shareDialog.annotationId,
        ...caption,
      });
      setShareDialog(null);
      setShareCaption("");
      setStoriesVersion((v) => v + 1);
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Could not share.");
      setShareDialog(null);
    } finally {
      setShareBusy(false);
    }
  }
  // Translation provider removed — queue handles all translation via the admin's chain.
  const [displayMode, setDisplayMode] = useState<"parallel" | "inline">("parallel");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  // ── Translation sessions (design: docs/design/user-translations.md) ──
  const [translationSessions, setTranslationSessions] = useState<TranslationSession[]>([]);
  // After any mutation of a version's rendering, refresh stories, the
  // dialog's version texts, and (when it's the active session) the page.
  async function refreshVersionData(sessionId: number) {
    setStoriesVersion((v) => v + 1);
    if (activeSession?.id === sessionId) {
      try {
        const data = await getSessionChapter(sessionId, chapterIndex);
        applySessionChapter(data);
      } catch { /* next poll corrects */ }
    }
  }

  const [myParaVersions, setMyParaVersions] = useState<Array<{
    sessionId: number; sessionName: string; model?: string | null; text: string;
  }>>([]);
  useEffect(() => {
    if (!postsDialog || !session?.backendToken) {
      setMyParaVersions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const mine: Array<{ sessionId: number; sessionName: string; model?: string | null; text: string }> = [];
      for (const ts of translationSessions) {
        if (!ts.coverage?.[String(chapterIndex)]) continue;
        try {
          const ch = await getSessionChapter(ts.id, chapterIndex);
          const para = ch.paragraphs[String(postsDialog.paraIdx)];
          if (para?.text) mine.push({ sessionId: ts.id, sessionName: ts.name, model: para.model, text: para.text });
        } catch { /* skip this version */ }
      }
      if (!cancelled) setMyParaVersions(mine);
    })();
    return () => { cancelled = true; };
  }, [postsDialog, translationSessions, chapterIndex, session?.backendToken, storiesVersion]);


  const [activeSession, setActiveSession] = useState<TranslationSession | null>(null);
  const [sessionChapter, setSessionChapter] = useState<SessionChapter | null>(null);
  const [sessionTranslating, setSessionTranslating] = useState(false);
  const [translatingParas, setTranslatingParas] = useState<Set<number>>(new Set());
  const [paragraphEditor, setParagraphEditor] = useState<{ paraIdx: number; text: string } | null>(null);
  const [paragraphEditorError, setParagraphEditorError] = useState(false);
  // Persistent, in-panel error for session actions (owner report: a failed
  // translate showed nothing — the corner toast was too transient).
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);

  // Stories arrive in ONE call per chapter (design: no per-paragraph
  // requests). Shared notes are a reading surface, so the fetch is gated on
  // the opt-in alone — not on translation being enabled.
  useEffect(() => {
    if ((!showShares && !postsDialog && !activeSession && !annotationPanel) || !session?.backendToken) {
      setChapterStories([]);
      return;
    }
    let cancelled = false;
    listStories(Number(bookId), chapterIndex)
      .then((r) => { if (!cancelled) setChapterStories(r.stories); })
      .catch(() => { /* markers simply don't render */ });
    return () => { cancelled = true; };
  }, [showShares, postsDialog, activeSession, annotationPanel, bookId, chapterIndex, session?.backendToken, storiesVersion]);

  const activeSessionRef = useRef<TranslationSession | null>(null);
  activeSessionRef.current = activeSession;

  // Load the user's sessions for this book; restore the active one per book.
  useEffect(() => {
    if (!session?.backendToken) return;
    let cancelled = false;
    listTranslationSessions(Number(bookId))
      .then((list) => {
        if (cancelled) return;
        setTranslationSessions(list);
        try {
          const savedId = Number(localStorage.getItem(`translation-session-active:${bookId}`));
          const restored = list.find((s) => s.id === savedId) ?? null;
          setActiveSession(restored);
        } catch {}
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, session?.backendToken]);

  // Every sessionChapter write goes through this guard: a slow response
  // from a PREVIOUS version (poll tick, translate call) must never
  // overwrite the one now on screen (owner bug report, 2026-08-28:
  // switching to an empty version kept showing the old rendering).
  const applySessionChapter = useCallback((data: SessionChapter) => {
    if (activeSessionRef.current?.id !== data.session_id) return;
    setSessionChapter(data);
  }, []);

  // Fetch the active session's paragraphs for the current chapter.
  useEffect(() => {
    // Clear immediately — placeholders beat another version's stale text
    setSessionChapter(null);
    if (!activeSession) return;
    let cancelled = false;
    getSessionChapter(activeSession.id, chapterIndex)
      .then((data) => { if (!cancelled) applySessionChapter(data); })
      .catch(() => { if (!cancelled) setSessionChapter(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, chapterIndex]);

  // Poll while a background chapter run is active — paragraphs appear
  // gradually and the run survives page reloads (the server keeps going;
  // any fresh GET sees run.active and resumes the watch).
  const chapterRunActive = !!sessionChapter?.run?.active;
  useEffect(() => {
    if (!activeSession || !chapterRunActive) return;
    const timer = setInterval(() => {
      getSessionChapter(activeSession.id, chapterIndex)
        .then((data) => {
          applySessionChapter(data);
          if (data.run && !data.run.active) {
            if (data.run.error) setSessionActionError(data.run.error);
            listTranslationSessions(Number(bookId)).then(setTranslationSessions).catch(() => {});
          }
        })
        .catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, chapterIndex, chapterRunActive]);

  function selectTranslationSession(sess: TranslationSession | null) {
    setActiveSession(sess);
    try {
      if (sess) localStorage.setItem(`translation-session-active:${bookId}`, String(sess.id));
      else localStorage.removeItem(`translation-session-active:${bookId}`);
    } catch {}
  }

  async function handleSessionTranslateChapter(force = false) {
    if (!activeSession || sessionTranslating || chapterRunActive) return;
    setSessionTranslating(true);
    setSessionActionError(null);
    try {
      // Starts a background run; the polling effect renders paragraphs as
      // they finish and surfaces run errors.
      const data = await translateSession(activeSession.id, { chapter_index: chapterIndex, scope: "chapter", force });
      applySessionChapter(data);
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Translation failed — try again.");
      getSessionChapter(activeSession.id, chapterIndex).then(applySessionChapter).catch(() => {});
    } finally {
      setSessionTranslating(false);
    }
  }

  async function handleSessionTranslateParagraph(paraIdx: number) {
    if (!activeSession) return;
    setTranslatingParas((prev) => new Set(prev).add(paraIdx));
    setSessionActionError(null);
    try {
      const data = await translateSession(activeSession.id, { chapter_index: chapterIndex, scope: paraIdx });
      applySessionChapter(data);
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Translation failed — try again.");
    } finally {
      setTranslatingParas((prev) => { const next = new Set(prev); next.delete(paraIdx); return next; });
    }
  }

  async function handleParagraphEditSave() {
    if (!activeSession || !paragraphEditor) return;
    setParagraphEditorError(false);
    try {
      await editSessionParagraph(activeSession.id, chapterIndex, paragraphEditor.paraIdx, paragraphEditor.text);
      const data = await getSessionChapter(activeSession.id, chapterIndex);
      applySessionChapter(data);
      setParagraphEditor(null);
    } catch {
      setParagraphEditorError(true);
    }
  }

  async function handleSessionDeleteParagraph(paraIdx: number) {
    if (!activeSession) return;
    try {
      await deleteSessionParagraph(activeSession.id, chapterIndex, paraIdx);
      const data = await getSessionChapter(activeSession.id, chapterIndex);
      applySessionChapter(data);
    } catch (e) {
      setSessionActionError(e instanceof Error ? e.message : "Delete failed — try again.");
    }
  }

  // Session paragraphs as the reader's translations[] contract: undefined
  // gaps render the explicit session placeholder (never editorial mixing).
  const sessionTranslations = useMemo(() => {
    if (!activeSession || !sessionChapter) return null;
    const arr: (string | undefined)[] = new Array(sessionChapter.paragraph_count).fill(undefined);
    for (const [idx, p] of Object.entries(sessionChapter.paragraphs)) {
      arr[Number(idx)] = p.text;
    }
    return arr;
  }, [activeSession, sessionChapter]);

  const sessionMeta = useMemo(() => {
    if (!sessionChapter) return undefined;
    const meta: Record<number, { model: string; edited: boolean }> = {};
    for (const [idx, p] of Object.entries(sessionChapter.paragraphs)) {
      meta[Number(idx)] = { model: p.model, edited: p.edited_by_user };
    }
    return meta;
  }, [sessionChapter]);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationUsedProvider, setTranslationUsedProvider] = useState<string>("");
  const [bookTranslationStatus, setBookTranslationStatus] = useState<TranslationStatus | null>(null);

  // Which chapters the Contents panel should mark as translated (#2754).
  // undefined — not the empty set — when coverage is unknown, so the panel
  // stays silent instead of claiming nothing is translated.
  const translatedChapters = useMemo(
    () =>
      bookTranslationStatus?.translated_indices
        ? new Set(bookTranslationStatus.translated_indices)
        : undefined,
    [bookTranslationStatus],
  );

  // Front-matter labels for the Contents panel (#2755). undefined when no
  // chapter carries one, so the panel renders no group at all rather than an
  // empty header — an unfrozen book has no artifact to read labels from.
  const chapterRoles = useMemo(() => {
    const entries = chapters
      .map((c, index) => [index, c.role] as const)
      .filter(([, role]) => !!role);
    return entries.length
      ? Object.fromEntries(entries as ReadonlyArray<readonly [number, string]>)
      : undefined;
  }, [chapters]);
  // Which languages have editorial translations at all — shown as chips so
  // nobody has to cycle target languages to discover coverage (owner,
  // 2026-08-27).
  const [editorialLanguages, setEditorialLanguages] = useState<BookTranslationLanguages | null>(null);

  // Reader display settings
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [theme, setTheme] = useState<Theme>("light");
  const [lineHeight, setLineHeight] = useState<LineHeight>("normal");
  const [contentWidth, setContentWidth] = useState<ContentWidth>("normal");
  const [fontFamily, setFontFamily] = useState<FontFamily>("serif");
  const [scrollProgress, setScrollProgress] = useState(0);

  // Immersive reading state
  const [focusMode, setFocusMode] = useState(false);
  const [paragraphFocus, setParagraphFocus] = useState(false);
  const [focusParagraphIdx, setFocusParagraphIdx] = useState(0);
  const [paragraphTimings, setParagraphTimings] = useState<{ startTime: number; stopTime: number }[]>([]);
  const [ttsStopAt, setTtsStopAt] = useState<number | undefined>();
  const [showTypographyPanel, setShowTypographyPanel] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<string | null>(null);

  // Shortcuts panel container ref — used to close panel on click-outside
  const shortcutsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showShortcuts) return;
    function handleClick(e: MouseEvent) {
      if ((e.target as HTMLElement).closest("[data-shortcuts-trigger]")) return;
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setShowShortcuts(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showShortcuts]);

  // Read settings on mount (translationLang uses lazy useState above)
  useEffect(() => {
    const s = getSettings();
    // translationProvider setting is retained for back-compat but no longer read here.
    setFontSize(s.fontSize);
    setTheme(s.theme);
    setLineHeight(s.lineHeight ?? "normal");
    setContentWidth(s.contentWidth ?? "normal");
    setFontFamily(s.fontFamily ?? "serif");
    setParagraphFocus(s.paragraphFocus ?? false);
  }, []);

  // Apply theme and display settings to the document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-font-size", fontSize);
    document.documentElement.setAttribute("data-line-height", lineHeight);
    document.documentElement.setAttribute("data-content-width", contentWidth);
    document.documentElement.setAttribute("data-font-family", fontFamily);
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-font-size");
      document.documentElement.removeAttribute("data-line-height");
      document.documentElement.removeAttribute("data-content-width");
      document.documentElement.removeAttribute("data-font-family");
    };
  }, [theme, fontSize, lineHeight, contentWidth, fontFamily]);

  // Track scroll progress
  useEffect(() => {
    const el = document.getElementById("reader-scroll");
    if (!el) return;
    function onScroll() {
      const { scrollTop, scrollHeight, clientHeight } = el!;
      const progress = scrollHeight <= clientHeight ? 100 : Math.round((scrollTop / (scrollHeight - clientHeight)) * 100);
      setScrollProgress(progress);
    }
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading, chapterIndex]);

  function cycleFontSize() {
    const sizes: FontSize[] = ["sm", "base", "lg", "xl"];
    const next = sizes[(sizes.indexOf(fontSize) + 1) % sizes.length];
    setFontSize(next);
    saveSettings({ fontSize: next });
  }

  function cycleTheme() {
    const themes: Theme[] = ["light", "sepia", "dark"];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(next);
    saveSettings({ theme: next });
  }

  useEffect(() => {
    if (!bookId || chaptersCache.has(bookId)) return;
    setLoading(true);
    getBookChapters(Number(bookId))
      .then((data) => {
        chaptersCache.set(bookId, data.chapters);
        metaCache.set(bookId, data.meta);
        sourceCache.set(bookId, data.chapter_source);
        setChapters(data.chapters);
        setMeta(data.meta);
        setChapterSource(data.chapter_source);
        const savedChapter = getLastChapter(Number(bookId));
        // ?chapter=N from deep-links takes priority over last-read progress
        const urlChapter = searchParams?.get("chapter");
        const urlChapterIdx = urlChapter !== null ? parseInt(urlChapter, 10) : NaN;
        const targetChapter = !isNaN(urlChapterIdx) ? urlChapterIdx : savedChapter;
        const clampedTarget = Math.min(targetChapter, data.chapters.length - 1);
        setChapterIndex(clampedTarget);
        recordRecentBook(data.meta, clampedTarget);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  // Update page title when book metadata loads (WCAG 2.4.2)
  useEffect(() => {
    if (!meta?.title) return;
    document.title = `${meta.title} — Book Reader AI`;
    return () => { document.title = "My Library — Book Reader AI"; };
  }, [meta]);

  // Load annotations for this book (requires auth)
  useEffect(() => {
    if (!bookId || !session?.backendToken) return;
    setAnnotationsLoading(true);
    setAnnotationsError(false);
    getAnnotations(Number(bookId))
      .then(setAnnotations)
      .catch(() => setAnnotationsError(true))
      .finally(() => setAnnotationsLoading(false));
  }, [bookId, session?.backendToken, annotationsRetryTick]);

  // Fetch vocabulary words for this book
  useEffect(() => {
    if (!session?.backendToken) return;
    setVocabWords([]);
    setVocabFetchError(false);
    getVocabulary().then((words) => {
      setVocabWords(words.filter((w) => w.occurrences.some((o) => o.book_id === Number(bookId))));
    }).catch(() => setVocabFetchError(true));
  }, [bookId, session?.backendToken, vocabRetryTick]);

  // On initial chapter load, scroll to sentence specified in ?sentence= URL param
  useEffect(() => {
    if (loading || didUrlScrollRef.current) return;
    const sentence = searchParams?.get("sentence");
    if (!sentence) return;
    didUrlScrollRef.current = true;
    const decoded = decodeURIComponent(sentence);
    setTimeout(() => {
      setScrollTargetSentence(undefined);
      setTimeout(() => setScrollTargetSentence(decoded), 50);
    }, 500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const bookLanguage = meta?.languages[0] || "en";

  // Auto-translate when enabled or chapter/lang changes.
  //
  // Queue-only flow (no on-demand Gemini calls from the reader):
  //   1. Check the in-memory cache → instant hit.
  //   2. POST /books/{id}/chapters/{idx}/translation. Backend returns
  //      either the cached paragraphs (status=ready) or queue status
  //      (pending / running). Reader-initiated enqueues get priority=10
  //      so they jump ahead of admin auto-enqueues.
  //   3. While the queue is working, show the "queued · position N"
  //      state and poll every 3s until status=ready.
  //
  // This replaces the previous per-paragraph translate loop — admins
  // stop double-spending tokens and all translation work flows through
  // the single queue (same model chain, same rate limits).
  // Reset translationLang when bookLanguage is known and they coincide.
  useEffect(() => {
    // Wait for the stored language to be applied — on mount bookLanguage
    // defaults to "en" and translationLang starts at "en", so running early
    // clobbered the user's stored choice with available[0] ("de").
    if (!settingsRestored || !bookLanguage) return;
    const available = LANGUAGES.filter((l) => l.code !== bookLanguage);
    if (translationLang === bookLanguage && available.length > 0) {
      setTranslationLang(available[0].code);
    }
  }, [settingsRestored, bookLanguage, translationLang]);

  // Eagerly hide the "Translate this chapter" button before the browser paints
  // when we know an async server check is about to run. Without this, the button
  // flashes briefly between the render that enabled translation and the useEffect
  // that sets translationLoading=true.
  useLayoutEffect(() => {
    if (!translationEnabled || !chapters[chapterIndex]?.text) return;
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    if (!translationCache.current.has(cacheKey)) {
      setTranslationLoading(true);
      setTranslationUsedProvider("");
      setTranslatedParagraphs([]);
      setTranslatedTitle(null);
    }
  }, [translationEnabled, translationLang, chapterIndex, bookId, chapters]);

  // Load from in-memory cache when translation is enabled and chapter/lang changes.
  // After a cache miss, checks server queue status — auto-loads if already done,
  // shows queue banner if in-progress, shows button only if not yet requested.
  useEffect(() => {
    const current = chapters[chapterIndex];
    if (!translationEnabled || !current?.text) {
      setTranslatedParagraphs([]);
      setTranslatedTitle(null);
      setTranslationLoading(false);
      setTranslationUsedProvider("");
      return;
    }
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    currentChapterKey.current = cacheKey;

    if (translationCache.current.has(cacheKey)) {
      const cached = translationCache.current.get(cacheKey)!;
      setTranslatedParagraphs(cached.paragraphs);
      setTranslationUsedProvider(cached.label);
      return;
    }

    // Clear stale state while checking server
    setTranslatedParagraphs([]);
    setTranslatedTitle(null);
    setTranslationLoading(true);
    setTranslationUsedProvider("");

    let cancelled = false;
    const bid = Number(bookId);

    (async () => {
      // First: check if server already has a cached translation (GET, never enqueues)
      try {
        const res = await getChapterTranslation(bid, chapterIndex, translationLang);
        if (cancelled || currentChapterKey.current !== cacheKey) return;
        if (res.status === "ready" && res.paragraphs) {
          const label = res.model ? `cache · ${res.model}` : "cache";
          translationCache.current.set(cacheKey, { paragraphs: res.paragraphs, label });
          setTranslatedParagraphs(res.paragraphs);
          setTranslatedTitle(res.title_translation ?? null);
          setTranslationUsedProvider(label);
          setTranslationLoading(false);
          return;
        }
      } catch {
        // 404 = not cached yet; other errors fall through to show button
      }
      // Not cached: editorial translations are produced offline (local-first,
      // #2624) — nothing to request online; the status line explains the gap.
      if (!cancelled && currentChapterKey.current === cacheKey) {
        setTranslationLoading(false);
        setTranslationUsedProvider("none");
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, chapterIndex, bookId, chapters]);

  useEffect(() => {
    let cancelled = false;
    getBookTranslationLanguages(Number(bookId))
      .then((data) => { if (!cancelled) setEditorialLanguages(data); })
      .catch(() => { if (!cancelled) setEditorialLanguages(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // Editorial coverage for the status display — a single fetch per
  // (book, language); the queue-era 15s polling is gone with the queue UI.
  useEffect(() => {
    if (!translationEnabled) { setBookTranslationStatus(null); return; }
    let cancelled = false;
    getBookTranslationStatus(Number(bookId), translationLang)
      .then((status) => { if (!cancelled) setBookTranslationStatus(status); })
      .catch(() => { if (!cancelled) setBookTranslationStatus(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, bookId]);


  const handleSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectedText(sel.length > 2 ? sel : "");
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if focus is on an editable element or anchor — let the element handle its own keys.
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "A") return;
      // For buttons: allow ArrowLeft/ArrowRight chapter navigation UNLESS focus is inside a
      // toolbar (toolbar components handle their own roving-tabindex arrow navigation).
      if (tag === "BUTTON") {
        const insideToolbar = !!el?.closest?.('[role="toolbar"]');
        if (insideToolbar || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      }

      // In word-select mode: ←/→/H/L navigate words; Enter opens vocab tooltip; Esc returns to sentence mode.
      if (wordSelectMode) {
        if (e.key === "ArrowLeft" || e.key === "h" || e.key === "H") {
          e.preventDefault();
          setSelectedWordIdx((prev) => Math.max(0, (prev ?? 0) - 1));
          return;
        }
        if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
          e.preventDefault();
          if (selectedSentenceFlatIdx !== null) {
            const segEl = document.querySelector<HTMLElement>(`[data-seg="${selectedSentenceFlatIdx}"]`);
            const wordCount = (segEl?.textContent?.trim() ?? "").split(/\s+/).filter(Boolean).length;
            setSelectedWordIdx((prev) => Math.min(wordCount - 1, (prev ?? 0) + 1));
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (selectedSentenceFlatIdx !== null && selectedWordIdx !== null && session?.backendToken) {
            const segEl = document.querySelector<HTMLElement>(`[data-seg="${selectedSentenceFlatIdx}"]`);
            const sentenceText = segEl?.textContent?.trim() ?? "";
            const words = sentenceText.split(/\s+/).filter(Boolean);
            const rawWord = words[selectedWordIdx] ?? "";
            const word = rawWord
              .replace(/^[^a-zA-ZÀ-ɏЀ-ӿ]+/, "")
              .replace(/[^a-zA-ZÀ-ɏЀ-ӿ]+$/, "");
            if (word.length >= 2) {
              const wordEl = document.querySelector<HTMLElement>(`[data-word-idx="${selectedWordIdx}"]`);
              const rect = wordEl?.getBoundingClientRect() ?? new DOMRect();
              setVocabTooltip({ word, context: sentenceText, rect });
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setWordSelectMode(false);
          setSelectedWordIdx(null);
          return;
        }
      }

      // In sentence-selection mode, ↑/↓/J/K navigate; W enters word mode; Enter annotates; Esc exits.
      if (sentenceSelectMode) {
        if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
          e.preventDefault();
          const segs = Array.from(document.querySelectorAll<HTMLElement>("[data-seg]"))
            .map((el) => Number(el.getAttribute("data-seg")))
            .sort((a, b) => a - b);
          const cur = segs.indexOf(selectedSentenceFlatIdx ?? segs[0]);
          const next = segs[Math.max(0, cur - 1)];
          setSelectedSentenceFlatIdx(next);
          document.querySelector(`[data-seg="${next}"]`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
          e.preventDefault();
          const segs = Array.from(document.querySelectorAll<HTMLElement>("[data-seg]"))
            .map((el) => Number(el.getAttribute("data-seg")))
            .sort((a, b) => a - b);
          const cur = segs.indexOf(selectedSentenceFlatIdx ?? -1);
          const next = segs[Math.min(segs.length - 1, cur + 1)];
          setSelectedSentenceFlatIdx(next);
          document.querySelector(`[data-seg="${next}"]`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "w" || e.key === "W") {
          e.preventDefault();
          if (selectedSentenceFlatIdx !== null) {
            const segEl = document.querySelector<HTMLElement>(`[data-seg="${selectedSentenceFlatIdx}"]`);
            const wordCount = (segEl?.textContent?.trim() ?? "").split(/\s+/).filter(Boolean).length;
            if (wordCount > 0) {
              setWordSelectMode(true);
              setSelectedWordIdx(0);
            }
          }
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (selectedSentenceFlatIdx !== null) {
            const el = document.querySelector<HTMLElement>(`[data-seg="${selectedSentenceFlatIdx}"]`);
            const sentenceText = el?.textContent?.trim() ?? "";
            if (sentenceText && session?.backendToken) {
              setAnnotationPanel({ sentenceText, chapterIndex });
            }
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSentenceSelectMode(false);
          setSelectedSentenceFlatIdx(null);
          setWordSelectMode(false);
          setSelectedWordIdx(null);
          document.getElementById("reader-scroll")?.focus();
          return;
        }
      }

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        if (sentenceSelectMode) {
          setSentenceSelectMode(false);
          setSelectedSentenceFlatIdx(null);
          setWordSelectMode(false);
          setSelectedWordIdx(null);
          document.getElementById("reader-scroll")?.focus();
        } else {
          const segs = Array.from(document.querySelectorAll<HTMLElement>("[data-seg]"))
            .map((el) => Number(el.getAttribute("data-seg")))
            .sort((a, b) => a - b);
          if (segs.length > 0) {
            setSentenceSelectMode(true);
            setSelectedSentenceFlatIdx(segs[0]);
            document.querySelector(`[data-seg="${segs[0]}"]`)?.scrollIntoView({ block: "nearest" });
          }
        }
      } else if (e.key === "ArrowLeft" && chapterIndex > 0) {
        e.preventDefault();
        goToChapter(chapterIndex - 1);
      } else if (e.key === "ArrowRight" && chapterIndex < chapters.length - 1) {
        e.preventDefault();
        goToChapter(chapterIndex + 1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setSidebarTab("toc");
        setSidebarOpen((v) => (sidebarTab === "toc" ? !v : true));
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setFocusMode((v) => {
          if (!v) setSidebarOpen(false);
          return !v;
        });
        setShowTypographyPanel(false);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        if (ttsIsPlayingRef.current) {
          ttsControlsRef.current?.pause();
        } else {
          ttsControlsRef.current?.play();
        }
      } else if (e.key === "Escape") {
        if (focusMode) { e.preventDefault(); setFocusMode(false); }
        setShowTypographyPanel(false);
        setShowShortcuts(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [chapterIndex, chapters, focusMode, sentenceSelectMode, selectedSentenceFlatIdx, wordSelectMode, selectedWordIdx, session]);

  function goToChapter(index: number) {
    setChapterIndex(index);
    router.replace(`/reader/${bookId}?chapter=${index}`, { scroll: false });
    saveLastChapter(Number(bookId), index);
    if (session?.backendToken) {
      saveReadingProgress(Number(bookId), index).catch(() => {});
    }
    setSelectedText("");
    setTranslatedParagraphs([]);
    setTranslatedTitle(null);
    setTranslationUsedProvider("");
    setTtsCurrentTime(0);
    setTtsDuration(0);
    setTtsIsPlaying(false);
    setTtsChunks([]);
    document.getElementById("reader-scroll")?.scrollTo(0, 0);
  }

  // Vocabulary save handler. `baseForm` is the word's dictionary form when the
  // caller already resolved one; the backend looks it up otherwise (#2663).
  async function handleWordSave(
    word: string,
    sentenceText: string,
    baseForm?: string,
    definition?: WordDefinition | null,
  ) {
    const resolved = baseForm?.trim();
    try {
      await saveVocabularyWord({
        // Only send `lemma` when a base form was actually resolved — sending the
        // surface word would suppress the backend's own lookup.
        ...(resolved ? { lemma: resolved } : {}),
        // The meaning the tooltip already fetched, stored once at save time so
        // clicking the word again costs no lookup (#2704).
        ...(definition?.definitions?.length
          ? {
              definitions: definition.definitions,
              form_of: definition.form_of ?? null,
              definition_url: definition.url ?? null,
              definition_lang: definition.definition_lang ?? null,
            }
          : {}),
        word,
        book_id: Number(bookId),
        chapter_index: chapterIndex,
        sentence_text: sentenceText,
      });
      setVocabToastWord(resolved || word);
      // Refresh sidebar word list
      getVocabulary().then((words) => {
        setVocabWords(words.filter((w) => w.occurrences.some((o) => o.book_id === Number(bookId))));
      }).catch(() => {});
    } catch {
      // silently ignore (user may not be logged in)
    }
  }

  // On mobile: auto-show auth modal when translation is blocked for guests
  useEffect(() => {
    if (session?.backendToken) return;
    if (translationUsedProvider !== "login required") return;
    const isMobile = window.innerWidth < 768;
    if (isMobile) setAuthPrompt("translate books");
  }, [translationUsedProvider, session?.backendToken]);

  // Paragraph focus handlers
  function handleParagraphVisible(idx: number) {
    if (!ttsIsPlaying) setFocusParagraphIdx(idx);
  }
  function handleActiveParagraphChange(idx: number) {
    if (ttsIsPlaying) setFocusParagraphIdx(idx);
  }
  function readFocusedParagraph() {
    const timing = paragraphTimings[focusParagraphIdx];
    if (!timing) return;
    const startTime = Number.isFinite(timing.startTime) ? timing.startTime : 0;
    const stopTime = Number.isFinite(timing.stopTime) ? timing.stopTime : undefined;
    setTtsStopAt(stopTime);
    // seekTo repositions audio.currentTime and activeIndexRef synchronously
    // (the sync part runs before any await), then play() starts playback from
    // that position. Without play(), seekTo only repositions and stays paused.
    ttsSeekRef.current(startTime);
    ttsControlsRef.current?.play();
  }

  // Obsidian export handler
  async function handleObsidianExport() {
    try {
      const { urls } = await exportVocabularyToObsidian(Number(bookId));
      setObsidianToast({ msg: urls[0] || "Exported successfully", ok: true });
      setTimeout(() => setObsidianToast(null), 6000);
    } catch (e) {
      setObsidianToast({ msg: e instanceof Error ? e.message : "Export failed", ok: false });
      setTimeout(() => setObsidianToast(null), 4000);
    }
  }

  const current = chapters[chapterIndex];
  const chapterParagraphs = current?.text
    ? current.text.split(/\n\n+/).filter((p) => p.trim())
    : [];

  function retryChapterLoad() {
    setError("");
    setLoading(true);
    chaptersCache.delete(bookId);
    getBookChapters(Number(bookId))
      .then((data) => {
        chaptersCache.set(bookId, data.chapters);
        metaCache.set(bookId, data.meta);
        sourceCache.set(bookId, data.chapter_source);
        setChapters(data.chapters);
        setMeta(data.meta);
        setChapterSource(data.chapter_source);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  return (
    <main id="main-content" className="relative h-screen bg-parchment flex flex-col overflow-hidden">
      {/* ── Gemini key reminder banner ───────────────────────────────────── */}
      {geminiReminderVisible && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-4 text-sm text-amber-800">
          <span>
            AI features require your own API key (Gemini, Claude, or DeepSeek).{" "}
            <a
              href="/profile"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium hover:text-amber-900 min-h-[44px] md:min-h-0 inline-flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Add a key in your profile<span className="sr-only"> (opens in new tab)</span>
            </a>{" "}
            to enable them.
          </span>
          <button
            onClick={() => setGeminiReminderVisible(false)}
            className="shrink-0 text-amber-700 hover:text-amber-900 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            aria-label="Dismiss"
          >
            <CloseIcon aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Focus Mode HUD (desktop) ────────────────────────────────────── */}
      {focusMode && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto mt-2 flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-amber-200 rounded-full px-3 py-1.5 shadow-lg text-xs text-ink">
            <button
              aria-label="Previous chapter"
              onClick={() => chapterIndex > 0 && goToChapter(chapterIndex - 1)}
              disabled={chapterIndex === 0}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-amber-50 disabled:opacity-30 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            ><ArrowLeftIcon className="w-3 h-3" aria-hidden="true" /> Prev</button>
            <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
            <span
              className="text-stone-600 max-w-[180px] truncate font-medium"
              title={chapters[chapterIndex]?.title || `Ch. ${chapterIndex + 1}`}
            >
              {chapters[chapterIndex]?.title || `Ch. ${chapterIndex + 1}`}
            </span>
            <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
            <button
              aria-label="Next chapter"
              onClick={() => chapterIndex < chapters.length - 1 && goToChapter(chapterIndex + 1)}
              disabled={chapterIndex === chapters.length - 1}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-amber-50 disabled:opacity-30 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >Next <ArrowRightIcon className="w-3 h-3" aria-hidden="true" /></button>
            {paragraphFocus && (
              <>
                <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
                <button
                  onClick={ttsIsPlaying ? undefined : readFocusedParagraph}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-amber-50 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  aria-label={ttsIsPlaying ? "Playing paragraph" : "Read focused paragraph"}
                  title={ttsIsPlaying ? "Playing…" : "Read focused paragraph"}
                >
                  {ttsIsPlaying ? <><PauseIcon className="w-3 h-3 shrink-0" /> Playing</> : <><PlayIcon className="w-3 h-3 shrink-0" /> Read para</>}
                </button>
              </>
            )}
            <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTypographyAnchorPos({ x: rect.right, y: rect.bottom });
                setShowTypographyPanel((v) => !v);
              }}
              aria-label="Typography settings"
              aria-expanded={showTypographyPanel}
              aria-controls="typography-panel"
              className="px-2 py-1 rounded-full hover:bg-amber-50 transition-colors font-bold min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
              title="Typography"
            >Aa</button>
            <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              aria-label="Keyboard shortcuts" aria-expanded={showShortcuts} aria-controls="focus-hotkeys-panel" title="Keyboard shortcuts (?)" data-shortcuts-trigger="true"
              className={`flex items-center justify-center w-7 h-7 rounded-full min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                showShortcuts ? "bg-amber-100 text-amber-800" : "hover:bg-amber-50 text-stone-600"
              }`}
            ><KeyboardIcon className="w-3.5 h-3.5" aria-hidden="true" /></button>
            <span className="text-stone-400 mx-0.5" aria-hidden="true">|</span>
            <button
              onClick={() => setFocusMode(false)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full hover:bg-red-50 text-stone-600 hover:text-red-600 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
              aria-label="Exit focus mode"
              title="Exit focus mode (F)"
            ><CloseIcon className="w-3 h-3" aria-hidden="true" /> Focus</button>
          </div>
        </div>
      )}

      {/* ── Shortcuts panel for focus mode (fixed, outside hidden header) ── */}
      {focusMode && showShortcuts && (
        <div id="focus-hotkeys-panel" role="region" aria-label="Keyboard shortcuts" className="fixed right-4 top-16 z-50 w-56 bg-white border border-amber-200 rounded-xl shadow-lg p-3 animate-fade-in">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-600 mb-2">Keyboard Shortcuts</p>
          <div className="space-y-1.5">
            {[
              { keys: ["Space"], label: "Play / Pause TTS" },
              { keys: ["←", "→"], label: "Previous / Next chapter" },
              { keys: ["F"], label: "Toggle focus mode" },
              { keys: ["T"], label: "Table of contents" },
              { keys: ["?"], label: "Show this panel" },
              { keys: ["N"], label: "Sentence selection mode" },
              { keys: ["W"], label: "Word mode (in N mode)" },
              { keys: ["Esc"], label: "Close panels" },
            ].map(({ keys, label }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-stone-600">{label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {keys.map((k) => (
                    <kbd key={k} className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded border border-stone-200 bg-stone-50 text-[10px] font-mono text-stone-600">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`border-b border-amber-200 bg-white/70 backdrop-blur shrink-0 transition-all duration-300 ${
        (!toolbarVisible || focusMode) ? "max-h-0 overflow-hidden opacity-0 border-b-0" : "max-h-[300px] opacity-100"
      } ${focusMode ? "" : "md:!max-h-none md:!opacity-100 md:!overflow-visible md:!border-b"}`}>
        {/* Row 1: nav + title + controls */}
        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3">
          <Link
            href="/"
            aria-label="Library"
            className="text-amber-700 hover:text-amber-900 text-sm shrink-0 min-h-[44px] md:min-h-0 flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <ArrowLeftIcon className="w-4 h-4 shrink-0" aria-hidden="true" /><span className="hidden sm:inline ml-1">Library</span>
          </Link>

          <div className="min-w-0 flex-1">
            {meta ? (
              <>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <h1 className="font-serif font-bold text-ink truncate text-sm" title={meta.title}>{meta.title}</h1>
                  {chapterSource === "upload" && (
                    <span
                      className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-0.5 leading-none"
                      title="Uploaded book — chapters from your own file"
                    >
                      Uploaded
                    </span>
                  )}
                  {chapterSource === "epub" && (
                    <span
                      className="shrink-0 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 leading-none"
                      title="Rendered from the Gutenberg EPUB (spine + TOC)"
                    >
                      EPUB
                    </span>
                  )}
                  {chapterSource === "text" && (
                    <span
                      className="shrink-0 text-[10px] font-medium text-stone-600 bg-stone-100 border border-stone-200 rounded px-1 py-0.5 leading-none"
                      title="Rendered from the Gutenberg plain-text edition (no EPUB available yet)"
                    >
                      Plain text
                    </span>
                  )}
                  {meta.source !== "upload" && (
                    <a
                      href={`https://www.gutenberg.org/ebooks/${meta.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-amber-700 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                      title="View on Project Gutenberg"
                      aria-label="View on Project Gutenberg (opens in new tab)"
                    ><ArrowUpRightIcon className="w-3 h-3" aria-hidden="true" /></a>
                  )}
                </div>
                <p className="text-xs text-amber-700 truncate" title={meta.authors.join(", ")}>{meta.authors.join(", ")}</p>
              </>
            ) : (
              <div className="h-4 w-48 bg-amber-200 animate-pulse rounded" aria-hidden="true" />
            )}
          </div>

          {/* Chapter navigation — desktop only (mobile uses bottom bar) */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {loading ? (
              <span role="status" className="text-xs text-amber-700 animate-pulse">Loading…</span>
            ) : (
              <>
                <button
                  onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                  disabled={chapterIndex === 0}
                  aria-label="Previous chapter"
                  className="w-7 h-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded-lg border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-amber-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  <ArrowLeftIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setSidebarTab("toc"); setSidebarOpen((v) => sidebarTab === "toc" ? !v : true); }}
                  title="Table of contents"
                  aria-label="Table of contents"
                  aria-pressed={sidebarOpen && sidebarTab === "toc"}
                  className={`flex items-center gap-1.5 max-w-[200px] text-xs rounded-lg border px-2.5 py-1.5 min-h-[44px] md:min-h-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                    sidebarOpen && sidebarTab === "toc"
                      ? "bg-amber-700 text-white border-amber-700"
                      : "border-amber-300 text-ink bg-white hover:border-amber-400"
                  }`}
                >
                  <ListViewIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    {chapterIndex + 1}. {chapters[chapterIndex]?.title || `Section ${chapterIndex + 1}`}
                  </span>
                </button>
                <button
                  onClick={() => goToChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
                  disabled={chapterIndex === chapters.length - 1}
                  aria-label="Next chapter"
                  className="w-7 h-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded-lg border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-amber-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                >
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Typography panel — desktop only */}
          <div className="hidden md:block">
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTypographyAnchorPos({ x: rect.right, y: rect.bottom });
                setShowTypographyPanel((v) => !v);
              }}
              title="Typography settings"
              aria-label="Typography settings"
              aria-expanded={showTypographyPanel}
              aria-controls="typography-panel"
              className={`flex shrink-0 items-center gap-1 px-2 py-1 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                showTypographyPanel || paragraphFocus
                  ? "bg-amber-100 border-amber-400 text-amber-800"
                  : "border-amber-300 hover:bg-amber-100 text-amber-700"
              }`}
            >
              <span className="font-serif">Aa</span>
            </button>
          </div>

          {/* Theme — desktop only */}
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme} — click to cycle`}
            aria-label={`Theme: ${theme} — click to cycle`}
            className="hidden md:flex shrink-0 items-center gap-1.5 px-2 py-1 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 hover:bg-amber-100 text-xs text-amber-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            {theme === "light" ? <SunIcon className="w-3.5 h-3.5" /> : theme === "sepia" ? <SepiaIcon className="w-3.5 h-3.5" /> : <MoonIcon className="w-3.5 h-3.5" />}
            <span className="hidden lg:inline capitalize text-[9px] font-sans">{theme}</span>
          </button>

          {/* ── Feature buttons — desktop only ────────────────────────── */}

          {/* Insight chat toggle */}
          <button
            onClick={() => { setSidebarTab("chat"); setSidebarOpen((v) => sidebarTab === "chat" ? !v : true); }}
            title="Toggle insight chat"
            aria-label="Insight sidebar"
            aria-pressed={sidebarOpen && sidebarTab === "chat"}
            className={`hidden md:flex shrink-0 items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
              sidebarOpen && (sidebarTab === "chat")
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <ChatIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Insight</span>
          </button>

          {/* Translate toggle */}
          <button
            onClick={() => { setSidebarTab("translate"); setSidebarOpen((v) => sidebarTab === "translate" ? !v : true); }}
            title="Translation"
            aria-label="Translate"
            aria-pressed={sidebarOpen && sidebarTab === "translate"}
            className={`hidden md:flex shrink-0 items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
              sidebarOpen && sidebarTab === "translate"
                ? "bg-amber-700 text-white border-amber-700"
                : translationEnabled
                  ? "bg-amber-100 text-amber-900 border-amber-400"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <GlobeIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Translate</span>
          </button>

          {/* Notes sidebar toggle */}
          <button
            onClick={() => {
              if (!session?.backendToken) { setAuthPrompt("save annotations and notes"); return; }
              setSidebarTab("notes"); setSidebarOpen((v) => sidebarTab === "notes" ? !v : true);
            }}
            title="Annotations & notes"
            aria-label={annotations.length > 0 ? `Annotations & notes (${annotations.length})` : "Annotations & notes"}
            aria-pressed={sidebarOpen && sidebarTab === "notes"}
            className={`relative hidden md:flex shrink-0 items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
              sidebarOpen && sidebarTab === "notes"
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <NoteIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Notes</span>
            {annotations.length > 0 && (
              <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-800 text-white text-[9px] font-bold px-1">
                {annotations.length}
              </span>
            )}
          </button>

          {/* Show/hide annotation marks — lg+ only */}
          {session?.backendToken && (
            <button
              onClick={() => {
                const next = !showShares;
                setShowShares(next);
                saveSettings({ showOthersShares: next });
              }}
              aria-pressed={showShares}
              title={showShares ? "Hide community notes" : "Show community notes"}
              className={`hidden lg:flex shrink-0 items-center gap-1.5 px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                showShares
                  ? "bg-amber-100 text-amber-900 border-amber-400"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-900"
              }`}
            >
              <BookmarkIcon className="w-3.5 h-3.5 shrink-0" />
              {showShares ? "Shares on" : "Shares off"}
            </button>
          )}

          {/* Vocabulary sidebar */}
          <button
            onClick={() => {
              if (!session?.backendToken) { setAuthPrompt("save vocabulary"); return; }
              setSidebarTab("vocab"); setSidebarOpen((v) => sidebarTab === "vocab" ? !v : true);
            }}
            title="Vocabulary"
            aria-label={vocabWords.length > 0 ? `Vocabulary (${vocabWords.length} words)` : "Vocabulary"}
            aria-pressed={sidebarOpen && sidebarTab === "vocab"}
            className={`relative hidden md:flex shrink-0 items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
              sidebarOpen && sidebarTab === "vocab"
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <BookOpenIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Vocab</span>
            {vocabWords.length > 0 && (
              <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-800 text-white text-[9px] font-bold px-1">
                {vocabWords.length}
              </span>
            )}
          </button>

          {/* Export vocabulary to Obsidian — lg+ only */}
          {session?.backendToken && (
            <button
              onClick={handleObsidianExport}
              title="Export vocabulary to Obsidian"
              aria-label="Export vocabulary to Obsidian"
              className="hidden lg:flex shrink-0 items-center gap-1.5 px-3 py-1.5 min-h-[44px] lg:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <ExportIcon className="w-3.5 h-3.5 shrink-0" />
              Obsidian
            </button>
          )}

          {/* Focus mode toggle — desktop only */}
          <button
            onClick={() => {
              setFocusMode((v) => {
                if (!v) setSidebarOpen(false);
                return !v;
              });
              setShowTypographyPanel(false);
            }}
            title="Focus mode (F)"
            aria-label="Focus mode"
            aria-pressed={focusMode}
            className={`hidden md:flex shrink-0 items-center gap-1.5 px-2 lg:px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
              focusMode
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <FocusIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Focus</span>
          </button>

          {/* Keyboard shortcuts help — desktop only */}
          <div ref={shortcutsRef} className="relative hidden md:block">
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
              aria-expanded={showShortcuts}
              aria-controls="shortcuts-panel"
              data-shortcuts-trigger="true"
              className={`flex shrink-0 items-center justify-center w-7 h-7 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                showShortcuts
                  ? "bg-amber-100 border-amber-400 text-amber-800"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-900"
              }`}
            >
              <KeyboardIcon className="w-3.5 h-3.5" />
            </button>
            {showShortcuts && (
              <div id="shortcuts-panel" role="region" aria-label="Keyboard shortcuts" className="absolute right-0 top-full mt-2 w-56 bg-white border border-amber-200 rounded-xl shadow-lg z-50 p-3 animate-fade-in">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-600 mb-2">Keyboard Shortcuts</p>
                <div className="space-y-1.5">
                  {[
                    { keys: ["Space"], label: "Play / Pause TTS" },
                    { keys: ["←", "→"], label: "Previous / Next chapter" },
                    { keys: ["F"], label: "Toggle focus mode" },
                    { keys: ["?"], label: "Show this panel" },
                    { keys: ["N"], label: "Sentence selection mode" },
                    { keys: ["W"], label: "Word mode (in N mode)" },
                    { keys: ["Esc"], label: "Close panels" },
                  ].map(({ keys, label }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-stone-600">{label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {keys.map((k) => (
                          <kbd key={k} className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded border border-stone-200 bg-stone-50 text-[10px] font-mono text-stone-600">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile / Sign-in — always rightmost */}
          {session?.backendToken ? (
            <Link
              href="/profile"
              title={session.backendUser?.name ?? "Profile"}
              aria-label={session.backendUser?.name ?? "Profile"}
              className="shrink-0 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 w-10 h-10 md:w-8 md:h-8 rounded-full overflow-hidden border border-amber-300 hover:border-amber-500 transition-colors ml-auto md:ml-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              {session.backendUser?.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.backendUser.picture} alt="" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-amber-100 text-amber-700 text-xs font-bold">
                  {session.backendUser?.name?.[0] ?? "?"}
                </span>
              )}
            </Link>
          ) : (
            <a
              href="/api/auth/signin"
              className="shrink-0 ml-auto md:ml-0 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Sign in
            </a>
          )}
        </div>
      </header>

      {/* ── Banners (hidden in immersive mode on mobile) ──────────────── */}
      <div className={`shrink-0 transition-all duration-300 ${
        !toolbarVisible ? "max-h-0 overflow-hidden opacity-0" : "max-h-[500px] opacity-100"
      } md:!max-h-none md:!opacity-100 md:!overflow-visible`}>
      {/* Per-chapter queue banner — when THIS chapter is awaiting the
          background worker. More prominent than the small status line
          in the toolbar because the user actively cares about it while
          waiting. Hidden once the translation lands (translationLoading
          goes false when translatedParagraphs arrives). */}
      {translationEnabled &&
        translationLoading &&
        translationUsedProvider &&
        translationUsedProvider.startsWith("queue") && (
          <div role="status" className="bg-sky-50 border-b border-sky-200 px-4 py-2 text-xs text-sky-800 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" aria-hidden="true" />
            <span>
              <strong>Translation queued</strong> — {translationUsedProvider}.
              The background worker is processing this chapter; translated
              paragraphs will appear below when ready.
            </span>
          </div>
        )}

      {/* Login required notice — shown when translation is not cached and user is not logged in */}
      {translationEnabled && translationUsedProvider === "login required" && (
        <div role="status" className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span>
            Translation requires an account.{" "}
            <a href="/api/auth/signin" className="underline font-medium hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded">
              Sign in
            </a>{" "}
            to translate this chapter.
          </span>
        </div>
      )}

      {/* Gemini key required notice — shown when logged in but no API key configured */}
      {translationEnabled && translationUsedProvider === "gemini key required" && (
        <div role="status" className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span>
            Translation requires a Gemini API key.{" "}
            <Link
              href="/profile"
              className="underline font-medium hover:text-amber-900 rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-600"
            >
              Add your Gemini API key in Settings
            </Link>{" "}
            to start translating.
          </span>
        </div>
      )}

      </div>{/* end banners wrapper */}

      {/* Reading progress bar — always visible, even in immersive mode */}
      {chapters.length > 0 && (
        <div
          className="h-1 bg-amber-100/80"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(((chapterIndex + scrollProgress / 100) / chapters.length) * 100)}
          aria-label="Reading progress"
          title={`${Math.round(((chapterIndex + scrollProgress / 100) / chapters.length) * 100)}% through book`}
        >
          <div
            className="h-full bg-amber-500 transition-all duration-200 rounded-r-full"
            style={{ width: `${((chapterIndex + scrollProgress / 100) / chapters.length) * 100}%` }}
          />
        </div>
      )}

      {/* Screen-reader announcement for chapter navigation (WCAG 4.1.3) */}
      <span
        id="chapter-announce"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {chapters[chapterIndex]
          ? `Chapter ${chapterIndex + 1}${chapters[chapterIndex].title ? `: ${chapters[chapterIndex].title}` : ""}`
          : ""}
      </span>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sentence-selection mode status — sr-only live region for screen readers (WCAG 4.1.3)
            + visible strip for sighted keyboard users (closes #2588) */}
        {sentenceSelectMode && !wordSelectMode && (
          <>
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              Sentence selection mode active. Use J/K or arrow keys to navigate, Enter to annotate, W for word mode, N or Escape to exit.
            </div>
            <div
              data-testid="sentence-select-status"
              className="sentence-select-indicator fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-stone-800/90 text-white text-xs rounded-full shadow-lg backdrop-blur animate-fade-in pointer-events-none select-none"
            >
              <span className="font-medium text-amber-300">Sentence selection</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">J</kbd>/<kbd className="font-mono">K</kbd> navigate</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">Enter</kbd> annotate</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">W</kbd> word mode</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">Esc</kbd> exit</span>
            </div>
          </>
        )}
        {wordSelectMode && (
          <>
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              Word selection mode active. Use H/L or arrow keys to navigate words, Enter to look up, Escape to return to sentence mode.
            </div>
            <div
              data-testid="word-select-status"
              className="word-select-indicator fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 bg-stone-800/90 text-white text-xs rounded-full shadow-lg backdrop-blur animate-fade-in pointer-events-none select-none"
            >
              <span className="font-medium text-purple-300">Word selection</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">H</kbd>/<kbd className="font-mono">L</kbd> navigate</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">Enter</kbd> look up</span>
              <span className="text-stone-400" aria-hidden="true">·</span>
              <span><kbd className="font-mono">Esc</kbd> exit</span>
            </div>
          </>
        )}
        {/* Reader */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div
            id="reader-scroll"
            lang={bookLanguage}
            tabIndex={0}
            className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8 pb-16 md:pb-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
            onClick={handleReaderTap}
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => { handleTouchEnd(e); handleSelection(); }}
            onMouseUp={handleSelection}
          >
            {loading ? (
              <div role="status" aria-label="Loading chapter" className="max-w-prose mx-auto space-y-3 animate-pulse">
                <span className="sr-only">Loading chapter...</span>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className={`h-4 bg-amber-200 rounded ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
                ))}
              </div>
            ) : error ? (
              <div role="alert" className="max-w-prose mx-auto text-center py-16 px-4">
                <BookOpenIcon className="w-10 h-10 text-amber-300 mx-auto mb-4" aria-hidden="true" />
                <h2 className="font-serif text-lg text-ink mb-2">Failed to load chapter</h2>
                <p className="text-sm text-stone-600 mb-6">{error}</p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={retryChapterLoad}
                    className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-sm hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                  >
                    Retry
                  </button>
                  <Link
                    href="/"
                    className="px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 text-sm hover:bg-amber-50 transition-colors inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  >
                    Back to library
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Chapter heading — shows original title always; translated title below when available */}
                {current?.title && (
                  <div className="prose-reader mx-auto mb-8 text-center" data-testid="reader-chapter-heading">
                    <h2 className="font-serif font-semibold text-lg text-ink/80">
                      {current.title}
                    </h2>
                    {translationEnabled && translatedTitle && (
                      <p className="font-serif text-base text-amber-700 mt-1">
                        {translatedTitle}
                      </p>
                    )}
                  </div>
                )}
                <SentenceReader
                  text={current?.text ?? ""}
                  duration={ttsDuration}
                  currentTime={ttsCurrentTime}
                  isPlaying={ttsIsPlaying}
                  chunks={ttsChunks.length > 0 ? ttsChunks : undefined}
                  disabled={ttsIsLoading}
                  translations={translationEnabled ? ((activeSession && sessionTranslations ? sessionTranslations : translatedParagraphs) as string[]) : undefined}
                  translationDisplayMode={displayMode}
                  translationLang={translationEnabled ? (activeSession ? activeSession.target_language : translationLang) : undefined}
                  translationLoading={activeSession ? false : translationLoading}
                  sessionMode={translationEnabled && !!activeSession}
                  translationMeta={sessionMeta}
                  translatingParagraphs={translatingParas}
                  actionsDisabled={sessionTranslating || chapterRunActive}
                  onTranslateParagraph={activeSession ? (idx) => setConfirmRetransPara(idx) : undefined}
                  postParagraphs={showShares && postParagraphs.size > 0 ? postParagraphs : undefined}
                  sharedNotes={showShares && sharedNoteAnchors.length > 0 ? sharedNoteAnchors : undefined}
                  onSharedNotesClick={showShares ? (sentenceText, position) => setSharedNotesFor({ sentenceText, position }) : undefined}
                  annotations={session?.backendToken ? annotations.filter((a) => a.chapter_index === chapterIndex) : undefined}
                  chapterIndex={chapterIndex}
                  onAnnotationClick={session?.backendToken ? (annotation, position) => {
                    setQuickHighlightPanel({
                      sentenceText: annotation.sentence_text,
                      chapterIndex: annotation.chapter_index,
                      position,
                      existingAnnotation: annotation,
                    });
                  } : undefined}
                  scrollTargetSentence={scrollTargetSentence}
                  scrollTargetWord={searchParams?.get("word") ? decodeURIComponent(searchParams.get("word")!) : undefined}
                  vocabWords={vocabWordsSet}
                  onVocabWordClick={session?.backendToken ? (word, sentenceText, rect) => {
                    setVocabTooltip({ word, context: sentenceText, rect });
                  } : undefined}
                  onSegmentClick={(startTime) => {
                    ttsSeekRef.current(startTime);
                  }}
                  onAnnotate={session?.backendToken ? (text, ci) => {
                    setAnnotationPanel({ sentenceText: text, chapterIndex: ci });
                  } : undefined}
                  selectedSentenceFlatIdx={selectedSentenceFlatIdx}
                  wordSelectMode={wordSelectMode}
                  selectedWordIdx={selectedWordIdx}
                  focusParagraphIdx={paragraphFocus ? focusParagraphIdx : undefined}
                  paragraphFocusEnabled={paragraphFocus}
                  onParagraphVisible={handleParagraphVisible}
                  onActiveParagraphChange={handleActiveParagraphChange}
                  onParagraphTimingsUpdate={setParagraphTimings}
                />
                <div className={`mt-10 flex justify-between ${translationEnabled && displayMode === "parallel" ? "max-w-7xl mx-auto" : "prose-reader mx-auto"}`}>
                  <button
                    data-testid="bottom-prev-chapter"
                    onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                    disabled={chapterIndex === 0}
                    className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30 min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  ><ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Previous chapter</button>
                  <span className="text-xs text-amber-700 self-center">
                    {chapterIndex + 1} / {chapters.length} · {Math.round(((chapterIndex + 1) / chapters.length) * 100)}%
                  </span>
                  <button
                    data-testid="bottom-next-chapter"
                    onClick={() => goToChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
                    disabled={chapterIndex === chapters.length - 1}
                    className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30 min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  >Next chapter <ArrowRightIcon className="w-4 h-4" aria-hidden="true" /></button>
                </div>
              </>
            )}
          </div>


          {/* Selection toolbar — appears when user selects text */}
          <SelectionToolbar
            translationLang={translationEnabled ? (activeSession?.target_language ?? translationLang) : undefined}
            onTranslationNote={session?.backendToken ? (paraIdx, rect) => {
              setPostsDialog({
                paraIdx,
                position: { x: rect.left + rect.width / 2, y: rect.bottom },
              });
            } : undefined}
            onRead={(text, lang) => {
              const wasPlaying = ttsIsPlayingRef.current;
              if (wasPlaying) ttsControlsRef.current?.pause();
              synthesizeSpeech(text, lang ?? bookLanguage, 1.0, getSettings().ttsGender)
                .then(({ url }) => {
                  const audio = new Audio(url);
                  const resume = () => {
                    URL.revokeObjectURL(url);
                    if (wasPlaying) ttsControlsRef.current?.play();
                  };
                  audio.onended = resume;
                  audio.onerror = resume;
                  audio.play().catch(resume);
                })
                .catch(() => {
                  window.speechSynthesis.cancel();
                  const utter = new SpeechSynthesisUtterance(text);
                  utter.lang = lang ?? bookLanguage;
                  utter.onend = () => { if (wasPlaying) ttsControlsRef.current?.play(); };
                  window.speechSynthesis.speak(utter);
                });
            }}
            onHighlight={session?.backendToken ? (text) => {
              let position = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
              try {
                const sel = window.getSelection();
                const rect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
                if (rect && (rect.width > 0 || rect.height > 0)) {
                  position = { x: rect.left + rect.width / 2, y: rect.bottom };
                }
              } catch { /* ignore — selection not available in test environments */ }
              setQuickHighlightPanel({ sentenceText: text, chapterIndex, position });
            } : undefined}
            onNote={session?.backendToken ? (text) => {
              setAnnotationPanel({ sentenceText: text, chapterIndex });
            } : undefined}
            onChat={(text) => {
              setChatSheetText(text);
              setSelectedText(text);
              setSidebarTab("chat");
              setSidebarOpen(true);
            }}
            onVocab={session?.backendToken ? (word, context, rect) => setVocabTooltip({ word, context, rect }) : undefined}
          />

          {/* Annotation toolbar (full note editor) */}
          {annotationPanel && (
            <AnnotationToolbar
              sentenceText={annotationPanel.sentenceText}
              chapterIndex={annotationPanel.chapterIndex}
              bookId={Number(bookId)}
              bookLanguage={bookLanguage}
              existingAnnotation={annotations.find(
                (a) =>
                  a.sentence_text === annotationPanel.sentenceText &&
                  a.chapter_index === annotationPanel.chapterIndex,
              )}
              onClose={() => setAnnotationPanel(null)}
              onSaved={(annotation) => {
                setAnnotations((prev) => {
                  const idx = prev.findIndex((a) => a.id === annotation.id);
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = annotation;
                    return next;
                  }
                  return [...prev, annotation];
                });
                setSavedAnnotationMsg(annotation.note_text ? "Note saved" : "Highlight saved");
                setTimeout(() => setSavedAnnotationMsg(""), 2000);
              }}
              onDeleted={(id) => {
                const ann = annotations.find((a) => a.id === id);
                setAnnotations((prev) => prev.filter((a) => a.id !== id));
                if (ann) setDeletedAnnotationToast(ann);
              }}
              initialVisibility={(() => {
                const existing = annotations.find(
                  (a) => a.sentence_text === annotationPanel.sentenceText &&
                    a.chapter_index === annotationPanel.chapterIndex,
                );
                if (!existing) return "public"; // new notes default public
                return chapterStories.some(
                  (st) => st.kind === "note" && st.user_id === session?.backendUser?.id &&
                    st.annotation_id === existing.id,
                ) ? "public" : "private";
              })()}
              onVisibilityChange={session?.backendToken ? async (annotation, makePublic) => {
                const post = chapterStories.find(
                  (st) => st.kind === "note" && st.user_id === session?.backendUser?.id &&
                    st.annotation_id === annotation.id,
                );
                if (makePublic && !post) {
                  await createStory({
                    kind: "note", book_id: Number(bookId),
                    chapter_index: annotation.chapter_index, annotation_id: annotation.id,
                  });
                } else if (!makePublic && post) {
                  await deleteStory(post.id);
                }
                setStoriesVersion((v) => v + 1);
              } : undefined}
            />
          )}

          {/* Quick highlight panel — color-only, instant save */}
          {quickHighlightPanel && (
            <QuickHighlightPanel
              sentenceText={quickHighlightPanel.sentenceText}
              chapterIndex={quickHighlightPanel.chapterIndex}
              bookId={Number(bookId)}
              position={quickHighlightPanel.position}
              existingAnnotation={quickHighlightPanel.existingAnnotation}
              onClose={() => setQuickHighlightPanel(null)}
              onSaved={(annotation) => {
                setAnnotations((prev) => {
                  const idx = prev.findIndex((a) => a.id === annotation.id);
                  if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = annotation;
                    return next;
                  }
                  return [...prev, annotation];
                });
                setSavedAnnotationMsg("Highlight applied");
                setTimeout(() => setSavedAnnotationMsg(""), 2000);
              }}
              onDeleted={(id) => {
                const ann = annotations.find((a) => a.id === id);
                setAnnotations((prev) => prev.filter((a) => a.id !== id));
                if (ann) setDeletedAnnotationToast(ann);
              }}
              onOpenNote={() => {
                setQuickHighlightPanel(null);
                setAnnotationPanel({
                  sentenceText: quickHighlightPanel.sentenceText,
                  chapterIndex: quickHighlightPanel.chapterIndex,
                });
              }}
            />
          )}

          {/* Session paragraph editor (design: docs/design/user-translations.md) */}
          {confirmRetransPara != null && activeSession && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="Confirm retranslate">
              <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-sm space-y-3" style={{ boxShadow: "var(--shadow-card-hover)" }}>
                <p className="text-sm font-medium text-ink">Retranslate paragraph {confirmRetransPara + 1}?</p>
                <p className="text-xs text-stone-500">
                  The current rendering will be replaced and this costs tokens on your {activeSession.provider === "claude" ? "Claude" : "DeepSeek"} key.
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setConfirmRetransPara(null)}
                    className="text-sm px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-200 text-stone-600 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const idx = confirmRetransPara;
                      setConfirmRetransPara(null);
                      handleSessionTranslateParagraph(idx);
                    }}
                    className="text-sm px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Retranslate
                  </button>
                </div>
              </div>
            </div>
          )}

          {shareDialog && (
            <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" role="dialog" aria-label="Share">
              <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-md space-y-3" style={{ boxShadow: "var(--shadow-card-hover)" }}>
                <p className="text-sm font-medium text-ink">
                  {shareDialog.kind === "translation" ? "Share this translation" : "Post this note"}
                </p>
                <p className="text-xs text-stone-500">Other readers of this book will see it.</p>
                {shareDialog.kind === "translation" && (
                  <blockquote className="border-l-2 border-amber-300 bg-amber-50/60 rounded-r-lg px-3 py-2 space-y-1" data-testid="share-quote">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">{shareDialog.sessionName}</span>
                    <p lang={shareDialog.lang} className="text-[13px] leading-relaxed font-serif text-ink whitespace-pre-wrap">
                      {shareDialog.text}
                    </p>
                  </blockquote>
                )}
                <textarea
                  value={shareCaption}
                  onChange={(e) => setShareCaption(e.target.value)}
                  placeholder="Say something under the quote (optional)…"
                  aria-label="Share caption"
                  rows={2}
                  className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShareDialog(null)}
                    className="text-sm px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-200 text-stone-600 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleShare}
                    disabled={shareBusy}
                    className="text-sm px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    {shareBusy ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {sharedNotesFor != null && sharedNotesStories.length > 0 && (
            <StoryPanel
              stories={sharedNotesStories}
              paragraphIndex={0}
              title="Notes on this sentence"
              variant="sentence"
              myNote={(() => {
                const own = annotations.find(
                  (a) => a.chapter_index === chapterIndex &&
                    (anchorsOverlap(a.sentence_text, sharedNotesFor.sentenceText) ||
                      sharedNotesStories.some((st) => anchorsOverlap(a.sentence_text, st.sentence_text!))),
                );
                if (!own) return null;
                const myNoteStory = sharedNotesStories.find(
                  (st) => st.user_id === session?.backendUser?.id && st.annotation_id === own.id,
                );
                return {
                  text: own.note_text,
                  authorName: session?.backendUser?.name ?? "You",
                  picture: session?.backendUser?.picture,
                  storyId: myNoteStory?.id,
                };
              })()}
              annotationBar={(() => {
                const own = annotations.find(
                  (a) => a.chapter_index === chapterIndex &&
                    (anchorsOverlap(a.sentence_text, sharedNotesFor.sentenceText) ||
                      sharedNotesStories.some((st) => anchorsOverlap(a.sentence_text, st.sentence_text!))),
                );
                return {
                  existingColor: own?.color ?? null,
                  onColor: async (color: "yellow" | "blue" | "green" | "pink") => {
                    try {
                      if (own) {
                        const saved = await updateAnnotation(own.id, { color, note_text: own.note_text });
                        setAnnotations((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
                      } else {
                        const saved = await createAnnotation({
                          book_id: Number(bookId),
                          chapter_index: chapterIndex,
                          sentence_text: sharedNotesFor.sentenceText,
                          note_text: "",
                          color,
                        });
                        setAnnotations((prev) => [...prev, saved]);
                      }
                    } catch { /* transient — next tap retries */ }
                  },
                };
              })()}
              onEditMyNoteExternally={() => {
                const own = annotations.find(
                  (a) => a.chapter_index === chapterIndex &&
                    (anchorsOverlap(a.sentence_text, sharedNotesFor.sentenceText) ||
                      sharedNotesStories.some((st) => anchorsOverlap(a.sentence_text, st.sentence_text!))),
                );
                setSharedNotesFor(null);
                setAnnotationPanel({
                  sentenceText: own?.sentence_text ?? sharedNotesFor.sentenceText,
                  chapterIndex: own?.chapter_index ?? chapterIndex,
                });
              }}
              onSaveMyNote={async (text, makePublic) => {
                const own = annotations.find(
                  (a) => a.chapter_index === chapterIndex &&
                    (anchorsOverlap(a.sentence_text, sharedNotesFor.sentenceText) ||
                      sharedNotesStories.some((st) => anchorsOverlap(a.sentence_text, st.sentence_text!))),
                );
                let anno = own;
                if (own) {
                  const saved = await updateAnnotation(own.id, { color: own.color, note_text: text });
                  setAnnotations((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
                } else {
                  anno = await createAnnotation({
                    book_id: Number(bookId),
                    chapter_index: chapterIndex,
                    sentence_text: sharedNotesFor.sentenceText,
                    note_text: text,
                    color: "yellow",
                  });
                  setAnnotations((prev) => [...prev, anno!]);
                }
                // Visibility from the editor's dropdown (owner, 2026-08-28)
                const notePost = anno ? chapterStories.find(
                  (st) => st.kind === "note" && st.user_id === session?.backendUser?.id && st.annotation_id === anno!.id,
                ) : undefined;
                if (makePublic && anno && !notePost) {
                  await createStory({
                    kind: "note", book_id: Number(bookId),
                    chapter_index: anno.chapter_index, annotation_id: anno.id,
                  });
                } else if (!makePublic && notePost) {
                  await deleteStory(notePost.id);
                }
                setStoriesVersion((v) => v + 1);
              }}
              onDeleteMyNote={async () => {
                const own = annotations.find(
                  (a) => a.chapter_index === chapterIndex &&
                    (anchorsOverlap(a.sentence_text, sharedNotesFor.sentenceText) ||
                      sharedNotesStories.some((st) => anchorsOverlap(a.sentence_text, st.sentence_text!))),
                );
                if (!own) return;
                await deleteAnnotation(own.id);
                setAnnotations((prev) => prev.filter((a) => a.id !== own.id));
              }}
              position={sharedNotesFor.position}
              currentUserId={session?.backendUser?.id}
              onClose={() => setSharedNotesFor(null)}
              onChanged={() => setStoriesVersion((v) => v + 1)}
            />
          )}

          {postsDialog != null && (
            <StoryPanel
              stories={storiesByPara[postsDialog.paraIdx] ?? []}
              paragraphIndex={postsDialog.paraIdx}
              title="Posts on this paragraph"
              variant="sentence"
              position={postsDialog.position}
              myVersions={myParaVersions.map((v) => {
                const post = (storiesByPara[postsDialog.paraIdx] ?? []).find(
                  (st) => st.user_id === session?.backendUser?.id && st.session_id === v.sessionId,
                );
                return {
                  sessionName: v.sessionName, model: v.model, text: v.text,
                  posted: !!post, storyId: post?.id,
                  isCurrent: v.sessionId === activeSession?.id,
                  authorName: session?.backendUser?.name ?? "You",
                  picture: session?.backendUser?.picture,
                  onSave: async (text: string, makePublic: boolean) => {
                    await editSessionParagraph(v.sessionId, chapterIndex, postsDialog.paraIdx, text);
                    if (makePublic && !post) {
                      await createStory({
                        kind: "translation", book_id: Number(bookId), chapter_index: chapterIndex,
                        session_id: v.sessionId,
                        paragraph_start: postsDialog.paraIdx, paragraph_end: postsDialog.paraIdx,
                      });
                    } else if (!makePublic && post) {
                      await deleteStory(post.id);
                    }
                    await refreshVersionData(v.sessionId);
                  },
                  onDelete: async () => {
                    if (post) await deleteStory(post.id);
                    await deleteSessionParagraph(v.sessionId, chapterIndex, postsDialog.paraIdx);
                    await refreshVersionData(v.sessionId);
                  },
                  onShare: () => {
                    setPostsDialog(null);
                    setShareCaption("");
                    setShareDialog({
                      kind: "translation", paraIdx: postsDialog.paraIdx,
                      sessionId: v.sessionId, sessionName: v.sessionName, text: v.text,
                      lang: translationSessions.find((ts) => ts.id === v.sessionId)?.target_language,
                    });
                  },
                  onRetranslate: post ? undefined : async () => {
                    await translateSession(v.sessionId, { chapter_index: chapterIndex, scope: postsDialog.paraIdx });
                    await refreshVersionData(v.sessionId);
                  },
                };
              })}
              commentsTab={(() => {
                // The Comments tab is the CURRENT rendering's comment list
                // (owner design, 2026-08-30): editorial paragraphs are
                // anchors of their own; a posted version anchors on its
                // post; a private version has no public anchor yet.
                const langLabel = LANGUAGES.find((l) => l.code === translationLang)?.label ?? translationLang;
                if (!activeSession) {
                  return {
                    label: `Editorial · ${langLabel} · this paragraph`,
                    content: translatedParagraphs[postsDialog.paraIdx]
                      ? { text: translatedParagraphs[postsDialog.paraIdx], lang: translationLang, sessionName: "Editorial" }
                      : undefined,
                    anchor: {
                      kind: "editorial" as const,
                      editorial: {
                        book_id: Number(bookId),
                        target_language: translationLang,
                        chapter_index: chapterIndex,
                        paragraph_index: postsDialog.paraIdx,
                      },
                    },
                    emptyText: "",
                  };
                }
                const myPost = (storiesByPara[postsDialog.paraIdx] ?? []).find(
                  (st) => st.user_id === session?.backendUser?.id && st.session_id === activeSession.id,
                );
                const myPara = sessionChapter?.paragraphs[String(postsDialog.paraIdx)];
                const myIdx = myParaVersions.findIndex((v) => v.sessionId === activeSession.id);
                return {
                  label: `${activeSession.name} · this paragraph`,
                  content: myPara?.text
                    ? {
                        text: myPara.text, lang: activeSession.target_language,
                        sessionName: activeSession.name, model: myPara.model,
                        myVersionIndex: myIdx >= 0 ? myIdx : undefined,
                      }
                    : undefined,
                  anchor: myPost ? { kind: "story" as const, storyId: myPost.id } : undefined,
                  emptyText: "Your rendering isn't posted yet — publish it under Other translations to receive comments.",
                };
              })()}
              currentUserId={session?.backendUser?.id}
              onClose={() => setPostsDialog(null)}
              onChanged={() => setStoriesVersion((v) => v + 1)}
            />
          )}

          {paragraphEditor && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Edit translation paragraph">
              <div className="bg-white rounded-xl border border-amber-200 shadow-xl p-4 w-full max-w-lg space-y-3">
                <p className="text-sm font-medium text-ink">Edit translation · paragraph {paragraphEditor.paraIdx + 1}</p>
                <textarea
                  aria-label="Translation text"
                  value={paragraphEditor.text}
                  onChange={(e) => setParagraphEditor({ ...paragraphEditor, text: e.target.value })}
                  rows={6}
                  className="w-full text-sm font-serif border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setParagraphEditor(null)}
                    className="px-3 py-1.5 min-h-[44px] md:min-h-0 text-sm text-stone-600 hover:text-stone-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleParagraphEditSave}
                    className="px-4 py-1.5 min-h-[44px] md:min-h-0 text-sm rounded-lg bg-amber-700 text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
                  >
                    Save
                  </button>
                </div>
                {paragraphEditorError && (
                  <p role="alert" className="text-xs text-red-600">Couldn&apos;t save — try again.</p>
                )}
              </div>
            </div>
          )}

          {/* Word definition tooltip */}
          {vocabTooltip && (
            <VocabWordTooltip
              word={vocabTooltip.word}
              lang={bookLanguage}
              rect={vocabTooltip.rect}
              savedWords={vocabWordsSet}
              onClose={() => setVocabTooltip(null)}
              onSave={(wordToSave, definition) => {
                handleWordSave(vocabTooltip.word, vocabTooltip.context, wordToSave, definition);
                setVocabTooltip(null);
              }}
            />
          )}

          {/* Annotation undo error */}
          {annotationUndoError && (
            <div role="alert" aria-live="assertive" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shadow-md">
              {annotationUndoError}
            </div>
          )}

          {/* Retry-failed error toast — replaces blocking alert() (#2619) */}
          {retryToast && (
            <div role="alert" aria-live="assertive" className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shadow-md">
              {retryToast}
            </div>
          )}

          {/* Annotation delete undo toast */}
          {deletedAnnotationToast && (
            <UndoToast
              message="Highlight deleted"
              onUndo={() => {
                const ann = deletedAnnotationToast;
                setDeletedAnnotationToast(null);
                if (ann && session?.backendToken) {
                  createAnnotation({
                    book_id: ann.book_id,
                    chapter_index: ann.chapter_index,
                    sentence_text: ann.sentence_text,
                    note_text: ann.note_text,
                    color: ann.color,
                  }).then((restored) => {
                    setAnnotations((prev) => [...prev, restored]);
                  }).catch(() => {
                    setAnnotationUndoError("Could not restore annotation — please try again");
                    setTimeout(() => setAnnotationUndoError(null), 5000);
                  });
                }
              }}
              onDone={() => setDeletedAnnotationToast(null)}
            />
          )}

          {/* Vocabulary save toast */}
          {vocabToastWord && (
            <VocabularyToast
              word={vocabToastWord}
              onDone={() => setVocabToastWord(null)}
              language={bookLanguage}
            />
          )}

          {/* aria-live-obsidian-toast-mirror: always-present so AT announces (WCAG 4.1.3) */}
          <span aria-live="polite" aria-atomic="true" className="sr-only">
            {obsidianToast ? (obsidianToast.msg.startsWith("http") ? `Exported to ${obsidianToast.msg}` : obsidianToast.msg) : ""}
          </span>
          {/* Annotation/highlight save confirmation for screen readers (WCAG 4.1.3) */}
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {savedAnnotationMsg}
          </span>
          {/* Obsidian export toast — visual only, conditionally mounted */}
          {obsidianToast && (
            <div className="fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-lg rounded-xl px-5 py-3 text-sm text-ink max-w-xs">
              {obsidianToast.msg.startsWith("http") ? (
                <>
                  Exported!{" "}
                  <a
                    href={obsidianToast.msg}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-700 underline break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                  >
                    {obsidianToast.msg}<span className="sr-only"> (opens in new tab)</span>
                  </a>
                </>
              ) : obsidianToast.ok ? (
                <span className="text-emerald-700">{obsidianToast.msg}</span>
              ) : (
                <span className="text-red-600">{obsidianToast.msg}</span>
              )}
            </div>
          )}

          {/* Enqueue-all toast — replaces blocking alert() (#2617) */}
          {enqueueToast?.ok && (
            <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-sm shadow-md max-w-sm text-center bg-emerald-50 border border-emerald-200 text-emerald-800">
              {enqueueToast.msg}
            </div>
          )}
          {enqueueToast && !enqueueToast.ok && (
            <div role="alert" aria-live="assertive" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl px-5 py-3 text-sm shadow-md max-w-sm text-center bg-red-50 border border-red-200 text-red-700">
              {enqueueToast.msg}
            </div>
          )}

          {/* TTS + Recorder — hidden on mobile (controlled from bottom bar) */}
          <div className="hidden md:block border-t border-amber-200 shrink-0">
            <TTSControls
              text={current?.text ?? ""}
              language={bookLanguage}
              bookId={Number(bookId)}
              chapterIndex={chapterIndex}
              onPlaybackUpdate={(currentTime, duration, isPlaying) => {
                setTtsCurrentTime(currentTime);
                setTtsDuration(duration);
                setTtsIsPlaying(isPlaying);
                ttsIsPlayingRef.current = isPlaying;
              }}
              onLoadingChange={setTtsIsLoading}
              onChunksUpdate={setTtsChunks}
              onSeekRegister={(seekFn) => {
                ttsSeekRef.current = seekFn;
              }}
              onControlsRegister={(controls) => {
                ttsControlsRef.current = controls;
              }}
              stopAtTime={paragraphFocus ? ttsStopAt : undefined}
              onStopAtReached={() => setTtsStopAt(undefined)}
            />
          </div>
        </div>

        {/* Resize handle — only visible when sidebar is open, hidden on mobile (sidebar is fullscreen there) */}
        {sidebarOpen && (
          <div
            onMouseDown={onResizeStart}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setSidebarWidth((w) => Math.max(240, w - 25));
              else if (e.key === "ArrowRight") setSidebarWidth((w) => Math.min(700, w + 25));
            }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize reader sidebar"
            aria-valuenow={sidebarWidth}
            aria-valuemin={240}
            aria-valuemax={700}
            tabIndex={0}
            className="hidden md:block w-1.5 shrink-0 cursor-col-resize bg-amber-100 hover:bg-amber-400 active:bg-amber-500 focus-visible:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset transition-colors relative group"
            title="Drag to resize"
          >
            {/* Three-dot grip indicator */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-40 group-hover:opacity-100 transition-opacity">
              <div className="w-[3px] h-[3px] rounded-full bg-amber-700" />
              <div className="w-[3px] h-[3px] rounded-full bg-amber-700" />
              <div className="w-[3px] h-[3px] rounded-full bg-amber-700" />
            </div>
          </div>
        )}

        {/* Insight/Vocab/Translate sidebar — desktop only */}
        <div
          role="complementary"
          aria-label={`${({ toc: "Contents", chat: "Insight", translate: "Translation", notes: "Notes", vocab: "Vocabulary" } as const)[sidebarTab]} panel`}
          aria-hidden={!sidebarOpen}
          style={sidebarOpen ? { width: sidebarWidth } : { width: 0 }}
          className="hidden md:flex flex-col overflow-hidden shrink-0 border-l border-amber-200 transition-[width] duration-200"
        >
          {sidebarOpen && (
            <>
              {/* Chat — keep mounted so history persists even when other tabs active */}
              <div className={`flex flex-col flex-1 overflow-hidden ${sidebarTab === "chat" ? "" : "hidden"}`}>
                <InsightChat
                  bookId={bookId}
                  userId={session?.backendUser?.id ?? null}
                  hasGeminiKey={hasGeminiKey ?? false}
                  hasClaudeKey={hasClaudeKey}
                  hasDeepseekKey={hasDeepseekKey}
                  isVisible={sidebarOpen && sidebarTab === "chat"}
                  chapterText={current?.text ?? ""}
                  chapterTitle={current?.title || `Chapter ${chapterIndex + 1}`}
                  selectedText={selectedText}
                  bookTitle={meta?.title ?? ""}
                  author={meta?.authors[0] ?? ""}
                  bookLanguage={bookLanguage}
                  onAIUsed={notifyAIUsed}
                  chapterIndex={chapterIndex}
                  onSaveInsight={session?.backendToken ? (question, answer, context) => {
                    const req = saveInsight({ book_id: Number(bookId), chapter_index: chapterIndex, question, answer, context_text: context });
                    req
                      .then(() => setObsidianToast({ msg: "Insight saved to book notes", ok: true }))
                      .catch(() => setObsidianToast({ msg: "Failed to save insight", ok: false }))
                      .finally(() => setTimeout(() => setObsidianToast(null), 3000));
                    return req;
                  } : undefined}
                />
              </div>

              {/* Notes tab */}
              {sidebarTab === "notes" && (() => {
                const filteredNotes = notesView === "chapter"
                  ? annotations.filter((a) => a.chapter_index === chapterIndex)
                  : annotations;
                const renderCard = (ann: (typeof annotations)[0]) => (
                  <li key={ann.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Jump to annotation: ${ann.sentence_text.slice(0, 60)}`}
                    title={ann.note_text ? `${ann.sentence_text} — ${ann.note_text}` : ann.sentence_text}
                    /* Neutral cards — the full highlight-color background was too loud
                       (owner feedback, 2026-08-26); the color still shows on the
                       underline in the text itself. */
                    className="rounded-lg border border-amber-200 bg-white text-ink px-3 py-2.5 cursor-pointer hover:bg-amber-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                    onClick={() => {
                      if (ann.chapter_index !== chapterIndex) {
                        goToChapter(ann.chapter_index);
                        setTimeout(() => setScrollTargetSentence(ann.sentence_text), 400);
                      } else {
                        setScrollTargetSentence(undefined);
                        setTimeout(() => setScrollTargetSentence(ann.sentence_text), 10);
                      }
                      setSidebarOpen(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (ann.chapter_index !== chapterIndex) {
                          goToChapter(ann.chapter_index);
                          setTimeout(() => setScrollTargetSentence(ann.sentence_text), 400);
                        } else {
                          setScrollTargetSentence(undefined);
                          setTimeout(() => setScrollTargetSentence(ann.sentence_text), 10);
                        }
                        setSidebarOpen(false);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p lang={bookLanguage} className="text-xs italic leading-relaxed line-clamp-3 flex-1">
                        &ldquo;{ann.sentence_text}&rdquo;
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnnotationPanel({
                            sentenceText: ann.sentence_text,
                            chapterIndex: ann.chapter_index,
                          });
                        }}
                        className="shrink-0 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center opacity-60 hover:opacity-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                        aria-label={`Edit annotation for: ${ann.sentence_text.slice(0, 60)}`}
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShareCaption("");
                          setShareDialog({ kind: "note", annotationId: ann.id });
                        }}
                        className="shrink-0 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center opacity-60 hover:opacity-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                        aria-label={`Share note: ${ann.sentence_text.slice(0, 60)}`}
                      >
                        <ShareIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {ann.note_text && (
                      <p className="mt-1.5 text-xs font-medium text-stone-700 border-t border-amber-100 pt-1.5">
                        {ann.note_text}
                      </p>
                    )}
                  </div>
                  </li>
                );
                return (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Jump links — above the list so they stay reachable without scrolling past every note */}
                    <div className="border-b border-amber-100 pb-3 flex gap-3 justify-between shrink-0">
                      <a
                        href={`/notes/${bookId}`}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                      >
                        Book notes <ArrowRightIcon className="w-3 h-3 inline" aria-hidden="true" />
                      </a>
                      <a
                        href="/notes"
                        className="text-xs text-stone-600 hover:text-stone-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                      >
                        All books
                      </a>
                    </div>
                    {/* Filter toggle */}
                    <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                      {(["chapter", "all"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setNotesView(v)}
                          aria-pressed={notesView === v}
                          className={`flex-1 text-xs py-1 min-h-[44px] md:min-h-0 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                            notesView === v ? "bg-white text-amber-700 shadow-sm" : "text-stone-600 hover:text-stone-800"
                          }`}
                        >
                          {v === "chapter" ? "This chapter" : "All chapters"}
                        </button>
                      ))}
                    </div>
                    {annotationsLoading && annotations.length === 0 ? (
                      <div className="flex justify-center mt-10" role="status" aria-label="Loading annotations">
                        <span className="sr-only">Loading annotations...</span>
                        <span className="w-5 h-5 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
                      </div>
                    ) : annotationsError ? (
                      <div role="alert" className="flex flex-col items-center gap-3 mt-10 text-center">
                        <p className="text-sm text-stone-500">Couldn&apos;t load annotations.</p>
                        <button
                          onClick={() => setAnnotationsRetryTick((t) => t + 1)}
                          className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          Retry
                        </button>
                      </div>
                    ) : filteredNotes.length === 0 ? (
                      <div className="text-center text-stone-600 mt-10 text-sm">
                        <NoteIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="font-serif text-lg text-stone-600 mt-1">{notesView === "chapter" ? "No annotations in this chapter" : "No annotations yet"}</p>
                        <p className="mt-1 text-xs">Long-press a sentence to add one.</p>
                      </div>
                    ) : notesView === "chapter" ? (
                      <ul role="list" aria-label="Annotations" className="space-y-2 list-none p-0 m-0">
                        {filteredNotes.map(renderCard)}
                      </ul>
                    ) : (
                      <>
                        {Object.keys(
                          annotations.reduce<Record<number, true>>((acc, a) => { acc[a.chapter_index] = true; return acc; }, {})
                        ).map(Number).sort((a, b) => a - b).map((ch) => {
                          const isCollapsed = collapsedNoteChapters.has(ch);
                          return (
                            <div key={ch}>
                              <button
                                className="flex items-center gap-1 w-full text-left text-xs font-semibold text-stone-600 uppercase tracking-wide min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                                aria-expanded={!isCollapsed}
                                aria-controls={`sidebar-notes-ch-${ch}`}
                                onClick={() => setCollapsedNoteChapters((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(ch)) next.delete(ch); else next.add(ch);
                                  return next;
                                })}
                              >
                                {isCollapsed ? <ChevronRightIcon className="w-3 h-3" aria-hidden="true" /> : <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />}
                                <span>Chapter {ch + 1}</span>
                              </button>
                              {!isCollapsed && (
                                <ul id={`sidebar-notes-ch-${ch}`} role="list" aria-label="Annotations" className="space-y-2 list-none p-0 m-0">
                                  {annotations.filter((a) => a.chapter_index === ch).map(renderCard)}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Contents tab (#2745) — replaces the truncating chapter dropdown. */}
              {sidebarTab === "toc" && (
                <TableOfContents
                  chapters={chapters}
                  chapterIndex={chapterIndex}
                  translated={translatedChapters}
                  roles={chapterRoles}
                  onSelect={(i) => {
                    goToChapter(i);
                    // On mobile the sidebar covers the page, so a pick should
                    // reveal the chapter it just navigated to.
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                />
              )}

              {/* Vocab tab */}
              {sidebarTab === "vocab" && (() => {
                const filteredVocab = vocabView === "chapter"
                  ? vocabWords.filter((w) => w.occurrences.some((o) => o.book_id === Number(bookId) && o.chapter_index === chapterIndex))
                  : vocabWords;
                return (
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {/* Filter toggle */}
                    <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                      {(["chapter", "book"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setVocabView(v)}
                          aria-pressed={vocabView === v}
                          className={`flex-1 text-xs py-1 min-h-[44px] md:min-h-0 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                            vocabView === v ? "bg-white text-amber-700 shadow-sm" : "text-stone-600 hover:text-stone-800"
                          }`}
                        >
                          {v === "chapter" ? "This chapter" : "All chapters"}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone-600" aria-live="polite" aria-atomic="true">
                        {filteredVocab.length} word{filteredVocab.length !== 1 ? "s" : ""}
                      </span>
                      <Link href="/vocabulary" className="text-xs text-amber-700 hover:text-amber-800 font-medium min-h-[44px] md:min-h-0 flex items-center gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1">
                        View all <ArrowRightIcon className="w-3 h-3 inline" aria-hidden="true" />
                      </Link>
                    </div>
                    {vocabFetchError ? (
                      <div role="alert" className="flex flex-col items-center gap-2 mt-10 text-center">
                        <p className="text-sm text-stone-500">Couldn&apos;t load vocabulary.</p>
                        <button
                          onClick={() => setVocabRetryTick((t) => t + 1)}
                          className="text-xs px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                        >
                          Retry
                        </button>
                      </div>
                    ) : filteredVocab.length === 0 ? (
                      <div className="text-center text-stone-600 mt-10 text-sm">
                        <EmptyVocabIcon className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                        <p className="font-serif text-lg text-stone-600 mt-1">{vocabView === "chapter" ? "No vocabulary in this chapter" : "No vocabulary saved yet"}</p>
                        <p className="mt-1 text-xs">Select text to save words to vocabulary.</p>
                      </div>
                    ) : (
                      <ul role="list" aria-label="Vocabulary" className="space-y-2 list-none p-0 m-0">
                        {filteredVocab.map((w) => {
                          const lemma = w.lemma || w.word;
                          const isForm = w.lemma && w.lemma.toLowerCase() !== w.word.toLowerCase();
                          const relevantOccs = vocabView === "chapter"
                            ? w.occurrences.filter((o) => o.book_id === Number(bookId) && o.chapter_index === chapterIndex)
                            : w.occurrences.filter((o) => o.book_id === Number(bookId));
                          return (
                            <li key={w.id}>
                            <div className="rounded-lg bg-amber-50 border border-amber-200 overflow-hidden">
                              {/* Lemma header */}
                              <Link
                                href={`/vocabulary?word=${encodeURIComponent(w.word)}`}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] md:min-h-0 hover:bg-amber-100 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
                              >
                                <span lang={w.language ?? undefined} className="text-sm font-semibold text-ink">{lemma}</span>
                                {isForm && (
                                  <span lang={w.language ?? undefined} className="text-[10px] text-amber-700 shrink-0 italic">{w.word}</span>
                                )}
                              </Link>
                              {/* Context occurrences */}
                              {relevantOccs.map((occ, i) => (
                                <button
                                  key={i}
                                  title={occ.sentence_text}
                                  onClick={() => {
                                    if (occ.chapter_index !== chapterIndex) {
                                      goToChapter(occ.chapter_index);
                                      setTimeout(() => setScrollTargetSentence(occ.sentence_text), 400);
                                    } else {
                                      setScrollTargetSentence(undefined);
                                      setTimeout(() => setScrollTargetSentence(occ.sentence_text), 10);
                                    }
                                    setSidebarOpen(false);
                                  }}
                                  className="w-full text-left border-t border-amber-200 px-3 py-1.5 hover:bg-amber-100 transition-colors min-h-[44px] md:min-h-0 flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
                                >
                                  {vocabView === "book" && (
                                    <span className="text-[10px] text-stone-600 mr-1">Ch.{occ.chapter_index + 1}</span>
                                  )}
                                  <span lang={w.language ?? undefined} className="text-xs text-stone-600 italic line-clamp-2">&ldquo;{occ.sentence_text}&rdquo;</span>
                                </button>
                              ))}
                            </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })()}

              {/* Translate tab */}
              {sidebarTab === "translate" && (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-3 border-b border-amber-200 bg-amber-50/50">
                    {/* Enable/disable toggle */}
                    <label className="flex items-center gap-3 mb-4 cursor-pointer">
                      <div className={`relative w-11 h-6 rounded-full transition-colors ${translationEnabled ? "bg-amber-600" : "bg-stone-300"}`}>
                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${translationEnabled ? "translate-x-5" : ""}`} />
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        aria-label="Enable translation"
                        checked={translationEnabled}
                        onChange={(e) => { setTranslationEnabled(e.target.checked); saveSettings({ translationEnabled: e.target.checked }); }}
                      />
                      <span className="text-sm text-ink">{translationEnabled ? "Enabled" : "Disabled"}</span>
                    </label>

                    {/* Session switcher (design: docs/design/user-translations.md) */}
                    {session?.backendToken && translationEnabled && (
                      <TranslationSessionPanel
                        bookId={Number(bookId)}
                        bookLanguage={bookLanguage}
                        sessions={translationSessions}
                        activeSessionId={activeSession?.id ?? null}
                        chapterCount={chapters.length}
                        chapterIndex={chapterIndex}
                        hasClaudeKey={hasClaudeKey}
                        hasDeepseekKey={hasDeepseekKey}
                        onSelect={selectTranslationSession}
                        onSessionsChanged={setTranslationSessions}
                        onTranslateChapter={handleSessionTranslateChapter}
                        chapterChars={chapters[chapterIndex]?.text?.length ?? 0}
                        translating={sessionTranslating || chapterRunActive}
                        editorialLanguages={editorialLanguages ? {
                          total: editorialLanguages.total_chapters || chapters.length,
                          languages: editorialLanguages.languages.map((l) => ({ code: l.target_language, chapters: l.translated_chapters })),
                        } : null}
                        translationLang={translationLang}
                        onChangeLanguage={(lang) => {
                          setBookTranslationLang(lang);
                          selectTranslationSession(null);
                        }}
                        editorialStatus={bookTranslationStatus ? {
                          lang: translationLang,
                          done: bookTranslationStatus.translated_chapters,
                          total: bookTranslationStatus.total_chapters,
                          thisChapter: translatedParagraphs.length > 0,
                          loading: translationLoading,
                        } : null}
                        runProgress={sessionChapter?.run?.active ? { done: sessionChapter.run.done, total: sessionChapter.run.total } : null}
                        actionError={sessionActionError}
                        onDismissError={() => setSessionActionError(null)}
                        chapterProgress={activeSession && sessionChapter ? {
                          done: Object.keys(sessionChapter.paragraphs).length,
                          total: sessionChapter.paragraph_count,
                        } : null}
                      />
                    )}

                    {/* Display mode */}
                    <div className="mb-4">
                      <p id="reader-trans-display-label" className="block text-xs text-amber-700 mb-1">Display</p>
                      <div role="group" aria-labelledby="reader-trans-display-label" className="flex rounded-lg border border-amber-300 overflow-hidden">
                        <button
                          onClick={() => setDisplayMode("inline")}
                          aria-pressed={displayMode === "inline"}
                          className={`flex-1 px-3 py-2 min-h-[44px] md:min-h-0 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
                            displayMode === "inline" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                          }`}
                        >Inline</button>
                        <button
                          onClick={() => setDisplayMode("parallel")}
                          aria-pressed={displayMode === "parallel"}
                          className={`flex-1 px-3 py-2 min-h-[44px] md:min-h-0 text-sm border-l border-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
                            displayMode === "parallel" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                          }`}
                        >Side by side</button>
                      </div>
                    </div>


                    {/* Status */}
                    {!activeSession && translationEnabled && (
                      <div role="status" className="text-xs">
                        {translationLoading && !translationUsedProvider && (
                          <span className="animate-pulse text-amber-700">Checking for translation…</span>
                        )}
                        {!translationLoading && (
                          translationUsedProvider === "cache" ? (
                            <span className="text-stone-600">Editorial translation loaded</span>
                          ) : translationUsedProvider.startsWith("cache · ") ? (
                            <span className="text-stone-600">Editorial translation · <span className="font-mono">{translationUsedProvider.slice(8)}</span></span>
                          ) : translationUsedProvider === "none" ? (
                            <span className="text-stone-600" data-testid="editorial-empty">
                              No editorial translation for this chapter in {LANGUAGES.find((l) => l.code === translationLang)?.label ?? translationLang} yet — editorial translations are prepared offline. Your own translation versions above work anytime.
                            </span>
                          ) : null
                        )}
                      </div>
                    )}

                    {/* Editorial coverage (read-only; produced offline) */}
                    {!activeSession && translationEnabled && bookTranslationStatus && (
                      <div className="mt-3 pt-3 border-t border-amber-200 text-xs text-amber-700" data-testid="editorial-coverage">
                        <strong>{bookTranslationStatus.translated_chapters} / {bookTranslationStatus.total_chapters}</strong> chapters have an editorial translation
                      </div>
                    )}

                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {/* Mobile: half-screen bottom sheet for chat */}
      {(sidebarOpen || chatSheetText) && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col">
          {/* Tap-to-dismiss backdrop (top half — user can still see the text) */}
          <div
            className="flex-1 bg-black/10"
            onClick={() => { setSidebarOpen(false); setChatSheetText(null); }}
          />
          {/* Chat sheet (bottom half) */}
          <div ref={chatSheetRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={sidebarTab === "toc" && !chatSheetText ? "Contents" : "Chat"} aria-describedby="reader-chat-desc" className="h-[55vh] bg-parchment border-t border-amber-200 rounded-t-2xl shadow-2xl flex flex-col animate-slide-up safe-bottom focus:outline-none">
            <span id="reader-chat-desc" className="sr-only">
              {sidebarTab === "toc" && !chatSheetText
                ? "Jump to a chapter"
                : "AI chat about the current passage"}
            </span>
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200 shrink-0">
              <div className="w-10 h-1 bg-amber-200 rounded-full" />
              <span className="font-serif font-semibold text-ink text-sm">
                {sidebarTab === "toc" && !chatSheetText ? "Contents" : "Chat"}
              </span>
              <button
                onClick={() => { setSidebarOpen(false); setChatSheetText(null); }}
                className="min-w-[44px] md:min-w-0 min-h-[44px] md:min-h-0 flex items-center justify-center text-amber-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                aria-label={sidebarTab === "toc" && !chatSheetText ? "Close contents" : "Close chat"}
              ><CloseIcon className="w-4 h-4" aria-hidden="true" /></button>
            </div>
            {sidebarTab === "toc" && !chatSheetText ? (
              <TableOfContents
                chapters={chapters}
                chapterIndex={chapterIndex}
                translated={translatedChapters}
                roles={chapterRoles}
                onSelect={(i) => { goToChapter(i); setSidebarOpen(false); }}
              />
            ) : (
            <InsightChat
              bookId={bookId}
              userId={session?.backendUser?.id ?? null}
              hasGeminiKey={hasGeminiKey ?? false}
              hasClaudeKey={hasClaudeKey}
              hasDeepseekKey={hasDeepseekKey}
              isVisible={true}
              chapterText={current?.text ?? ""}
              chapterTitle={current?.title || `Chapter ${chapterIndex + 1}`}
              selectedText={chatSheetText || selectedText}
              bookTitle={meta?.title ?? ""}
              author={meta?.authors[0] ?? ""}
              bookLanguage={bookLanguage}
              onAIUsed={notifyAIUsed}
              chapterIndex={chapterIndex}
              onSaveInsight={session?.backendToken ? (question, answer, context) => {
                const req = saveInsight({ book_id: Number(bookId), chapter_index: chapterIndex, question, answer, context_text: context });
                req
                  .then(() => setObsidianToast({ msg: "Insight saved to book notes", ok: true }))
                  .catch(() => setObsidianToast({ msg: "Failed to save insight", ok: false }))
                  .finally(() => setTimeout(() => setObsidianToast(null), 3000));
                return req;
              } : undefined}
            />
            )}
          </div>
        </div>
      )}


      {/* ── Mobile floating bottom toolbar ─────────────────────────────── */}
      {!loading && (chapters.length > 0 || error) && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 safe-bottom">
          {/* Translation options expand panel */}
          {translateExpanded && translationEnabled && (
            <div className="bg-white/95 backdrop-blur border-t border-amber-200 px-3 py-2 flex items-center gap-2 animate-slide-up">
              <select
                aria-label="Translation language"
                className="text-xs rounded border border-amber-300 px-2 py-2 text-ink bg-white flex-1 min-h-[44px] md:min-h-0 focus:outline-none focus:ring-2 focus:ring-amber-400"
                value={translationLang}
                onChange={(e) => setBookTranslationLang(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <div className="flex rounded border border-amber-300 overflow-hidden text-xs">
                <button
                  onClick={() => setDisplayMode("inline")}
                  aria-pressed={displayMode === "inline"}
                  className={`px-3 py-2 min-h-[44px] md:min-h-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
                    displayMode === "inline" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                  }`}
                >Inline</button>
                <button
                  onClick={() => setDisplayMode("parallel")}
                  aria-pressed={displayMode === "parallel"}
                  className={`px-3 py-2 min-h-[44px] md:min-h-0 border-l border-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
                    displayMode === "parallel" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                  }`}
                >Side by side</button>
              </div>
            </div>
          )}

          {/* Notes expand panel */}
          {session?.backendToken && notesExpanded && (
            <div id="reader-mobile-notes-panel" className="bg-white/95 backdrop-blur border-t border-amber-200 px-3 py-2 max-h-60 overflow-y-auto animate-slide-up">
              {/* Community-notes visibility toggle — own marks always show */}
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-amber-100">
                <span className="text-xs text-stone-600">Community notes</span>
                <button
                  onClick={() => {
                    const next = !showShares;
                    setShowShares(next);
                    saveSettings({ showOthersShares: next });
                  }}
                  aria-pressed={showShares}
                  aria-label={showShares ? "Hide community notes" : "Show community notes"}
                  className={`flex items-center gap-1 px-2.5 py-1 min-h-[44px] md:min-h-0 rounded-lg border text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                    showShares
                      ? "bg-amber-100 text-amber-900 border-amber-400"
                      : "border-amber-300 text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  <BookmarkIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {showShares ? "On" : "Off"}
                </button>
              </div>
              {annotations.length === 0 ? (
                <div className="text-center text-stone-600 py-4 text-sm">
                  <NoteIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <p>No annotations yet.</p>
                  <p className="text-xs mt-1">Long-press text to add one.</p>
                </div>
              ) : (
                <ul role="list" aria-label="Annotations" className="space-y-1.5 list-none p-0 m-0">
                  {annotations.map((ann) => (
                    <li key={ann.id}>
                    <button
                      onClick={() => {
                        if (ann.chapter_index !== chapterIndex) {
                          goToChapter(ann.chapter_index);
                          setTimeout(() => setScrollTargetSentence(ann.sentence_text), 400);
                        } else {
                          setScrollTargetSentence(undefined);
                          setTimeout(() => setScrollTargetSentence(ann.sentence_text), 10);
                        }
                        setNotesExpanded(false);
                      }}
                      title={ann.note_text ? `${ann.sentence_text} — ${ann.note_text}` : ann.sentence_text}
                      className="w-full text-left px-3 py-2 min-h-[44px] md:min-h-0 flex flex-col justify-center rounded-lg border border-amber-200 bg-amber-50 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                    >
                      <div lang={bookLanguage} className="text-ink line-clamp-2">{ann.sentence_text}</div>
                      {ann.note_text && (
                        <div className="text-stone-600 mt-0.5 line-clamp-1 italic">{ann.note_text}</div>
                      )}
                    </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Main bottom bar */}
          <div className="bg-white/95 backdrop-blur border-t border-amber-200 px-2 py-1.5 flex items-center justify-around gap-1">
            <button
              onClick={() => {
                if (!translationEnabled) {
                  setTranslationEnabled(true);
                  setTranslateExpanded(true);
                } else {
                  setTranslationEnabled(false);
                  setTranslateExpanded(false);
                }
              }}
              className={`h-11 w-11 flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                translationEnabled
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label="Translation"
              aria-pressed={translationEnabled}
            ><GlobeIcon className="w-5 h-5" /></button>

            <button
              onClick={() => {
                const ttsEl = document.querySelector<HTMLButtonElement>("[data-tts-play]");
                if (ttsEl) ttsEl.click();
              }}
              className={`h-11 w-11 flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                ttsIsPlaying
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label={ttsIsPlaying ? "Pause" : "Read aloud"}
            >{ttsIsPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}</button>

            <button
              onClick={() => { setSidebarTab("toc"); setSidebarOpen(true); }}
              aria-label="Table of contents"
              className="flex-1 min-w-0 max-w-[110px] h-11 flex items-center gap-1 text-xs rounded-lg border border-amber-200 px-2 text-amber-700 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <ListViewIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{chapterIndex + 1}. {chapters[chapterIndex]?.title || `§${chapterIndex + 1}`}</span>
            </button>

            <button
              onClick={() => {
                if (!session?.backendToken) { setAuthPrompt("save annotations and notes"); return; }
                setNotesExpanded((v) => !v);
              }}
              className={`relative h-11 w-11 flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                notesExpanded
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label={annotations.length > 0 ? `Notes (${annotations.length})` : "Notes"}
              aria-expanded={notesExpanded}
              aria-controls="reader-mobile-notes-panel"
            >
              <NoteIcon className="w-5 h-5" />
              {annotations.length > 0 && (
                <span aria-hidden="true" className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-amber-800 text-white text-[8px] font-bold px-0.5">
                  {annotations.length}
                </span>
              )}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowShortcuts((v) => !v)}
                aria-label="Keyboard shortcuts"
                aria-expanded={showShortcuts}
                aria-controls="shortcuts-panel-mobile"
                className={`h-11 w-11 flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                  showShortcuts
                    ? "bg-amber-700 text-white border-amber-700"
                    : "text-amber-700 bg-amber-50 border-amber-200"
                }`}
              ><KeyboardIcon className="w-5 h-5" /></button>
              {showShortcuts && (
                <div id="shortcuts-panel-mobile" role="region" aria-label="Keyboard shortcuts" className="absolute bottom-full right-0 mb-2 w-56 bg-white border border-amber-200 rounded-xl shadow-lg z-50 p-3 animate-slide-up">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-600 mb-2">Keyboard Shortcuts</p>
                  <div className="space-y-1.5">
                    {[
                      { keys: ["Space"], label: "Play / Pause TTS" },
                      { keys: ["←", "→"], label: "Previous / Next chapter" },
                      { keys: ["F"], label: "Toggle focus mode" },
                      { keys: ["?"], label: "Show this panel" },
                      { keys: ["N"], label: "Sentence selection mode" },
                      { keys: ["W"], label: "Word mode (in N mode)" },
                      { keys: ["Esc"], label: "Close panels" },
                    ].map(({ keys, label }) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-stone-600">{label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {keys.map((k) => (
                            <kbd key={k} className="inline-flex items-center justify-center min-w-[22px] h-5 px-1 rounded border border-stone-200 bg-stone-50 text-[10px] font-mono text-stone-600">{k}</kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`h-11 w-11 flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
                sidebarOpen
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label="Insight chat"
              aria-expanded={sidebarOpen}
            ><ChatIcon className="w-5 h-5" /></button>
          </div>
        </div>
      )}

      {/* TypographyPanel lives outside the header so focus-mode opacity-0 on the
          header does not clip this fixed-position overlay. */}
      {showTypographyPanel && (
        <TypographyPanel
          fontSize={fontSize}
          lineHeight={lineHeight}
          contentWidth={contentWidth}
          fontFamily={fontFamily}
          paragraphFocus={paragraphFocus}
          onFontSize={setFontSize}
          onLineHeight={setLineHeight}
          onContentWidth={setContentWidth}
          onFontFamily={setFontFamily}
          onParagraphFocus={setParagraphFocus}
          onClose={() => setShowTypographyPanel(false)}
          anchorPos={typographyAnchorPos ?? undefined}
        />
      )}

      <AuthPromptModal
        open={authPrompt !== null}
        feature={authPrompt ?? ""}
        onClose={() => setAuthPrompt(null)}
      />
    </main>
  );
}
