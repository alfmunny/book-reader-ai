"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getBookChapters, deleteTranslationCache, synthesizeSpeech, getMe, getBookTranslationStatus, requestChapterTranslation, getChapterTranslation, getChapterQueueStatus, retryChapterTranslation, enqueueBookTranslation, saveReadingProgress, getAnnotations, getVocabulary, saveVocabularyWord, exportVocabularyToObsidian, saveInsight, TranslationStatus, BookMeta, BookChapter, ApiError, Annotation, VocabularyWord } from "@/lib/api";
import { recordRecentBook, saveLastChapter, getLastChapter } from "@/lib/recentBooks";
import { getSettings, saveSettings, FontSize, Theme } from "@/lib/settings";
import InsightChat, { LANGUAGES } from "@/components/InsightChat";
import TTSControls from "@/components/TTSControls";
import TranslationView from "@/components/TranslationView";
import SentenceReader from "@/components/SentenceReader";
import SelectionToolbar from "@/components/SelectionToolbar";
import AnnotationToolbar from "@/components/AnnotationToolbar";
import VocabularyToast from "@/components/VocabularyToast";
import VocabWordTooltip from "@/components/VocabWordTooltip";

// In-memory cache: bookId → chapters (survives client-side navigation)
const chaptersCache = new Map<string, BookChapter[]>();
const metaCache = new Map<string, BookMeta>();

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [meta, setMeta] = useState<BookMeta | null>(metaCache.get(bookId) ?? null);
  const [chapters, setChapters] = useState<BookChapter[]>(chaptersCache.get(bookId) ?? []);
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
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [annotationPanel, setAnnotationPanel] = useState<{
    sentenceText: string;
    chapterIndex: number;
    position: { x: number; y: number };
  } | null>(null);
  const [scrollTargetSentence, setScrollTargetSentence] = useState<string | undefined>();
  const didUrlScrollRef = useRef(false);

  // Vocabulary toast
  const [vocabToastWord, setVocabToastWord] = useState<string | null>(null);

  // Obsidian export toast
  const [obsidianToast, setObsidianToast] = useState<string | null>(null);

  // TTS Read-button playback state — fed by TTSControls via callback props.
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
  const [ttsDuration, setTtsDuration] = useState(0);
  const [ttsIsPlaying, setTtsIsPlaying] = useState(false);
  const [ttsIsLoading, setTtsIsLoading] = useState(false);
  const [ttsChunks, setTtsChunks] = useState<{ text: string; duration: number }[]>([]);
  const ttsSeekRef = useRef<(t: number) => void>(() => {});

  // Annotation display toggle (persisted)
  const [showAnnotations, setShowAnnotations] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("reader-show-annotations") !== "false";
  });

  // Sidebar — hidden by default, resizable, tabbed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"chat" | "notes" | "vocab" | "translate">("chat");
  const [vocabWords, setVocabWords] = useState<VocabularyWord[]>([]);
  const vocabWordsSet = useMemo(
    () => new Set(vocabWords.map((v) => v.word.toLowerCase())),
    [vocabWords],
  );
  const [vocabView, setVocabView] = useState<"chapter" | "book">("chapter");
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [geminiReminderVisible, setGeminiReminderVisible] = useState(false);
  const geminiReminderShown = useRef(false);

  useEffect(() => {
    getMe().then((me) => {
      setHasGeminiKey(me.hasGeminiKey);
      setIsAdmin(me.role === "admin");
    }).catch(() => {});
  }, [session?.backendToken]);

  function notifyAIUsed() {
    if (!hasGeminiKey && !geminiReminderShown.current) {
      geminiReminderShown.current = true;
      setGeminiReminderVisible(true);
    }
  }

  // Translation state
  const translationCache = useRef(new Map<string, { paragraphs: string[]; label: string }>());
  const currentChapterKey = useRef<string>(""); // tracks which chapter is currently displayed
  const [translationEnabled, setTranslationEnabled] = useState<boolean>(() =>
    typeof window !== "undefined" ? getSettings().translationEnabled : false
  );
  const [translationLang, setTranslationLang] = useState<string>(() =>
    typeof window !== "undefined" ? getSettings().translationLang : "en"
  );
  // Translation provider removed — queue handles all translation via the admin's chain.
  const [displayMode, setDisplayMode] = useState<"parallel" | "inline">("parallel");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationUsedProvider, setTranslationUsedProvider] = useState<string>("");
  const [bookTranslationStatus, setBookTranslationStatus] = useState<TranslationStatus | null>(null);

  // Reader display settings
  const [fontSize, setFontSize] = useState<FontSize>("base");
  const [theme, setTheme] = useState<Theme>("light");
  const [scrollProgress, setScrollProgress] = useState(0);

  // Read settings on mount (translationLang uses lazy useState above)
  useEffect(() => {
    const s = getSettings();
    // translationProvider setting is retained for back-compat but no longer read here.
    setFontSize(s.fontSize);
    setTheme(s.theme);
  }, []);

  // Apply theme and font size to the document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-font-size", fontSize);
    return () => {
      document.documentElement.removeAttribute("data-theme");
      document.documentElement.removeAttribute("data-font-size");
    };
  }, [theme, fontSize]);

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
        setChapters(data.chapters);
        setMeta(data.meta);
        const savedChapter = getLastChapter(Number(bookId));
        // ?chapter=N from deep-links takes priority over last-read progress
        const urlChapter = searchParams?.get("chapter");
        const urlChapterIdx = urlChapter !== null ? parseInt(urlChapter, 10) : NaN;
        const targetChapter = !isNaN(urlChapterIdx) ? urlChapterIdx : savedChapter;
        setChapterIndex(Math.min(targetChapter, data.chapters.length - 1));
        recordRecentBook(data.meta, savedChapter);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  // Load annotations for this book (requires auth)
  useEffect(() => {
    if (!bookId || !session?.backendToken) return;
    setAnnotationsLoading(true);
    getAnnotations(Number(bookId))
      .then(setAnnotations)
      .catch(() => {})
      .finally(() => setAnnotationsLoading(false));
  }, [bookId, session?.backendToken]);

  // Fetch vocabulary words for this book
  useEffect(() => {
    if (!session?.backendToken) return;
    setVocabWords([]);
    getVocabulary().then((words) => {
      setVocabWords(words.filter((w) => w.occurrences.some((o) => o.book_id === Number(bookId))));
    }).catch(() => {});
  }, [bookId, session?.backendToken]);

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
    if (!bookLanguage) return;
    const available = LANGUAGES.filter((l) => l.code !== bookLanguage);
    if (translationLang === bookLanguage && available.length > 0) {
      setTranslationLang(available[0].code);
    }
  }, [bookLanguage, translationLang]);

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
      if (cancelled || currentChapterKey.current !== cacheKey) return;

      // Not cached — check if already queued so we can show the queue banner
      try {
        const queueStatus = await getChapterQueueStatus(bid, chapterIndex, translationLang);
        if (cancelled || currentChapterKey.current !== cacheKey) return;
        if (queueStatus.status === "pending" || queueStatus.status === "running") {
          setTranslationLoading(false);
          setTranslationUsedProvider(
            queueStatus.status === "running"
              ? "queue · translating now"
              : `queue · position ${queueStatus.position ?? "?"}`
          );
          return;
        }
      } catch { /* ignore */ }

      // Not translated and not queued — show "Translate this chapter" button
      if (!cancelled && currentChapterKey.current === cacheKey) setTranslationLoading(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, chapterIndex, bookId, chapters]);

  async function handleTranslateThisChapter() {
    const current = chapters[chapterIndex];
    if (!current?.text) return;
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    currentChapterKey.current = cacheKey;

    setTranslationLoading(true);
    setTranslatedParagraphs([]);
    setTranslationUsedProvider("");

    const bid = Number(bookId);

    function showResult(res: { paragraphs?: string[]; provider?: string; model?: string; title_translation?: string | null }) {
      if (!res.paragraphs) return;
      const label = res.model ? `translated · ${res.model}` : (res.provider ? `translated · ${res.provider}` : "translated");
      translationCache.current.set(cacheKey, { paragraphs: res.paragraphs, label });
      setTranslatedParagraphs(res.paragraphs);
      setTranslatedTitle(res.title_translation ?? null);
      setTranslationUsedProvider(label);
      setTranslationLoading(false);
    }

    function describeStatus(r: { status: string; position?: number | null; worker_running?: boolean }): string {
      if (r.status === "running") return "queue · translating now";
      if (r.worker_running === false) return "queue · worker is offline";
      return `queue · position ${r.position ?? "?"}`;
    }

    let res;
    try {
      res = await requestChapterTranslation(bid, chapterIndex, translationLang);
    } catch (e) {
      if (currentChapterKey.current === cacheKey) {
        if (e instanceof ApiError && e.status === 401) setTranslationUsedProvider("login required");
        else if (e instanceof ApiError && e.status === 403) setTranslationUsedProvider("gemini key required");
        else setTranslationUsedProvider("error · check admin queue");
        setTranslationLoading(false);
      }
      return;
    }
    if (currentChapterKey.current !== cacheKey) return;

    if (res.status === "ready") { showResult(res); return; }

    if (hasGeminiKey === false && !isAdmin) {
      setTranslationUsedProvider("gemini key required");
      setTranslationLoading(false);
      return;
    }

    setTranslationUsedProvider(describeStatus(res));

    (async () => {
      try {
        const status = await getBookTranslationStatus(bid, translationLang);
        if (currentChapterKey.current === cacheKey) setBookTranslationStatus(status);
      } catch { /* ignore */ }
    })();

    const POLL_MS = 3000;
    let cancelled = false;
    while (!cancelled && currentChapterKey.current === cacheKey) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (cancelled || currentChapterKey.current !== cacheKey) return;
      let tick;
      try { tick = await requestChapterTranslation(bid, chapterIndex, translationLang); }
      catch { continue; }
      if (cancelled || currentChapterKey.current !== cacheKey) return;
      if (tick.status === "ready") { showResult(tick); return; }
      if (tick.status === "failed") {
        setTranslationUsedProvider(`queue failed${tick.attempts ? ` · ${tick.attempts} attempts` : ""}`);
        setTranslationLoading(false);
        return;
      }
      setTranslationUsedProvider(describeStatus(tick));
    }
  }

  // Poll book-level translation status when translation is enabled — shows
  // the admin-level bulk-translate progress for this book ("42/60 chapters ready").
  useEffect(() => {
    if (!translationEnabled || !bookId) {
      setBookTranslationStatus(null);
      return;
    }
    let cancelled = false;
    async function fetchStatus() {
      try {
        const status = await getBookTranslationStatus(Number(bookId), translationLang);
        if (!cancelled) setBookTranslationStatus(status);
      } catch { /* ignore */ }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [translationEnabled, translationLang, bookId]);

  async function handleRetranslate() {
    const bid = Number(bookId);
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    // Delete backend cache
    await deleteTranslationCache(bid, chapterIndex, translationLang).catch(() => {});
    // Clear frontend caches
    translationCache.current.delete(cacheKey);
    setTranslatedParagraphs([]);
    // Re-trigger by toggling translation off then on
    setTranslationEnabled(false);
    setTimeout(() => setTranslationEnabled(true), 50);
  }

  const [enqueueingBook, setEnqueueingBook] = useState(false);

  async function handleTranslateWholeBook() {
    const bid = Number(bookId);
    setEnqueueingBook(true);
    try {
      const res = await enqueueBookTranslation(bid, translationLang);
      // Refresh whole-book status immediately so the banner updates
      // without waiting for the 15s poll tick — the banner may have
      // been showing stale "not started" counts because a chapter
      // was on-demand-queued by the reader between polls.
      let fresh: TranslationStatus | null = null;
      try {
        fresh = await getBookTranslationStatus(bid, translationLang);
        setBookTranslationStatus(fresh);
      } catch { /* ignore */ }

      // Distinguish "nothing to queue because everything's done" from
      // "nothing to queue because everything's already queued" — the
      // button disappearing + a vague 'already queued' message used
      // to look like the click was a no-op even when the worker was
      // actively translating.
      let msg;
      if (res.enqueued > 0) {
        msg = `Queued ${res.enqueued} chapter${res.enqueued === 1 ? "" : "s"} for translation into ${translationLang}.`;
      } else if (fresh) {
        const queued = (fresh.queue_pending ?? 0) + (fresh.queue_running ?? 0);
        const failed = fresh.queue_failed ?? 0;
        if (queued > 0) {
          msg = `Nothing new to queue — ${queued} chapter${queued === 1 ? " is" : "s are"} already in the queue and being processed.`;
        } else if (failed > 0) {
          msg = `Nothing new to queue — ${failed} chapter${failed === 1 ? "" : "s"} previously failed. Use the Retry button to revive them.`;
        } else {
          msg = `All chapters are already translated.`;
        }
      } else {
        msg = `All chapters are already translated or already queued.`;
      }
      alert(msg);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to queue book");
    } finally {
      setEnqueueingBook(false);
    }
  }

  async function handleRetryFailed() {
    // Different from handleRetranslate: there is no cached translation to
    // delete (the chapter failed), we just need to revive the failed queue
    // row so the worker picks it up again. Clearing frontend state + the
    // toggle dance re-starts polling once the row is pending.
    const bid = Number(bookId);
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    try {
      await retryChapterTranslation(bid, chapterIndex, translationLang);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Retry failed");
      return;
    }
    translationCache.current.delete(cacheKey);
    setTranslatedParagraphs([]);
    setTranslationEnabled(false);
    setTimeout(() => setTranslationEnabled(true), 50);
  }

  const handleSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() || "";
    setSelectedText(sel.length > 2 ? sel : "");
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is typing in an input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowLeft" && chapterIndex > 0) {
        e.preventDefault();
        goToChapter(chapterIndex - 1);
      } else if (e.key === "ArrowRight" && chapterIndex < chapters.length - 1) {
        e.preventDefault();
        goToChapter(chapterIndex + 1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

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

  // Vocabulary save handler
  async function handleWordSave(word: string, sentenceText: string) {
    try {
      await saveVocabularyWord({
        word,
        book_id: Number(bookId),
        chapter_index: chapterIndex,
        sentence_text: sentenceText,
      });
      setVocabToastWord(word);
      // Refresh sidebar word list
      getVocabulary().then((words) => {
        setVocabWords(words.filter((w) => w.occurrences.some((o) => o.book_id === Number(bookId))));
      }).catch(() => {});
    } catch {
      // silently ignore (user may not be logged in)
    }
  }

  // Obsidian export handler
  async function handleObsidianExport() {
    try {
      const { urls } = await exportVocabularyToObsidian(Number(bookId));
      setObsidianToast(urls[0] || "Exported successfully");
      setTimeout(() => setObsidianToast(null), 6000);
    } catch (e) {
      setObsidianToast(e instanceof Error ? e.message : "Export failed");
      setTimeout(() => setObsidianToast(null), 4000);
    }
  }

  const current = chapters[chapterIndex];
  const chapterParagraphs = current?.text
    ? current.text.split(/\n\n+/).filter((p) => p.trim())
    : [];

  if (error)
    return (
      <div className="h-screen bg-parchment flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push("/")} className="text-amber-700 underline">
            Back to library
          </button>
        </div>
      </div>
    );

  return (
    <div className="h-screen bg-parchment flex flex-col overflow-hidden">
      {/* ── Gemini key reminder banner ───────────────────────────────────── */}
      {geminiReminderVisible && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-300 px-4 py-2 flex items-center justify-between gap-4 text-sm text-amber-800">
          <span>
            AI features require your own Gemini API key.{" "}
            <button
              onClick={() => { window.open("/profile", "_blank"); }}
              className="underline font-medium hover:text-amber-900"
            >
              Add your free Gemini API key
            </button>{" "}
            to enable them.
          </span>
          <button
            onClick={() => setGeminiReminderVisible(false)}
            className="shrink-0 text-amber-500 hover:text-amber-700 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={`border-b border-amber-200 bg-white/70 backdrop-blur shrink-0 transition-all duration-300 ${
        !toolbarVisible ? "max-h-0 overflow-hidden opacity-0 border-b-0" : "max-h-[300px] opacity-100"
      } md:!max-h-none md:!opacity-100 md:!overflow-visible md:!border-b`}>
        {/* Row 1: nav + title + controls */}
        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3">
          <button
            onClick={() => router.push("/")}
            className="text-amber-700 hover:text-amber-900 text-sm shrink-0 min-h-[44px] flex items-center"
          >
            ← <span className="hidden sm:inline ml-1">Library</span>
          </button>

          <div className="min-w-0 flex-1">
            {meta ? (
              <>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <h1 className="font-serif font-bold text-ink truncate text-sm">{meta.title}</h1>
                  <a
                    href={`https://www.gutenberg.org/ebooks/${meta.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-amber-500 hover:text-amber-700"
                    title="View on Project Gutenberg"
                  >↗</a>
                </div>
                <p className="text-xs text-amber-700 truncate">{meta.authors.join(", ")}</p>
              </>
            ) : (
              <div className="h-4 w-48 bg-amber-200 animate-pulse rounded" />
            )}
          </div>

          {/* Chapter navigation — desktop only (mobile uses bottom bar) */}
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {loading ? (
              <span className="text-xs text-amber-500 animate-pulse">Loading…</span>
            ) : (
              <>
                <button
                  onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                  disabled={chapterIndex === 0}
                  className="px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm flex items-center justify-center"
                >‹</button>
                <select
                  className="text-xs rounded border border-amber-300 px-2 py-1.5 text-ink bg-white max-w-[160px]"
                  value={chapterIndex}
                  onChange={(e) => goToChapter(Number(e.target.value))}
                >
                  {chapters.map((ch, i) => (
                    <option key={i} value={i}>
                      {i + 1}. {ch.title || `Section ${i + 1}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => goToChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
                  disabled={chapterIndex === chapters.length - 1}
                  className="px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm flex items-center justify-center"
                >›</button>
              </>
            )}
          </div>

          {/* Font size — desktop only */}
          <button
            onClick={cycleFontSize}
            title={`Font size: ${fontSize}`}
            className="hidden md:flex shrink-0 w-8 h-8 rounded-full border border-amber-300 hover:bg-amber-100 text-xs font-bold text-amber-700 transition-colors items-center justify-center"
          >
            {fontSize === "sm" ? "A" : fontSize === "base" ? "A" : fontSize === "lg" ? "A" : "A"}
            <span className="text-[8px] align-super">{fontSize === "sm" ? "-" : fontSize === "base" ? "" : fontSize === "lg" ? "+" : "++"}</span>
          </button>

          {/* Theme — desktop only */}
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="hidden md:flex shrink-0 w-8 h-8 rounded-full border border-amber-300 hover:bg-amber-100 text-sm transition-colors items-center justify-center"
          >
            {theme === "light" ? "☀" : theme === "sepia" ? "📖" : "🌙"}
          </button>

          {/* ── Feature buttons (desktop) — all LEFT of profile ────────── */}

          {/* Insight chat toggle */}
          <button
            onClick={() => { setSidebarTab("chat"); setSidebarOpen((v) => sidebarTab === "chat" ? !v : true); }}
            title="Toggle insight chat"
            className={`hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              sidebarOpen && (sidebarTab === "chat")
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            💬 Insight
          </button>

          {/* Translate toggle — opens sidebar with translation controls */}
          <button
            onClick={() => { setSidebarTab("translate"); setSidebarOpen((v) => sidebarTab === "translate" ? !v : true); }}
            title="Translation"
            className={`hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              sidebarOpen && sidebarTab === "translate"
                ? "bg-amber-700 text-white border-amber-700"
                : translationEnabled
                  ? "bg-amber-100 text-amber-900 border-amber-400"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            🌐 Translate
          </button>

          {/* Notes sidebar toggle — desktop only */}
          {session?.backendToken && (
            <button
              onClick={() => { setSidebarTab("notes"); setSidebarOpen((v) => sidebarTab === "notes" ? !v : true); }}
              title="Annotations & notes"
              className={`relative hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                sidebarOpen && sidebarTab === "notes"
                  ? "bg-amber-700 text-white border-amber-700"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              📝 Notes
              {annotations.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-600 text-white text-[9px] font-bold px-1">
                  {annotations.length}
                </span>
              )}
            </button>
          )}

          {/* Show/hide annotation marks — desktop only */}
          {session?.backendToken && (
            <button
              onClick={() => {
                setShowAnnotations((v) => {
                  const next = !v;
                  localStorage.setItem("reader-show-annotations", String(next));
                  return next;
                });
              }}
              title={showAnnotations ? "Hide annotation marks" : "Show annotation marks"}
              className={`hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showAnnotations
                  ? "bg-amber-100 text-amber-900 border-amber-400"
                  : "border-amber-300 text-amber-500 hover:bg-amber-50 opacity-60"
              }`}
            >
              {showAnnotations ? "🔖 Marks on" : "🔖 Marks off"}
            </button>
          )}

          {/* Vocabulary sidebar — desktop only */}
          {session?.backendToken && (
            <button
              onClick={() => { setSidebarTab("vocab"); setSidebarOpen((v) => sidebarTab === "vocab" ? !v : true); }}
              title="Vocabulary"
              className={`relative hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                sidebarOpen && sidebarTab === "vocab"
                  ? "bg-amber-700 text-white border-amber-700"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              📚 Vocab
              {vocabWords.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-amber-600 text-white text-[9px] font-bold px-1">
                  {vocabWords.length}
                </span>
              )}
            </button>
          )}

          {/* Export vocabulary to Obsidian — desktop only */}
          {session?.backendToken && (
            <button
              onClick={handleObsidianExport}
              title="Export vocabulary to Obsidian"
              className="hidden lg:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors"
            >
              ↗ Obsidian
            </button>
          )}

          {/* Profile — always rightmost */}
          <button
            onClick={() => router.push("/profile")}
            title={session?.backendUser?.name ?? "Profile"}
            className="shrink-0 w-10 h-10 md:w-8 md:h-8 rounded-full overflow-hidden border border-amber-300 hover:border-amber-500 transition-colors ml-auto md:ml-0"
          >
            {session?.backendUser?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.backendUser.picture} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <span className="w-full h-full flex items-center justify-center bg-amber-100 text-amber-700 text-xs font-bold">
                {session?.backendUser?.name?.[0] ?? "?"}
              </span>
            )}
          </button>
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
          <div className="bg-sky-50 border-b border-sky-200 px-4 py-2 text-xs text-sky-800 flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" />
            <span>
              <strong>Translation queued</strong> — {translationUsedProvider}.
              The background worker is processing this chapter; translated
              paragraphs will appear below when ready.
            </span>
          </div>
        )}

      {/* Login required notice — shown when translation is not cached and user is not logged in */}
      {translationEnabled && translationUsedProvider === "login required" && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span>
            Translation requires an account.{" "}
            <a href="/api/auth/signin" className="underline font-medium hover:text-amber-900">
              Sign in
            </a>{" "}
            to translate this chapter.
          </span>
        </div>
      )}

      {/* Gemini key required notice — shown when logged in but no API key configured */}
      {translationEnabled && translationUsedProvider === "gemini key required" && (
        <div className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span>
            Translation requires a Gemini API key.{" "}
            <button
              onClick={() => router.push("/profile")}
              className="underline font-medium hover:text-amber-900"
            >
              Add your Gemini API key in Settings
            </button>{" "}
            to start translating.
          </span>
        </div>
      )}

      </div>{/* end banners wrapper */}

      {/* Reading progress bar — always visible, even in immersive mode */}
      {chapters.length > 0 && (
        <div className="h-0.5 bg-amber-100" title={`${Math.round(((chapterIndex + scrollProgress / 100) / chapters.length) * 100)}% through book`}>
          <div
            className="h-full bg-amber-600 transition-all duration-150"
            style={{ width: `${((chapterIndex + scrollProgress / 100) / chapters.length) * 100}%` }}
          />
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Reader */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div
            id="reader-scroll"
            className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8 pb-16 md:pb-8"
            onClick={handleReaderTap}
            onTouchStart={handleTouchStart}
            onTouchEnd={(e) => { handleTouchEnd(e); handleSelection(); }}
            onMouseUp={handleSelection}
          >
            {loading ? (
              <div className="max-w-prose mx-auto space-y-3 animate-pulse">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className={`h-4 bg-amber-200 rounded ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
                ))}
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
                  translations={translationEnabled ? translatedParagraphs : undefined}
                  translationDisplayMode={displayMode}
                  translationLoading={translationLoading}
                  annotations={session?.backendToken ? annotations.filter((a) => a.chapter_index === chapterIndex) : undefined}
                  chapterIndex={chapterIndex}
                  onAnnotate={session?.backendToken ? (sentenceText, ci, position) => {
                    setAnnotationPanel({ sentenceText, chapterIndex: ci, position });
                  } : undefined}
                  showAnnotations={showAnnotations}
                  scrollTargetSentence={scrollTargetSentence}
                  scrollTargetWord={searchParams?.get("word") ? decodeURIComponent(searchParams.get("word")!) : undefined}
                  vocabWords={vocabWordsSet}
                  onSegmentClick={(startTime) => {
                    // Called only when TTS is playing (seek)
                    ttsSeekRef.current(startTime);
                  }}
                />
                <div className={`mt-10 flex justify-between ${translationEnabled && displayMode === "parallel" ? "max-w-7xl mx-auto" : "prose-reader mx-auto"}`}>
                  <button
                    onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                    disabled={chapterIndex === 0}
                    className="text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30"
                  >← Previous chapter</button>
                  <span className="text-xs text-amber-500 self-center">
                    {chapterIndex + 1} / {chapters.length} · {Math.round(((chapterIndex + 1) / chapters.length) * 100)}%
                  </span>
                  <button
                    onClick={() => goToChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
                    disabled={chapterIndex === chapters.length - 1}
                    className="text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30"
                  >Next chapter →</button>
                </div>
              </>
            )}
          </div>


          {/* Selection toolbar — appears when user selects text */}
          <SelectionToolbar
            onRead={(text) => {
              synthesizeSpeech(text, bookLanguage, 1.0, getSettings().ttsGender)
                .then(({ url }) => {
                  const audio = new Audio(url);
                  audio.onended = () => URL.revokeObjectURL(url);
                  audio.play().catch(() => URL.revokeObjectURL(url));
                })
                .catch(() => {
                  window.speechSynthesis.cancel();
                  const utter = new SpeechSynthesisUtterance(text);
                  utter.lang = bookLanguage;
                  window.speechSynthesis.speak(utter);
                });
            }}
            onHighlight={session?.backendToken ? (text) => {
              setAnnotationPanel({
                sentenceText: text,
                chapterIndex,
                position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              });
            } : undefined}
            onNote={session?.backendToken ? (text) => {
              setAnnotationPanel({
                sentenceText: text,
                chapterIndex,
                position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              });
            } : undefined}
            onChat={(text) => {
              setChatSheetText(text);
              setSelectedText(text);
              setSidebarTab("chat");
              setSidebarOpen(true);
            }}
            onVocab={session?.backendToken ? (word, context, rect) => setVocabTooltip({ word, context, rect }) : undefined}
          />

          {/* Annotation toolbar */}
          {annotationPanel && (
            <AnnotationToolbar
              sentenceText={annotationPanel.sentenceText}
              chapterIndex={annotationPanel.chapterIndex}
              bookId={Number(bookId)}
              position={annotationPanel.position}
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
              }}
              onDeleted={(id) => {
                setAnnotations((prev) => prev.filter((a) => a.id !== id));
              }}
            />
          )}

          {/* Word definition tooltip */}
          {vocabTooltip && (
            <VocabWordTooltip
              word={vocabTooltip.word}
              lang={bookLanguage}
              rect={vocabTooltip.rect}
              onClose={() => setVocabTooltip(null)}
              onSave={() => {
                handleWordSave(vocabTooltip.word, vocabTooltip.context);
                setVocabTooltip(null);
              }}
            />
          )}

          {/* Vocabulary save toast */}
          {vocabToastWord && (
            <VocabularyToast
              word={vocabToastWord}
              onDone={() => setVocabToastWord(null)}
            />
          )}

          {/* Obsidian export toast */}
          {obsidianToast && (
            <div className="fixed bottom-6 right-6 z-50 bg-white border border-amber-300 shadow-lg rounded-xl px-5 py-3 text-sm text-ink max-w-xs">
              {obsidianToast.startsWith("http") ? (
                <>
                  Exported!{" "}
                  <a
                    href={obsidianToast}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-700 underline break-all"
                  >
                    {obsidianToast}
                  </a>
                </>
              ) : (
                <span className="text-red-600">{obsidianToast}</span>
              )}
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
              }}
              onLoadingChange={setTtsIsLoading}
              onChunksUpdate={setTtsChunks}
              onSeekRegister={(seekFn) => {
                ttsSeekRef.current = seekFn;
              }}
            />
          </div>
        </div>

        {/* Resize handle — only visible when sidebar is open, hidden on mobile (sidebar is fullscreen there) */}
        {sidebarOpen && (
          <div
            onMouseDown={onResizeStart}
            className="hidden md:block w-1.5 shrink-0 cursor-col-resize bg-amber-100 hover:bg-amber-400 active:bg-amber-500 transition-colors relative group"
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
          style={sidebarOpen ? { width: sidebarWidth } : { width: 0 }}
          className="hidden md:flex flex-col overflow-hidden shrink-0 border-l border-amber-200"
        >
          {sidebarOpen && (
            <>
              {/* Chat — keep mounted so history persists even when other tabs active */}
              <div className={`flex flex-col flex-1 overflow-hidden ${sidebarTab === "chat" ? "" : "hidden"}`}>
                <InsightChat
                  bookId={bookId}
                  userId={session?.backendUser?.id ?? null}
                  hasGeminiKey={hasGeminiKey ?? false}
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
                    saveInsight({ book_id: Number(bookId), chapter_index: chapterIndex, question, answer, context_text: context })
                      .then(() => setObsidianToast("Insight saved to book notes"))
                      .catch(() => setObsidianToast("Failed to save insight"))
                      .finally(() => setTimeout(() => setObsidianToast(null), 3000));
                  } : undefined}
                />
              </div>

              {/* Notes tab */}
              {sidebarTab === "notes" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {annotationsLoading && annotations.length === 0 ? (
                    <div className="flex justify-center mt-10">
                      <span className="w-5 h-5 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
                    </div>
                  ) : annotations.length === 0 ? (
                    <div className="text-center text-stone-400 mt-10 text-sm">
                      <p className="text-3xl mb-2">📝</p>
                      <p>No annotations yet.</p>
                      <p className="mt-1 text-xs">Long-press a sentence to add one.</p>
                    </div>
                  ) : (
                    <>
                      {Object.keys(
                        annotations.reduce<Record<number, true>>((acc, a) => { acc[a.chapter_index] = true; return acc; }, {})
                      ).map(Number).sort((a, b) => a - b).map((ch) => (
                        <div key={ch}>
                          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                            Chapter {ch + 1}
                          </h3>
                          <div className="space-y-2">
                            {annotations.filter((a) => a.chapter_index === ch).map((ann) => {
                              const colorBadge: Record<string, string> = {
                                yellow: "bg-yellow-100 border-yellow-300 text-yellow-800",
                                blue: "bg-blue-100 border-blue-300 text-blue-800",
                                green: "bg-green-100 border-green-300 text-green-800",
                                pink: "bg-pink-100 border-pink-300 text-pink-800",
                              };
                              return (
                                <div
                                  key={ann.id}
                                  className={`rounded-lg border px-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity ${colorBadge[ann.color] ?? colorBadge.yellow}`}
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
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs italic leading-relaxed line-clamp-3 flex-1">
                                      &ldquo;{ann.sentence_text}&rdquo;
                                    </p>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAnnotationPanel({
                                          sentenceText: ann.sentence_text,
                                          chapterIndex: ann.chapter_index,
                                          position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                                        });
                                      }}
                                      className="shrink-0 text-xs opacity-60 hover:opacity-100 mt-0.5"
                                      title="Edit annotation"
                                    >
                                      ✏️
                                    </button>
                                  </div>
                                  {ann.note_text && (
                                    <p className="mt-1.5 text-xs font-medium border-t border-current/20 pt-1.5">
                                      {ann.note_text}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {/* Footer link */}
                  <div className="border-t border-amber-100 pb-2 pt-3 flex gap-3 justify-between shrink-0">
                    <a
                      href={`/notes/${bookId}`}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
                    >
                      Book notes →
                    </a>
                    <a
                      href="/notes"
                      className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      All books
                    </a>
                  </div>
                </div>
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
                          className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
                            vocabView === v ? "bg-white text-amber-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
                          }`}
                        >
                          {v === "chapter" ? "This chapter" : "All chapters"}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-stone-400">
                        {filteredVocab.length} word{filteredVocab.length !== 1 ? "s" : ""}
                      </span>
                      <button onClick={() => router.push("/vocabulary")} className="text-xs text-amber-600 hover:text-amber-800 font-medium">
                        View all →
                      </button>
                    </div>
                    {filteredVocab.length === 0 ? (
                      <div className="text-center text-stone-400 mt-10 text-sm">
                        <p className="text-3xl mb-2">📚</p>
                        <p>No words saved{vocabView === "chapter" ? " in this chapter" : ""} yet.</p>
                        <p className="mt-1 text-xs">Select text to save words to vocabulary.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredVocab.map((w) => {
                          const lemma = w.lemma || w.word;
                          const isForm = w.lemma && w.lemma.toLowerCase() !== w.word.toLowerCase();
                          const relevantOccs = vocabView === "chapter"
                            ? w.occurrences.filter((o) => o.book_id === Number(bookId) && o.chapter_index === chapterIndex)
                            : w.occurrences.filter((o) => o.book_id === Number(bookId));
                          return (
                            <div key={w.id} className="rounded-lg bg-amber-50 border border-amber-200 overflow-hidden">
                              {/* Lemma header */}
                              <button
                                onClick={() => router.push(`/vocabulary?word=${encodeURIComponent(w.word)}`)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-amber-100 transition-colors text-left"
                              >
                                <span className="text-sm font-semibold text-ink">{lemma}</span>
                                {isForm && (
                                  <span className="text-[10px] text-amber-600 shrink-0 italic">{w.word}</span>
                                )}
                              </button>
                              {/* Context occurrences */}
                              {relevantOccs.map((occ, i) => (
                                <button
                                  key={i}
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
                                  className="w-full text-left border-t border-amber-200 px-3 py-1.5 hover:bg-amber-100 transition-colors"
                                >
                                  {vocabView === "book" && (
                                    <span className="text-[10px] text-stone-400 mr-1">Ch.{occ.chapter_index + 1}</span>
                                  )}
                                  <span className="text-xs text-stone-500 italic line-clamp-2">&ldquo;{occ.sentence_text}&rdquo;</span>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
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
                        checked={translationEnabled}
                        onChange={(e) => { setTranslationEnabled(e.target.checked); saveSettings({ translationEnabled: e.target.checked }); }}
                      />
                      <span className="text-sm text-ink">{translationEnabled ? "Enabled" : "Disabled"}</span>
                    </label>

                    {/* Language selector */}
                    <div className="mb-4">
                      <label className="block text-xs text-amber-700 mb-1">Target language</label>
                      <select
                        className="w-full text-sm rounded-lg border border-amber-300 px-3 py-2 text-ink bg-white"
                        value={translationLang}
                        onChange={(e) => {
                          setTranslationLang(e.target.value);
                          saveSettings({ translationLang: e.target.value });
                        }}
                      >
                        {LANGUAGES.filter((l) => l.code !== bookLanguage).map((l) => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Display mode */}
                    <div className="mb-4">
                      <label className="block text-xs text-amber-700 mb-1">Display</label>
                      <div className="flex rounded-lg border border-amber-300 overflow-hidden">
                        <button
                          onClick={() => setDisplayMode("inline")}
                          className={`flex-1 px-3 py-2 text-sm transition-colors ${
                            displayMode === "inline" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                          }`}
                        >Inline</button>
                        <button
                          onClick={() => setDisplayMode("parallel")}
                          className={`flex-1 px-3 py-2 text-sm border-l border-amber-300 transition-colors ${
                            displayMode === "parallel" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                          }`}
                        >Side by side</button>
                      </div>
                    </div>

                    {/* Translate this chapter button — explicit user action required */}
                    {translationEnabled && !translationLoading && translatedParagraphs.length === 0 && translationUsedProvider === "" && (
                      <div className="mb-4">
                        {session?.backendToken ? (
                          <button
                            onClick={handleTranslateThisChapter}
                            className="w-full px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
                          >
                            Translate this chapter
                          </button>
                        ) : (
                          <p className="text-xs text-amber-700">
                            <a href="/api/auth/signin" className="underline font-medium">Sign in</a> to translate this chapter.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Status */}
                    {translationEnabled && (
                      <div className="text-xs">
                        {translationLoading && !translationUsedProvider && (
                          <span className="animate-pulse text-amber-600">Checking for translation…</span>
                        )}
                        {translationLoading && translationUsedProvider.startsWith("queue") && (
                          <span className="animate-pulse text-sky-600">
                            {translationUsedProvider === "queue · translating now"
                              ? "Translating now…"
                              : translationUsedProvider === "queue · worker is offline"
                              ? "Worker offline — translation queued"
                              : `In queue · position ${translationUsedProvider.replace(/^queue · position /, "")}`}
                          </span>
                        )}
                        {!translationLoading && (
                          translationUsedProvider === "cache" ? (
                            <span className="text-stone-400">Loaded from cache</span>
                          ) : translationUsedProvider.startsWith("cache · ") ? (
                            <span className="text-stone-400">From cache · <span className="font-mono">{translationUsedProvider.slice(8)}</span></span>
                          ) : translationUsedProvider === "translated" ? (
                            <span className="text-green-700">Translated</span>
                          ) : translationUsedProvider.startsWith("translated · ") ? (
                            <span className="text-green-700">Translated · <span className="font-mono">{translationUsedProvider.slice(13)}</span></span>
                          ) : translationUsedProvider.startsWith("queue failed") ? (
                            <span className="text-red-600">{translationUsedProvider}</span>
                          ) : null
                        )}
                      </div>
                    )}

                    {/* Book-level translation progress */}
                    {translationEnabled && bookTranslationStatus && (() => {
                      const s = bookTranslationStatus;
                      const queued = (s.queue_pending ?? 0) + (s.queue_running ?? 0);
                      const ready = s.translated_chapters;
                      const total = s.total_chapters;
                      const notStarted = Math.max(0, total - ready - queued - (s.queue_failed ?? 0));
                      return (
                        <div className="mt-3 pt-3 border-t border-amber-200">
                          <div className="flex items-center gap-1.5 text-xs text-amber-700">
                            {queued > 0 && <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />}
                            <span>
                              <strong>{ready} / {total}</strong> chapters translated
                              {queued > 0 && (<> · <strong>{queued}</strong> processing</>)}
                              {s.queue_failed ? (<> · <span className="text-red-600">{s.queue_failed} failed</span></>) : null}
                            </span>
                          </div>
                          {notStarted > 0 && (
                            <button
                              onClick={handleTranslateWholeBook}
                              disabled={enqueueingBook}
                              className="mt-2 w-full text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                            >
                              {enqueueingBook ? "Queueing…" : `Translate remaining ${notStarted}`}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Admin: retranslate */}
                    {isAdmin && !translationLoading && translatedParagraphs.length > 0 && (
                      <button
                        onClick={handleRetranslate}
                        className="mt-3 w-full text-xs px-3 py-2 rounded-lg border border-amber-300 text-amber-600 hover:bg-amber-50"
                      >
                        Retranslate chapter
                      </button>
                    )}

                    {/* Retry failed */}
                    {!translationLoading && translationUsedProvider.startsWith("queue failed") && (
                      <button
                        onClick={handleRetryFailed}
                        className="mt-2 w-full text-xs px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                      >
                        Retry failed translation
                      </button>
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
          <div className="h-[55vh] bg-parchment border-t border-amber-200 rounded-t-2xl shadow-2xl flex flex-col animate-slide-up safe-bottom">
            {/* Drag handle + close */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-amber-200 shrink-0">
              <div className="w-10 h-1 bg-amber-200 rounded-full" />
              <span className="font-serif font-semibold text-ink text-sm">Chat</span>
              <button
                onClick={() => { setSidebarOpen(false); setChatSheetText(null); }}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-700 text-lg"
                aria-label="Close chat"
              >✕</button>
            </div>
            <InsightChat
              bookId={bookId}
              userId={session?.backendUser?.id ?? null}
              hasGeminiKey={hasGeminiKey ?? false}
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
                saveInsight({ book_id: Number(bookId), chapter_index: chapterIndex, question, answer, context_text: context })
                  .then(() => setObsidianToast("Insight saved to book notes"))
                  .catch(() => setObsidianToast("Failed to save insight"))
                  .finally(() => setTimeout(() => setObsidianToast(null), 3000));
              } : undefined}
            />
          </div>
        </div>
      )}


      {/* ── Mobile floating bottom toolbar ─────────────────────────────── */}
      {!loading && chapters.length > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 safe-bottom">
          {/* Translation options expand panel */}
          {translateExpanded && translationEnabled && (
            <div className="bg-white/95 backdrop-blur border-t border-amber-200 px-3 py-2 flex items-center gap-2 animate-slide-up">
              <select
                className="text-xs rounded border border-amber-300 px-2 py-2 text-ink bg-white flex-1 min-h-[44px]"
                value={translationLang}
                onChange={(e) => setTranslationLang(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <div className="flex rounded border border-amber-300 overflow-hidden text-xs">
                <button
                  onClick={() => setDisplayMode("inline")}
                  className={`px-3 py-2 min-h-[44px] transition-colors ${
                    displayMode === "inline" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                  }`}
                >Inline</button>
                <button
                  onClick={() => setDisplayMode("parallel")}
                  className={`px-3 py-2 min-h-[44px] border-l border-amber-300 transition-colors ${
                    displayMode === "parallel" ? "bg-amber-700 text-white" : "text-amber-700 hover:bg-amber-50"
                  }`}
                >Side by side</button>
              </div>
            </div>
          )}

          {/* Notes expand panel */}
          {session?.backendToken && notesExpanded && (
            <div className="bg-white/95 backdrop-blur border-t border-amber-200 px-3 py-2 max-h-60 overflow-y-auto animate-slide-up">
              {annotations.length === 0 ? (
                <div className="text-center text-stone-400 py-4 text-sm">
                  <p className="text-2xl mb-1">📝</p>
                  <p>No annotations yet.</p>
                  <p className="text-xs mt-1">Long-press text to add one.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {annotations.map((ann) => (
                    <button
                      key={ann.id}
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
                      className="w-full text-left px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-xs"
                    >
                      <div className="text-ink line-clamp-2">{ann.sentence_text}</div>
                      {ann.note_text && (
                        <div className="text-stone-500 mt-0.5 line-clamp-1 italic">{ann.note_text}</div>
                      )}
                    </button>
                  ))}
                </div>
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
              className={`h-10 w-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                translationEnabled
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label="Translation"
            >🌐</button>

            <button
              onClick={() => {
                const ttsEl = document.querySelector<HTMLButtonElement>("[data-tts-play]");
                if (ttsEl) ttsEl.click();
              }}
              className={`h-10 w-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                ttsIsPlaying
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label={ttsIsPlaying ? "Pause" : "Read aloud"}
            >{ttsIsPlaying ? "⏸" : "▶"}</button>

            <select
              className="h-10 text-xs rounded-lg border border-amber-200 px-1 text-amber-700 bg-white max-w-[110px] truncate"
              value={chapterIndex}
              onChange={(e) => goToChapter(Number(e.target.value))}
            >
              {chapters.map((ch, i) => (
                <option key={i} value={i}>
                  {i + 1}. {ch.title || `§${i + 1}`}
                </option>
              ))}
            </select>

            {session?.backendToken && (
              <button
                onClick={() => setNotesExpanded((v) => !v)}
                className={`relative h-10 w-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                  notesExpanded
                    ? "bg-amber-700 text-white border-amber-700"
                    : "text-amber-700 bg-amber-50 border-amber-200"
                }`}
                aria-label="Notes"
              >
                📝
                {annotations.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-amber-600 text-white text-[8px] font-bold px-0.5">
                    {annotations.length}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`h-10 w-10 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                sidebarOpen
                  ? "bg-amber-700 text-white border-amber-700"
                  : "text-amber-700 bg-amber-50 border-amber-200"
              }`}
              aria-label="Insight chat"
            >💬</button>
          </div>
        </div>
      )}
    </div>
  );
}
