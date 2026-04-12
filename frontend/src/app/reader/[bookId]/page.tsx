"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getBookChapters, translateText, getTranslationCache, saveTranslationCache, deleteTranslationCache, getAudiobook, deleteAudiobook, synthesizeSpeech, getMe, BookMeta, BookChapter, Audiobook } from "@/lib/api";
import { recordRecentBook, saveLastChapter, getLastChapter } from "@/lib/recentBooks";
import { getSettings } from "@/lib/settings";
import InsightChat, { LANGUAGES } from "@/components/InsightChat";
import TTSControls from "@/components/TTSControls";
import TranslationView from "@/components/TranslationView";
import AudiobookPlayer from "@/components/AudiobookPlayer";
import AudiobookSearch from "@/components/AudiobookSearch";
import SentenceReader from "@/components/SentenceReader";

// In-memory cache: bookId → chapters (survives client-side navigation)
const chaptersCache = new Map<string, BookChapter[]>();
const metaCache = new Map<string, BookMeta>();

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [meta, setMeta] = useState<BookMeta | null>(metaCache.get(bookId) ?? null);
  const [chapters, setChapters] = useState<BookChapter[]>(chaptersCache.get(bookId) ?? []);
  const [chapterIndex, setChapterIndex] = useState(() => getLastChapter(Number(bookId)));
  const [loading, setLoading] = useState(!chaptersCache.has(bookId));
  const [error, setError] = useState("");

  const [selectedText, setSelectedText] = useState("");

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
  const [hasGeminiKey, setHasGeminiKey] = useState(true); // optimistic: assume key exists until confirmed otherwise
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
  const [displayMode, setDisplayMode] = useState<"parallel" | "inline">("parallel");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);

  // Read settings on mount
  useEffect(() => {
    const s = getSettings();
    setTranslationLang(s.translationLang);
    setAudiobookEnabled(s.audiobookEnabled);
  }, []);

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

  const bookLanguage = meta?.languages[0] || "en";

  // Auto-translate when enabled or chapter/lang changes.
  // Splits the chapter into batches and translates progressively so
  // paragraphs appear one batch at a time instead of all-or-nothing.
  useEffect(() => {
    const current = chapters[chapterIndex];
    if (!translationEnabled || !current?.text) {
      setTranslatedParagraphs([]);
      return;
    }
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    currentChapterKey.current = cacheKey;

    if (translationCache.current.has(cacheKey)) {
      setTranslatedParagraphs(translationCache.current.get(cacheKey)!);
      return;
    }

    let cancelled = false;
    setTranslationLoading(true);
    setTranslatedParagraphs([]);

    const bid = Number(bookId);

    (async () => {
      // 1. Quick cache check — returns instantly if backend has it
      const cached = await getTranslationCache(bid, chapterIndex, translationLang);
      if (cancelled || currentChapterKey.current !== cacheKey) return;
      if (cached) {
        translationCache.current.set(cacheKey, cached);
        setTranslatedParagraphs(cached);
        setTranslationLoading(false);
        return;
      }

      // 2. No cache — translate progressively in batches of ~3 paragraphs.
      //    Each batch appears as soon as it's done.
      const BATCH_SIZE = 3;
      const paragraphs = current.text.split(/\n\n+/).filter((p: string) => p.trim());
      const batches: string[][] = [];
      for (let i = 0; i < paragraphs.length; i += BATCH_SIZE) {
        batches.push(paragraphs.slice(i, i + BATCH_SIZE));
      }

      const accumulated: string[] = [];
      for (const batch of batches) {
        if (cancelled || currentChapterKey.current !== cacheKey) return;
        try {
          const r = await translateText(batch.join("\n\n"), bookLanguage, translationLang);
          accumulated.push(...r.paragraphs);
          if (!cancelled && currentChapterKey.current === cacheKey) {
            setTranslatedParagraphs([...accumulated]);
          }
          notifyAIUsed();
        } catch (e) {
          console.error("Translation batch failed:", e);
          notifyAIUsed();
          break;
        }
      }
      if (!cancelled && currentChapterKey.current === cacheKey) {
        translationCache.current.set(cacheKey, accumulated);
        setTranslationLoading(false);
        // Save to backend cache for next visit (fire-and-forget)
        saveTranslationCache(bid, chapterIndex, translationLang, accumulated).catch(() => {});
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, chapterIndex, bookId]);

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

  const handleSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() || "";
    if (sel.length > 10) setSelectedText(sel);
  }, []);

  function goToChapter(index: number) {
    setChapterIndex(index);
    saveLastChapter(Number(bookId), index);
    setSelectedText("");
    setTranslatedParagraphs([]);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    document.getElementById("reader-scroll")?.scrollTo(0, 0);
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
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push("/")}
            className="text-amber-700 hover:text-amber-900 text-sm shrink-0"
          >
            ← Library
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
                  className="px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm"
                >‹</button>
                <select
                  className="text-xs rounded border border-amber-300 px-2 py-1 text-ink bg-white max-w-[160px]"
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
                  className="px-2 py-1 rounded border border-amber-300 disabled:opacity-30 hover:bg-amber-100 text-sm"
                >›</button>
              </>
            )}
          </div>

          {/* Profile */}
          <button
            onClick={() => router.push("/profile")}
            title={session?.backendUser?.name ?? "Profile"}
            className="shrink-0 w-8 h-8 rounded-full overflow-hidden border border-amber-300 hover:border-amber-500 transition-colors"
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
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              sidebarOpen
                ? "bg-amber-700 text-white border-amber-700"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.836L3 20l1.09-3.27A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Insight
          </button>

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
              🎧 {audiobook ? "Audio" : "Find Audio"}
            </button>
          )}
        </div>

        {/* Row 2: Translation toolbar */}
        <div className="flex items-center gap-3 px-4 pb-2">
          <button
            onClick={() => setTranslationEnabled((v) => !v)}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
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

              {translationLoading && (
                <span className="text-xs text-amber-500 animate-pulse">Translating…</span>
              )}

              {isAdmin && !translationLoading && translatedParagraphs.length > 0 && (
                <button
                  onClick={handleRetranslate}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-600 hover:bg-amber-50 ml-auto"
                >
                  Retranslate
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Reader */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div
            id="reader-scroll"
            className="flex-1 overflow-y-auto px-8 py-8"
            onMouseUp={handleSelection}
            onTouchEnd={handleSelection}
          >
            {loading ? (
              <div className="max-w-prose mx-auto space-y-3 animate-pulse">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className={`h-4 bg-amber-200 rounded ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
                ))}
              </div>
            ) : (
              <>
                <SentenceReader
                  text={current?.text ?? ""}
                  duration={audiobook ? audioDuration : ttsDuration}
                  currentTime={audiobook ? audioCurrentTime : ttsCurrentTime}
                  isPlaying={audiobook ? audioIsPlaying : ttsIsPlaying}
                  chunks={!audiobook && ttsChunks.length > 0 ? ttsChunks : undefined}
                  disabled={!audiobook && ttsIsLoading}
                  // Translation props: SentenceReader renders both original
                  // (highlighted) and translation (when enabled). This ensures
                  // highlighting works regardless of translation state.
                  translations={translationEnabled ? translatedParagraphs : undefined}
                  translationDisplayMode={displayMode}
                  translationLoading={translationLoading}
                  onSegmentClick={(startTime, segText) => {
                    if (audiobook) {
                      seekAudioRef.current(startTime);
                      return;
                    }
                    if (ttsDuration > 0) {
                      ttsSeekRef.current(startTime);
                      return;
                    }
                    synthesizeSpeech(segText, bookLanguage, 1.0, getSettings().ttsProvider)
                      .then((url) => {
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
                <div className={`mt-10 flex justify-between ${translationEnabled && displayMode === "parallel" ? "max-w-5xl mx-auto" : "prose-reader mx-auto"}`}>
                  <button
                    onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                    disabled={chapterIndex === 0}
                    className="text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30"
                  >← Previous chapter</button>
                  <span className="text-xs text-amber-500 self-center">
                    {chapterIndex + 1} / {chapters.length}
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

        {/* Resize handle — only visible when sidebar is open */}
        {sidebarOpen && (
          <div
            onMouseDown={onResizeStart}
            className="w-1.5 shrink-0 cursor-col-resize bg-amber-100 hover:bg-amber-400 active:bg-amber-500 transition-colors relative group"
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

        {/* Insight Chat sidebar — always mounted, hidden with CSS when closed */}
        <div
          style={sidebarOpen ? { width: sidebarWidth } : { width: 0 }}
          className="border-l border-amber-200 flex flex-col overflow-hidden shrink-0"
        >
          {/* Keep mounted so chat history persists across open/close */}
          <InsightChat
            bookId={bookId}
            userId={session?.backendUser?.id ?? null}
            hasGeminiKey={hasGeminiKey}
            isVisible={sidebarOpen}
            chapterText={current?.text ?? ""}
            chapterTitle={current?.title || `Chapter ${chapterIndex + 1}`}
            selectedText={selectedText}
            bookTitle={meta?.title ?? ""}
            author={meta?.authors[0] ?? ""}
            bookLanguage={bookLanguage}
            onAIUsed={notifyAIUsed}
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
