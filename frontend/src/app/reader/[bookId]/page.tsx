"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { getBookChapters, deleteTranslationCache, getAudiobook, deleteAudiobook, synthesizeSpeech, getMe, getBookTranslationStatus, requestChapterTranslation, retryChapterTranslation, enqueueBookTranslation, saveReadingProgress, getAnnotations, saveVocabularyWord, exportVocabularyToObsidian, saveInsight, TranslationStatus, BookMeta, BookChapter, Audiobook, ApiError, Annotation } from "@/lib/api";
import { recordRecentBook, saveLastChapter, getLastChapter } from "@/lib/recentBooks";
import { getSettings, saveSettings, FontSize, Theme } from "@/lib/settings";
import InsightChat, { LANGUAGES } from "@/components/InsightChat";
import TTSControls from "@/components/TTSControls";
import TranslationView from "@/components/TranslationView";
import AudiobookPlayer from "@/components/AudiobookPlayer";
import AudiobookSearch from "@/components/AudiobookSearch";
import SentenceReader from "@/components/SentenceReader";
import WordLookup from "@/components/WordLookup";
import AnnotationToolbar from "@/components/AnnotationToolbar";
import AnnotationsSidebar from "@/components/AnnotationsSidebar";
import VocabularyToast from "@/components/VocabularyToast";

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
  const [lookupWord, setLookupWord] = useState<{ word: string; x: number; y: number } | null>(null);

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsLoading, setAnnotationsLoading] = useState(false);
  const [annotationPanel, setAnnotationPanel] = useState<{
    sentenceText: string;
    chapterIndex: number;
    position: { x: number; y: number };
  } | null>(null);
  const [scrollTargetSentence, setScrollTargetSentence] = useState<string | undefined>();

  // Vocabulary toast
  const [vocabToastWord, setVocabToastWord] = useState<string | null>(null);

  // Obsidian export toast
  const [obsidianToast, setObsidianToast] = useState<string | null>(null);

  // Audiobook
  const [audiobookEnabled, setAudiobookEnabled] = useState(true);
  const [audiobook, setAudiobook] = useState<Audiobook | null>(null);
  const [showAudioSearch, setShowAudioSearch] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const seekAudioRef = useRef<(t: number) => void>(() => {});

  // TTS Read-button playback state — fed by TTSControls via callback props.
  // When no LibriVox audiobook is linked, these drive the SentenceReader's
  // sentence highlighting and click-to-seek.
  const [ttsCurrentTime, setTtsCurrentTime] = useState(0);
  const [ttsDuration, setTtsDuration] = useState(0);
  const [ttsIsPlaying, setTtsIsPlaying] = useState(false);
  const [ttsIsLoading, setTtsIsLoading] = useState(false);
  const [ttsChunks, setTtsChunks] = useState<{ text: string; duration: number }[]>([]);
  const ttsSeekRef = useRef<(t: number) => void>(() => {});

  // Sidebar (insight chat) — hidden by default, resizable
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

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
  const translationCache = useRef(new Map<string, string[]>());
  const currentChapterKey = useRef<string>(""); // tracks which chapter is currently displayed
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationLang, setTranslationLang] = useState("en");
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

  // Read settings on mount
  useEffect(() => {
    const s = getSettings();
    setTranslationLang(s.translationLang);
    // translationProvider setting is retained for back-compat but no longer read here.
    setAudiobookEnabled(s.audiobookEnabled);
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
        setChapterIndex(Math.min(savedChapter, data.chapters.length - 1));
        recordRecentBook(data.meta, savedChapter);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  // Load saved audiobook for this book
  useEffect(() => {
    if (!bookId) return;
    setAudiobook(null);
    getAudiobook(Number(bookId)).then(setAudiobook).catch(() => {});
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
  useEffect(() => {
    const current = chapters[chapterIndex];
    if (!translationEnabled || !current?.text) {
      setTranslatedParagraphs([]);
      setTranslatedTitle(null);
      return;
    }
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    currentChapterKey.current = cacheKey;

    if (translationCache.current.has(cacheKey)) {
      setTranslatedParagraphs(translationCache.current.get(cacheKey)!);
      setTranslationUsedProvider("cached");
      return;
    }

    // If logged in but key status not yet loaded, wait for getMe() to resolve.
    if (session && hasGeminiKey === null) return;

    let cancelled = false;
    setTranslationLoading(true);
    setTranslatedParagraphs([]);
    setTranslationUsedProvider("");

    const bid = Number(bookId);

    function showCached(res: {
      paragraphs?: string[];
      provider?: string;
      model?: string;
      title_translation?: string | null;
    }) {
      if (!res.paragraphs) return;
      translationCache.current.set(cacheKey, res.paragraphs);
      setTranslatedParagraphs(res.paragraphs);
      setTranslatedTitle(res.title_translation ?? null);
      const providerLabel = res.provider
        ? (res.model ? `${res.provider} (${res.model})` : res.provider)
        : "cached";
      setTranslationUsedProvider(providerLabel);
      setTranslationLoading(false);
    }

    (async () => {
      // 1. Request the translation — returns cached OR queue status.
      let res;
      try {
        res = await requestChapterTranslation(bid, chapterIndex, translationLang);
      } catch (e) {
        console.error("Failed to request chapter translation:", e);
        if (!cancelled && currentChapterKey.current === cacheKey) {
          if (e instanceof ApiError && e.status === 401) {
            setTranslationUsedProvider("login required");
          } else {
            setTranslationUsedProvider("error · check admin queue");
          }
          setTranslationLoading(false);
        }
        return;
      }
      if (cancelled || currentChapterKey.current !== cacheKey) return;

      if (res.status === "ready") {
        showCached(res);
        return;
      }

      // Logged in but no Gemini key — translation was queued but won't run
      // without a key. Show a notice instead of the misleading queue banner.
      if (hasGeminiKey === false) {
        if (!cancelled && currentChapterKey.current === cacheKey) {
          setTranslationUsedProvider("gemini key required");
          setTranslationLoading(false);
        }
        return;
      }

      // 2. Queued / running — show status banner and poll every 3s.
      //    No hard timeout: as long as the chapter is actually being
      //    processed, we keep waiting. The user can toggle translate off
      //    if they want to stop.
      function describeStatus(r: { status: string; position?: number | null; worker_running?: boolean }): string {
        if (r.status === "running") return "queue · translating now";
        // Pending: distinguish "worker is processing, wait your turn"
        // from "worker is offline — this will never complete without admin action".
        if (r.worker_running === false) return "queue · worker is offline";
        return `queue · position ${r.position ?? "?"}`;
      }

      setTranslationUsedProvider(describeStatus(res));

      // Kick the whole-book banner immediately so "N not started" doesn't
      // misreport the chapter we just enqueued — users clicking "Translate
      // all N remaining" next would otherwise see a stale count and a
      // confusing no-op ("enqueued=0" because we already enqueued this).
      (async () => {
        try {
          const status = await getBookTranslationStatus(bid, translationLang);
          if (!cancelled && currentChapterKey.current === cacheKey) {
            setBookTranslationStatus(status);
          }
        } catch { /* ignore */ }
      })();

      const POLL_MS = 3000;
      while (!cancelled && currentChapterKey.current === cacheKey) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (cancelled || currentChapterKey.current !== cacheKey) return;
        let tick;
        try {
          tick = await requestChapterTranslation(bid, chapterIndex, translationLang);
        } catch {
          continue; // transient error — try again next tick
        }
        if (cancelled || currentChapterKey.current !== cacheKey) return;

        if (tick.status === "ready") {
          showCached(tick);
          return;
        }
        if (tick.status === "failed") {
          setTranslationUsedProvider(
            `queue failed${tick.attempts ? ` · ${tick.attempts} attempts` : ""}`,
          );
          setTranslationLoading(false);
          return;
        }
        setTranslationUsedProvider(describeStatus(tick));
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, chapterIndex, bookId, hasGeminiKey]);

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
    if (sel.length > 10) setSelectedText(sel);
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
    saveLastChapter(Number(bookId), index);
    if (session?.backendToken) {
      saveReadingProgress(Number(bookId), index).catch(() => {});
    }
    setSelectedText("");
    setTranslatedParagraphs([]);
    setTranslatedTitle(null);
    setTranslationUsedProvider("");
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAudioIsPlaying(false);
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
      <header className="border-b border-amber-200 bg-white/70 backdrop-blur shrink-0">
        {/* Row 1: nav + title + chapter selector + chat toggle */}
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
                <h1 className="font-serif font-bold text-ink truncate text-sm">{meta.title}</h1>
                <p className="text-xs text-amber-700 truncate">{meta.authors.join(", ")}</p>
              </>
            ) : (
              <div className="h-4 w-48 bg-amber-200 animate-pulse rounded" />
            )}
          </div>

          {/* Chapter navigation */}
          <div className="flex items-center gap-1 shrink-0">
            {loading ? (
              <span className="text-xs text-amber-500 animate-pulse">Loading…</span>
            ) : (
              <>
                <button
                  onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                  disabled={chapterIndex === 0}
                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm flex items-center justify-center"
                >‹</button>
                <select
                  className="text-xs rounded border border-amber-300 px-2 py-1.5 text-ink bg-white max-w-[120px] md:max-w-[160px] min-h-[44px] md:min-h-0"
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
                  className="min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm flex items-center justify-center"
                >›</button>
              </>
            )}
          </div>

          {/* Font size */}
          <button
            onClick={cycleFontSize}
            title={`Font size: ${fontSize}`}
            className="shrink-0 w-10 h-10 md:w-8 md:h-8 rounded-full border border-amber-300 hover:bg-amber-100 text-xs font-bold text-amber-700 transition-colors flex items-center justify-center"
          >
            {fontSize === "sm" ? "A" : fontSize === "base" ? "A" : fontSize === "lg" ? "A" : "A"}
            <span className="text-[8px] align-super">{fontSize === "sm" ? "-" : fontSize === "base" ? "" : fontSize === "lg" ? "+" : "++"}</span>
          </button>

          {/* Theme */}
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="shrink-0 w-10 h-10 md:w-8 md:h-8 rounded-full border border-amber-300 hover:bg-amber-100 text-sm transition-colors flex items-center justify-center"
          >
            {theme === "light" ? "☀" : theme === "sepia" ? "📖" : "🌙"}
          </button>

          {/* Profile */}
          <button
            onClick={() => router.push("/profile")}
            title={session?.backendUser?.name ?? "Profile"}
            className="shrink-0 w-10 h-10 md:w-8 md:h-8 rounded-full overflow-hidden border border-amber-300 hover:border-amber-500 transition-colors"
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

          {/* Insight chat toggle */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            title="Toggle insight chat"
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg border text-xs font-medium transition-colors min-h-[44px] md:min-h-0 ${
              sidebarOpen
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.836L3 20l1.09-3.27A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="hidden sm:inline">Insight</span>
          </button>

          {/* Annotations sidebar */}
          {session?.backendToken && (
            <AnnotationsSidebar
              annotations={annotations}
              totalCount={annotations.length}
              loading={annotationsLoading}
              onJump={(ann) => {
                if (ann.chapter_index !== chapterIndex) {
                  setChapterIndex(ann.chapter_index);
                  // Scroll after chapter loads
                  setTimeout(() => setScrollTargetSentence(ann.sentence_text), 400);
                } else {
                  setScrollTargetSentence(undefined);
                  setTimeout(() => setScrollTargetSentence(ann.sentence_text), 10);
                }
              }}
              onEdit={(ann) => setAnnotationPanel({
                sentenceText: ann.sentence_text,
                chapterIndex: ann.chapter_index,
                position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              })}
            />
          )}

          {/* Vocabulary link — hidden on small screens */}
          {session?.backendToken && (
            <button
              onClick={() => router.push("/vocabulary")}
              title="Vocabulary"
              className="hidden md:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors"
            >
              📚 Vocab
            </button>
          )}

          {/* Export vocabulary to Obsidian — hidden on small screens */}
          {session?.backendToken && (
            <button
              onClick={handleObsidianExport}
              title="Export vocabulary to Obsidian"
              className="hidden lg:flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors"
            >
              ↗ Obsidian
            </button>
          )}

          {/* Audiobook toggle — only shown when feature is enabled in settings */}
          {audiobookEnabled && (
            <button
              onClick={() => audiobook ? undefined : setShowAudioSearch(true)}
              title={audiobook ? "Audiobook linked" : "Find audiobook"}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                audiobook
                  ? "bg-amber-100 text-amber-900 border-amber-400"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              🎧 <span className="hidden sm:inline">{audiobook ? "Audio" : "Find Audio"}</span>
            </button>
          )}
        </div>

        {/* Row 2: Translation toolbar */}
        <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 pb-2 flex-wrap">
          <button
            onClick={() => setTranslationEnabled((v) => !v)}
            className={`text-xs px-3 py-2 md:py-1 rounded-full border font-medium transition-colors min-h-[44px] md:min-h-0 ${
              translationEnabled
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            🌐 Translate
          </button>

          {translationEnabled && (
            <>
              <select
                className="text-xs rounded border border-amber-300 px-2 py-1 text-ink bg-white"
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
                  className={`px-3 py-1 transition-colors ${
                    displayMode === "inline"
                      ? "bg-amber-700 text-white"
                      : "text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  Inline
                </button>
                <button
                  onClick={() => setDisplayMode("parallel")}
                  className={`px-3 py-1 border-l border-amber-300 transition-colors ${
                    displayMode === "parallel"
                      ? "bg-amber-700 text-white"
                      : "text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  Side by side
                </button>
              </div>

              {/* Provider dropdown removed — all translations now flow
                  through the queue worker which uses the admin's
                  configured model chain. Users no longer choose their
                  own Gemini vs. Google provider. */}

              {/* Show the translation status text whether we're loading or
                  done. While queued this surfaces "queue · position N" /
                  "queue · translating now" so the user sees progress
                  instead of an opaque "Translating…". When complete it
                  shows the provider/model that produced the result. */}
              {translationLoading ? (
                <span className="text-xs text-amber-600 animate-pulse">
                  {translationUsedProvider || "Translating…"}
                </span>
              ) : translationUsedProvider &&
                translationUsedProvider !== "login required" &&
                translationUsedProvider !== "gemini key required" ? (
                <span className="text-xs text-amber-400">
                  via {translationUsedProvider}
                </span>
              ) : null}

              {isAdmin && !translationLoading && translatedParagraphs.length > 0 && (
                <button
                  onClick={handleRetranslate}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-600 hover:bg-amber-50 ml-auto"
                >
                  Retranslate
                </button>
              )}

              {/* Any user can retry their own failed chapter — the queue row
                  is in 'failed' state, a fresh request is idempotent, and
                  priority=10 means the worker picks it up ahead of background
                  auto-enqueued items. */}
              {!translationLoading &&
                translationUsedProvider.startsWith("queue failed") && (
                  <button
                    onClick={handleRetryFailed}
                    className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 ml-auto"
                    title="Re-queue this chapter for the background worker"
                  >
                    Retry
                  </button>
                )}
            </>
          )}
        </div>
      </header>

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

      {/* Book-level translation progress — shown whenever the queue is
          holding at least one chapter of THIS book in THIS language,
          even if a legacy bulk job isn't running. Gives the user a
          whole-book view (e.g. "18/21 chapters ready · 3 processing")
          in addition to the per-chapter banner above. */}
      {translationEnabled && bookTranslationStatus && (() => {
        const s = bookTranslationStatus;
        const queued = (s.queue_pending ?? 0) + (s.queue_running ?? 0);
        const ready = s.translated_chapters;
        const total = s.total_chapters;
        // Chapters that are neither done nor queued — the "nothing is
        // happening for these" bucket the user can act on via the
        // Translate-whole-book button.
        const notStarted = Math.max(
          0,
          total - ready - queued - (s.queue_failed ?? 0),
        );
        return (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2 min-w-0">
              <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
              <span>
                <strong>{ready} / {total}</strong> chapters translated
                {queued > 0 && (
                  <>
                    {" · "}
                    <strong>{queued}</strong> still processing
                    {s.queue_running ? ` (${s.queue_running} running)` : ""}
                  </>
                )}
                {s.queue_failed ? (
                  <>
                    {" · "}
                    <span className="text-red-600">{s.queue_failed} failed</span>
                  </>
                ) : null}
                {notStarted > 0 && (
                  <>
                    {" · "}
                    <span className="text-stone-500">{notStarted} not started</span>
                  </>
                )}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {/* Any authenticated user can queue the whole book they're
                  reading. Priority=20 (above admin auto, below active-
                  reader on-demand) so the click is honored without
                  starving whoever is currently waiting on a chapter. */}
              {notStarted > 0 && (
                <button
                  onClick={handleTranslateWholeBook}
                  disabled={enqueueingBook}
                  className="text-xs px-3 py-1 rounded-full border border-amber-400 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  title={`Queue the remaining ${notStarted} chapters into ${translationLang}`}
                >
                  {enqueueingBook ? "Queueing…" : `Translate all ${notStarted} remaining`}
                </button>
              )}
              <span className="text-amber-500">Polls every 15s</span>
            </span>
          </div>
        );
      })()}

      {/* Reading progress bar — combines chapter position + scroll within chapter */}
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
            className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-8"
            onMouseUp={handleSelection}
            onTouchEnd={handleSelection}
            onDoubleClick={(e) => {
              const sel = window.getSelection()?.toString().trim();
              if (sel && sel.length > 1 && sel.length < 30 && !/\s/.test(sel)) {
                setLookupWord({ word: sel, x: e.clientX, y: e.clientY });
              }
            }}
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
                  duration={audiobook ? audioDuration : ttsDuration}
                  currentTime={audiobook ? audioCurrentTime : ttsCurrentTime}
                  isPlaying={audiobook ? audioIsPlaying : ttsIsPlaying}
                  chunks={!audiobook && ttsChunks.length > 0 ? ttsChunks : undefined}
                  disabled={!audiobook && ttsIsLoading}
                  translations={translationEnabled ? translatedParagraphs : undefined}
                  translationDisplayMode={displayMode}
                  translationLoading={translationLoading}
                  annotations={session?.backendToken ? annotations.filter((a) => a.chapter_index === chapterIndex) : undefined}
                  chapterIndex={chapterIndex}
                  onWordSave={session?.backendToken ? handleWordSave : undefined}
                  onWordSaveBlocked={!session?.backendToken ? () => setVocabToastWord("Login to save words") : undefined}
                  onAnnotate={session?.backendToken ? (sentenceText, ci, position) => {
                    setAnnotationPanel({ sentenceText, chapterIndex: ci, position });
                  } : undefined}
                  scrollTargetSentence={scrollTargetSentence}
                  onSegmentClick={(startTime, segText) => {
                    if (audiobook) {
                      seekAudioRef.current(startTime);
                      return;
                    }
                    if (ttsDuration > 0) {
                      ttsSeekRef.current(startTime);
                      return;
                    }
                    synthesizeSpeech(segText, bookLanguage, 1.0, getSettings().ttsGender)
                      .then(({ url }) => {
                        const audio = new Audio(url);
                        audio.onended = () => URL.revokeObjectURL(url);
                        audio.play().catch(() => URL.revokeObjectURL(url));
                      })
                      .catch(() => {
                        window.speechSynthesis.cancel();
                        const utter = new SpeechSynthesisUtterance(segText);
                        utter.lang = bookLanguage;
                        window.speechSynthesis.speak(utter);
                      });
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

          {/* Dictionary lookup popup */}
          {lookupWord && (
            <WordLookup
              word={lookupWord.word}
              position={{ x: lookupWord.x, y: lookupWord.y }}
              onClose={() => setLookupWord(null)}
            />
          )}

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

          {/* Audiobook player */}
          {audiobookEnabled && audiobook && (
            <AudiobookPlayer
              audiobook={audiobook}
              chapterIndex={chapterIndex}
              onChapterChange={goToChapter}
              onUnlink={async () => {
                await deleteAudiobook(Number(bookId)).catch(() => {});
                setAudiobook(null);
                setAudioDuration(0);
                setAudioCurrentTime(0);
                setAudioIsPlaying(false);
              }}
              onTimeUpdate={setAudioCurrentTime}
              onDurationChange={setAudioDuration}
              onPlayStateChange={setAudioIsPlaying}
              seekRef={seekAudioRef}
            />
          )}

          {/* TTS + Recorder */}
          <div className="border-t border-amber-200 shrink-0">
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

        {/* Insight Chat sidebar — fullscreen overlay on mobile, inline on desktop */}
        <div
          style={sidebarOpen ? { width: sidebarWidth } : { width: 0 }}
          className={`flex flex-col overflow-hidden shrink-0 ${
            sidebarOpen
              ? "fixed inset-0 z-40 bg-parchment !w-full md:static md:z-auto md:!w-auto md:border-l md:border-amber-200"
              : "border-l border-amber-200"
          }`}
        >
          {/* Mobile close button for fullscreen sidebar */}
          {sidebarOpen && (
            <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-amber-200 shrink-0 bg-white/70">
              <span className="font-serif font-semibold text-ink text-sm">Insight Chat</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-amber-700 hover:text-amber-900 text-lg"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            </div>
          )}
          {/* Keep mounted so chat history persists across open/close */}
          <InsightChat
            bookId={bookId}
            userId={session?.backendUser?.id ?? null}
            hasGeminiKey={hasGeminiKey ?? false}
            isVisible={sidebarOpen}
            chapterText={current?.text ?? ""}
            chapterTitle={current?.title || `Chapter ${chapterIndex + 1}`}
            selectedText={selectedText}
            bookTitle={meta?.title ?? ""}
            author={meta?.authors[0] ?? ""}
            bookLanguage={bookLanguage}
            onAIUsed={notifyAIUsed}
            chapterIndex={chapterIndex}
            onSaveInsight={session?.backendToken ? (question, answer) => {
              saveInsight({ book_id: Number(bookId), chapter_index: chapterIndex, question, answer })
                .then(() => setObsidianToast("Insight saved to book notes"))
                .catch(() => setObsidianToast("Failed to save insight"))
                .finally(() => setTimeout(() => setObsidianToast(null), 3000));
            } : undefined}
          />
        </div>
      </div>

      {/* Audiobook search modal */}
      {audiobookEnabled && showAudioSearch && (
        <AudiobookSearch
          bookId={Number(bookId)}
          defaultTitle={meta?.title ?? ""}
          defaultAuthor={meta?.authors[0] ?? ""}
          onLinked={(ab) => {
            setAudiobook(ab);
            setShowAudioSearch(false);
          }}
          onClose={() => setShowAudioSearch(false)}
        />
      )}
    </div>
  );
}
