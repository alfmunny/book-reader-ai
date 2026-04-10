"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBookChapters, translateText, BookMeta, BookChapter } from "@/lib/api";
import { recordRecentBook } from "@/lib/recentBooks";
import { getSettings } from "@/lib/settings";
import InsightChat, { LANGUAGES } from "@/components/InsightChat";
import TTSControls from "@/components/TTSControls";
import PronunciationRecorder from "@/components/PronunciationRecorder";
import TranslationView from "@/components/TranslationView";

// In-memory cache: bookId → chapters (survives client-side navigation)
const chaptersCache = new Map<string, BookChapter[]>();
const metaCache = new Map<string, BookMeta>();

export default function ReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const router = useRouter();

  const [meta, setMeta] = useState<BookMeta | null>(metaCache.get(bookId) ?? null);
  const [chapters, setChapters] = useState<BookChapter[]>(chaptersCache.get(bookId) ?? []);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [loading, setLoading] = useState(!chaptersCache.has(bookId));
  const [error, setError] = useState("");

  const [selectedText, setSelectedText] = useState("");
  const [showRecorder, setShowRecorder] = useState(false);
  const [spokenText, setSpokenText] = useState("");

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

  // Settings-seeded defaults (read once on mount)
  const [defaultInsightLang, setDefaultInsightLang] = useState("en");

  // Translation state
  const translationCache = useRef(new Map<string, string[]>());
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationLang, setTranslationLang] = useState("en");
  const [displayMode, setDisplayMode] = useState<"parallel" | "inline">("inline");
  const [translatedParagraphs, setTranslatedParagraphs] = useState<string[]>([]);
  const [translationLoading, setTranslationLoading] = useState(false);

  // Read settings on mount
  useEffect(() => {
    const s = getSettings();
    setDefaultInsightLang(s.insightLang);
    setTranslationLang(s.translationLang);
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
        setChapterIndex(0);
        recordRecentBook(data.meta);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [bookId]);

  const bookLanguage = meta?.languages[0] || "en";

  // Auto-translate when enabled or chapter/lang changes
  useEffect(() => {
    const current = chapters[chapterIndex];
    if (!translationEnabled || !current?.text) {
      setTranslatedParagraphs([]);
      return;
    }
    const cacheKey = `${bookId}-${chapterIndex}-${translationLang}`;
    if (translationCache.current.has(cacheKey)) {
      setTranslatedParagraphs(translationCache.current.get(cacheKey)!);
      return;
    }
    setTranslationLoading(true);
    setTranslatedParagraphs([]);
    translateText(current.text, bookLanguage, translationLang)
      .then((r) => {
        translationCache.current.set(cacheKey, r.paragraphs);
        setTranslatedParagraphs(r.paragraphs);
      })
      .catch(() => {})
      .finally(() => setTranslationLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, translationLang, chapterIndex, bookId]);

  const handleSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim() || "";
    if (sel.length > 10) setSelectedText(sel);
  }, []);

  function goToChapter(index: number) {
    setChapterIndex(index);
    setSelectedText("");
    setTranslatedParagraphs([]);
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
            ) : translationEnabled ? (
              <>
                <TranslationView
                  paragraphs={chapterParagraphs}
                  translations={translatedParagraphs}
                  displayMode={displayMode}
                  loading={translationLoading}
                />
                <div className={`mt-10 flex justify-between ${displayMode === "parallel" ? "max-w-5xl mx-auto" : "prose-reader mx-auto"}`}>
                  <button
                    onClick={() => goToChapter(Math.max(0, chapterIndex - 1))}
                    disabled={chapterIndex === 0}
                    className="text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30"
                  >← Previous</button>
                  <span className="text-xs text-amber-500 self-center">
                    {chapterIndex + 1} / {chapters.length}
                  </span>
                  <button
                    onClick={() => goToChapter(Math.min(chapters.length - 1, chapterIndex + 1))}
                    disabled={chapterIndex === chapters.length - 1}
                    className="text-sm text-amber-700 hover:text-amber-900 disabled:opacity-30"
                  >Next →</button>
                </div>
              </>
            ) : (
              <>
                <div className="prose-reader mx-auto whitespace-pre-wrap text-ink">
                  {current?.text ?? ""}
                </div>
                <div className="max-w-prose mx-auto mt-10 flex justify-between">
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

          {/* TTS + Recorder */}
          <div className="border-t border-amber-200 shrink-0">
            <TTSControls text={current?.text ?? ""} language={bookLanguage} />
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowRecorder((v) => !v)}
                className="text-xs text-amber-700 underline"
              >
                {showRecorder ? "Hide pronunciation practice" : "Practice reading aloud"}
              </button>
              {showRecorder && (
                <div className="mt-2">
                  <PronunciationRecorder
                    language={bookLanguage}
                    onResult={(t) => setSpokenText(t)}
                  />
                </div>
              )}
            </div>
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
            chapterText={current?.text ?? ""}
            selectedText={selectedText}
            bookTitle={meta?.title ?? ""}
            author={meta?.authors[0] ?? ""}
            bookLanguage={bookLanguage}
            defaultInsightLang={defaultInsightLang}
            spokenText={spokenText}
          />
        </div>
      </div>
    </div>
  );
}
