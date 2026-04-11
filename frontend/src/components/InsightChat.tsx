"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getInsight,
  askQuestion,
  checkPronunciation,
  findVideos,
  VideoResult,
} from "@/lib/api";
import { getSettings } from "@/lib/settings";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
];

const HISTORY_KEY = (id: string) => `chat-history:${id}`;
const INITIAL_DISPLAY = 30; // messages shown on first load
const LOAD_BATCH = 20;      // messages revealed per "load earlier" click
const MAX_STORED = 200;     // cap localStorage to last N messages

type Tab = "chat" | "speak" | "video";

interface Message {
  role: "user" | "assistant";
  content: string;
  context?: string;       // selected-text attached when sent
  isChapterHeader?: true; // chapter divider message
  chapterKey?: string;    // which chapter this belongs to
}

interface Props {
  bookId: string;
  isVisible: boolean;       // true when the sidebar is open — gates insight fetching
  chapterText: string;
  chapterTitle: string;
  selectedText: string;
  bookTitle: string;
  author: string;
  bookLanguage: string;
  spokenText?: string;
  onAIUsed?: () => void;    // called whenever an AI (non-cached) call is made
}

export default function InsightChat({
  bookId,
  isVisible,
  chapterText,
  chapterTitle,
  selectedText,
  bookTitle,
  author,
  bookLanguage,
  spokenText = "",
  onAIUsed,
}: Props) {
  const [tab, setTab] = useState<Tab>("chat");

  // ── Chat ─────────────────────────────────────────────────────────────
  // Read language from settings at first render (lazy init avoids the
  // "parent state not yet updated" race where useState(prop) captures "en").
  const [lang, setLang] = useState(() => getSettings().insightLang);
  // Use a ref so effects that shouldn't re-run on lang-change can still read current value
  const langRef = useRef(lang);
  langRef.current = lang;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedFrom, setLoadedFrom] = useState(0);   // slice index into messages
  const [chatLoading, setChatLoading] = useState(false);
  const [input, setInput] = useState("");
  const [contextText, setContextText] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoad = useRef(0); // for scroll-anchor when loading earlier
  const visitedKeys = useRef(new Set<string>());
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const autoScrollRef = useRef(true);

  // ── 1. Load history when bookId changes ──────────────────────────────
  // IMPORTANT: this effect must be declared before the chapter-visit effect
  // so it runs first within the same commit and populates visitedKeys.
  useEffect(() => {
    visitedKeys.current.clear();
    setInput("");
    setContextText("");
    setChatLoading(false);

    try {
      const raw = localStorage.getItem(HISTORY_KEY(bookId));
      if (raw) {
        const stored: Message[] = JSON.parse(raw);
        setMessages(stored);
        setLoadedFrom(Math.max(0, stored.length - INITIAL_DISPLAY));
        stored
          .filter((m) => m.isChapterHeader && m.chapterKey)
          .forEach((m) => visitedKeys.current.add(m.chapterKey!));
      } else {
        setMessages([]);
        setLoadedFrom(0);
      }
    } catch {
      setMessages([]);
      setLoadedFrom(0);
    }
  }, [bookId]);

  // ── 2. Persist history on every change ───────────────────────────────
  useEffect(() => {
    if (!bookId) return;
    try {
      const toStore = messages.slice(-MAX_STORED);
      if (toStore.length > 0)
        localStorage.setItem(HISTORY_KEY(bookId), JSON.stringify(toStore));
    } catch {} // ignore quota errors
  }, [messages, bookId]);

  // ── 3. Chapter first-visit: add divider + fetch insight ──────────────
  // Only runs when the sidebar is visible (isVisible = true).
  // Including isVisible in deps means the effect re-evaluates when the
  // sidebar opens — if the current chapter was skipped while it was closed,
  // visitedKeys won't have its key yet, so the fetch fires immediately.
  useEffect(() => {
    if (!isVisible) return;                          // ← gate: don't fetch while hidden
    if (!chapterText || !bookTitle || !bookId) return;
    const key = chapterText.slice(0, 100);
    if (visitedKeys.current.has(key)) return;        // already fetched for this chapter
    visitedKeys.current.add(key);

    autoScrollRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: chapterTitle || "Chapter", isChapterHeader: true, chapterKey: key },
    ]);
    setChatLoading(true);

    onAIUsed?.();
    getInsight(chapterText, bookTitle, author, langRef.current)
      .then((r) => setMessages((prev) => [...prev, { role: "assistant", content: r.insight }]))
      .catch((e) =>
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }])
      )
      .finally(() => setChatLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterText, chapterTitle, bookTitle, bookId, author, isVisible]);

  // ── 4. Manual refresh (append new insight) ────────────────────────────
  useEffect(() => {
    if (refreshTick === 0 || !chapterText || !bookTitle) return;
    autoScrollRef.current = true;
    setChatLoading(true);
    onAIUsed?.();
    getInsight(chapterText, bookTitle, author, langRef.current)
      .then((r) => setMessages((prev) => [...prev, { role: "assistant", content: r.insight }]))
      .catch((e) =>
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }])
      )
      .finally(() => setChatLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // ── 5. Sync selected text into context chip ───────────────────────────
  useEffect(() => {
    if (selectedText) setContextText(selectedText);
  }, [selectedText]);

  // ── 6. Auto-scroll to bottom on new messages ──────────────────────────
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  // ── 7. Scroll anchor when loading earlier messages ────────────────────
  // useLayoutEffect runs synchronously after DOM update — perfect for
  // adjusting scroll position before the browser paints.
  useLayoutEffect(() => {
    if (scrollHeightBeforeLoad.current > 0 && messagesBoxRef.current) {
      const delta = messagesBoxRef.current.scrollHeight - scrollHeightBeforeLoad.current;
      messagesBoxRef.current.scrollTop += delta;
      scrollHeightBeforeLoad.current = 0;
    }
  }, [loadedFrom]);

  function loadEarlier() {
    autoScrollRef.current = false;
    if (messagesBoxRef.current)
      scrollHeightBeforeLoad.current = messagesBoxRef.current.scrollHeight;
    setLoadedFrom((n) => Math.max(0, n - LOAD_BATCH));
  }

  // ── Send message ──────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || chatLoading) return;
    const attachedContext = contextText || undefined;
    setInput("");
    autoScrollRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: text, context: attachedContext }]);
    setChatLoading(true);

    const parts: string[] = [];
    if (attachedContext) parts.push(`Selected passage:\n"${attachedContext}"`);
    const history = messagesRef.current
      .filter((m) => !m.isChapterHeader)
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
      .join("\n\n");
    if (history) parts.push(`Conversation:\n${history}`);
    parts.push(`Chapter excerpt:\n${chapterText.slice(0, 800)}`);
    const passage = parts.join("\n\n---\n\n");

    try {
      onAIUsed?.();
      const r = await askQuestion(text, passage, bookTitle, author, langRef.current);
      setMessages((prev) => [...prev, { role: "assistant", content: r.answer }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  // ── Speak ─────────────────────────────────────────────────────────────
  const [manualSpoken, setManualSpoken] = useState("");
  const [pronFeedback, setPronFeedback] = useState("");
  const [pronLoading, setPronLoading] = useState(false);

  async function runPronunciation() {
    const spoken = spokenText || manualSpoken;
    if (!spoken.trim() || !selectedText) return;
    setPronLoading(true);
    setPronFeedback("");
    onAIUsed?.();
    try {
      const r = await checkPronunciation(selectedText, spoken, bookLanguage);
      setPronFeedback(r.feedback);
    } catch (e: any) {
      setPronFeedback(`Error: ${e.message}`);
    } finally {
      setPronLoading(false);
    }
  }

  // ── Video ─────────────────────────────────────────────────────────────
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [videoQuery, setVideoQuery] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState("");

  async function runVideos() {
    const text = selectedText || chapterText.slice(0, 400);
    setVideoLoading(true);
    setVideoError("");
    setVideos([]);
    setVideoQuery("");
    onAIUsed?.();
    try {
      const r = await findVideos(text, bookTitle, author);
      setVideos(r.videos);
      setVideoQuery(r.query);
      if (r.videos.length === 0)
        setVideoError("No videos found. Configure your YouTube API key.");
    } catch (e: any) {
      setVideoError(e.message);
    } finally {
      setVideoLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const displayedMessages = messages.slice(loadedFrom);
  const hasEarlier = loadedFrom > 0;

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "speak", icon: "🎙️", label: "Speak" },
    { id: "video", icon: "🎬", label: "Video" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Tab bar */}
      <div className="flex border-b border-amber-200 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-amber-100 text-amber-900 border-b-2 border-amber-600"
                : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── CHAT TAB ─────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Language bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-100 shrink-0 bg-amber-50/50">
            <span className="text-xs text-amber-600 shrink-0">Language</span>
            <select
              className="flex-1 text-xs rounded border border-amber-300 px-2 py-1 text-ink bg-white"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <button
              onClick={() => setRefreshTick((n) => n + 1)}
              title="Append a fresh insight"
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-amber-200 text-amber-600 hover:text-amber-900 text-base"
            >
              ↺
            </button>
          </div>

          {/* Messages */}
          <div ref={messagesBoxRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* Load earlier */}
            {hasEarlier && (
              <button
                onClick={loadEarlier}
                className="w-full text-xs text-amber-600 hover:text-amber-900 py-1.5 rounded-lg border border-amber-200 hover:bg-amber-50 transition-colors"
              >
                ↑ Load earlier messages ({loadedFrom} more)
              </button>
            )}

            {/* Initial loading skeleton */}
            {chatLoading && messages.length === 0 && (
              <div className="space-y-2.5 animate-pulse pt-1">
                {[1, 5/6, 1, 4/6, 1, 3/4, 1, 2/3].map((w, i) => (
                  <div key={i} className="h-3 bg-amber-100 rounded" style={{ width: `${w * 100}%` }} />
                ))}
              </div>
            )}

            {displayedMessages.map((msg, i) => {
              // Chapter divider
              if (msg.isChapterHeader) {
                return (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-amber-200" />
                    <span className="text-xs text-amber-500 font-medium px-1 shrink-0">
                      {msg.content}
                    </span>
                    <div className="flex-1 h-px bg-amber-200" />
                  </div>
                );
              }

              // User message
              if (msg.role === "user") {
                return (
                  <div key={i} className="flex flex-col items-end gap-1.5">
                    <div className="bg-amber-700 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] text-sm leading-relaxed">
                      {msg.content}
                    </div>
                    {msg.context && (
                      <div className="max-w-[85%] flex items-start gap-1.5 rounded-lg bg-amber-50/80 border border-amber-200 px-2.5 py-1.5">
                        <span className="text-amber-400 text-xs shrink-0 mt-px">📎</span>
                        <p className="text-xs text-amber-500 font-serif italic leading-relaxed line-clamp-3">
                          &ldquo;{msg.context}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>
                );
              }

              // Assistant message
              return (
                <div key={i} className="prose prose-sm prose-headings:font-serif prose-headings:text-ink prose-headings:font-semibold prose-headings:text-sm prose-p:text-ink prose-p:leading-relaxed prose-strong:text-amber-900 prose-em:text-amber-800 prose-li:text-ink prose-li:leading-relaxed max-w-none font-serif text-sm text-ink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              );
            })}

            {/* Typing indicator */}
            {chatLoading && messages.length > 0 && (
              <div className="space-y-2 animate-pulse">
                <div className="h-3 bg-amber-100 rounded w-3/4" />
                <div className="h-3 bg-amber-100 rounded w-full" />
                <div className="h-3 bg-amber-100 rounded w-5/6" />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-amber-200 px-3 pt-2 pb-3 shrink-0">
            {contextText && (
              <div className="flex items-center gap-1.5 mb-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5">
                <span className="text-xs shrink-0">📎</span>
                <span className="text-xs text-amber-800 font-serif flex-1 truncate leading-tight">
                  &ldquo;{contextText.slice(0, 90)}{contextText.length > 90 ? "…" : ""}&rdquo;
                </span>
                <button
                  onClick={() => setContextText("")}
                  className="shrink-0 text-amber-400 hover:text-amber-700 text-base leading-none ml-0.5"
                  title="Remove context"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                className="flex-1 rounded-xl border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none font-serif leading-snug"
                rows={2}
                placeholder="Ask about this chapter…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={sendMessage}
                disabled={chatLoading || !input.trim()}
                className="rounded-xl bg-amber-700 p-2.5 text-white text-base hover:bg-amber-800 disabled:opacity-40 shrink-0"
                title="Send (Enter)"
              >
                ↑
              </button>
            </div>
            <p className="text-xs text-amber-400 mt-1.5">Enter · Shift+Enter for newline</p>
          </div>
        </div>
      )}

      {/* ── SPEAK TAB ────────────────────────────────────────────────── */}
      {tab === "speak" && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs font-serif text-amber-900 line-clamp-3">
            {selectedText
              ? `"${selectedText.slice(0, 200)}${selectedText.length > 200 ? "…" : ""}"`
              : "Select text in the reader first"}
          </div>
          <textarea
            className="rounded border border-amber-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            rows={3}
            placeholder={
              spokenText
                ? `Recorded: "${spokenText.slice(0, 60)}…"`
                : "Type what you said, or use the recorder below…"
            }
            value={manualSpoken}
            onChange={(e) => setManualSpoken(e.target.value)}
          />
          <button
            onClick={runPronunciation}
            disabled={pronLoading || (!spokenText && !manualSpoken) || !selectedText}
            className="rounded-lg bg-amber-700 py-2 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40"
          >
            {pronLoading ? "Checking…" : "Check my reading"}
          </button>
          {pronFeedback && (
            <div className="prose prose-sm max-w-none font-serif text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{pronFeedback}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* ── VIDEO TAB ────────────────────────────────────────────────── */}
      {tab === "video" && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <button
            onClick={runVideos}
            disabled={videoLoading}
            className="rounded-lg bg-amber-700 py-2 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40"
          >
            {videoLoading ? "Searching…" : "Find performances for this chapter"}
          </button>
          {videoQuery && <p className="text-xs text-amber-600">Search: &ldquo;{videoQuery}&rdquo;</p>}
          {videoError && <p className="text-red-500 text-xs">{videoError}</p>}
          {videos.map((v) => (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 rounded-lg border border-amber-200 bg-white p-2 hover:bg-amber-50"
            >
              <img src={v.thumbnail} alt={v.title} className="w-24 h-14 object-cover rounded shrink-0" />
              <div className="flex flex-col justify-center min-w-0">
                <p className="text-xs font-medium text-ink line-clamp-2">{v.title}</p>
                <p className="text-xs text-amber-700 mt-0.5">{v.channel}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
