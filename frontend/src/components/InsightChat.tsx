"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getInsight,
  askQuestion,
} from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/settings";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
];

const HISTORY_KEY = (userId: number | string, bookId: string) => `chat-history:${userId}:${bookId}`;
const SAVED_KEY = (userId: number | string, bookId: string) => `saved-insights:${userId}:${bookId}`;
const INITIAL_DISPLAY = 30;
const LOAD_BATCH = 20;
const MAX_STORED = 200;

// Context is collapsed when text exceeds this length
const CTX_COLLAPSE_AT = 160;

interface Message {
  role: "user" | "assistant";
  content: string;
  context?: string;
  isChapterHeader?: true;
  chapterKey?: string;
}

interface Props {
  bookId: string;
  userId: number | null;
  hasGeminiKey: boolean;
  isVisible: boolean;
  chapterText: string;
  chapterTitle: string;
  selectedText: string;
  bookTitle: string;
  author: string;
  bookLanguage: string;
  onAIUsed?: () => void;
  onSaveInsight?: (question: string, answer: string, context?: string) => void;
  chapterIndex?: number;
}

// ── Context chip (expandable quote) ─────────────────────────────────────────
function ContextChip({
  text,
  onRemove,
}: {
  text: string;
  onRemove?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = text.length > CTX_COLLAPSE_AT;
  const shown = !needsToggle || expanded ? text : text.slice(0, CTX_COLLAPSE_AT);
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 mt-px text-amber-400">📎</span>
        <div className="flex-1 min-w-0">
          <span className="italic leading-relaxed">
            &ldquo;{shown}{!expanded && needsToggle ? "…" : ""}&rdquo;
          </span>
          {needsToggle && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-1.5 text-amber-500 hover:text-amber-700 font-medium not-italic"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="shrink-0 text-amber-400 hover:text-amber-700 text-base leading-none"
            title="Remove context"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export default function InsightChat({
  bookId,
  userId,
  hasGeminiKey,
  isVisible,
  chapterText,
  chapterTitle,
  selectedText,
  bookTitle,
  author,
  bookLanguage,
  onAIUsed,
  onSaveInsight,
  chapterIndex,
}: Props) {
  const [savedInsights, setSavedInsights] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY(userId ?? "anon", bookId));
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [lang, setLang] = useState(() => getSettings().insightLang);
  const [chatFontSize, setChatFontSize] = useState<"xs" | "sm">(() => getSettings().chatFontSize);
  const langRef = useRef(lang);
  langRef.current = lang;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedFrom, setLoadedFrom] = useState(0);
  const [chatLoading, setChatLoading] = useState(false);
  const [input, setInput] = useState("");
  const [contextText, setContextText] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  // tracks which message-level contexts are expanded (by absolute index)
  const [expandedMsgCtx, setExpandedMsgCtx] = useState<Set<number>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesBoxRef = useRef<HTMLDivElement>(null);
  const scrollHeightBeforeLoad = useRef(0);
  const visitedKeys = useRef(new Set<string>());
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const autoScrollRef = useRef(true);

  // ── 1. Load history when bookId changes ──────────────────────────────
  useEffect(() => {
    visitedKeys.current.clear();
    setInput("");
    setContextText("");
    setChatLoading(false);
    try {
      const raw = localStorage.getItem(SAVED_KEY(userId ?? "anon", bookId));
      setSavedInsights(raw ? new Set<string>(JSON.parse(raw)) : new Set<string>());
    } catch {
      setSavedInsights(new Set<string>());
    }
    setExpandedMsgCtx(new Set());

    try {
      const raw = localStorage.getItem(HISTORY_KEY(userId ?? "anon", bookId));
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

  // ── 2. Persist history ───────────────────────────────────────────────
  useEffect(() => {
    if (!bookId) return;
    try {
      const toStore = messages.slice(-MAX_STORED);
      if (toStore.length > 0)
        localStorage.setItem(HISTORY_KEY(userId ?? "anon", bookId), JSON.stringify(toStore));
    } catch {}
  }, [messages, bookId]);

  // ── 3. Chapter first-visit insight ───────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    if (!hasGeminiKey) return;
    if (!chapterText || !bookTitle || !bookId) return;
    const key = chapterText.slice(0, 100);
    if (visitedKeys.current.has(key)) return;
    visitedKeys.current.add(key);

    let cancelled = false;
    autoScrollRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: chapterTitle || "Chapter", isChapterHeader: true, chapterKey: key },
    ]);
    setChatLoading(true);

    onAIUsed?.();
    getInsight(chapterText, bookTitle, author, langRef.current)
      .then((r) => { if (!cancelled) setMessages((prev) => [...prev, { role: "assistant", content: r.insight }]); })
      .catch((e) => { if (!cancelled) setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]); })
      .finally(() => { if (!cancelled) setChatLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterText, chapterTitle, bookTitle, bookId, author, isVisible]);

  // ── 4. Manual refresh ────────────────────────────────────────────────
  useEffect(() => {
    if (refreshTick === 0 || !chapterText || !bookTitle || !hasGeminiKey) return;
    let cancelled = false;
    autoScrollRef.current = true;
    setChatLoading(true);
    onAIUsed?.();
    getInsight(chapterText, bookTitle, author, langRef.current)
      .then((r) => { if (!cancelled) setMessages((prev) => [...prev, { role: "assistant", content: r.insight }]); })
      .catch((e) => { if (!cancelled) setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]); })
      .finally(() => { if (!cancelled) setChatLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // ── 5. Sync selected text ────────────────────────────────────────────
  useEffect(() => {
    if (selectedText) setContextText(selectedText);
  }, [selectedText]);

  // ── 6. Auto-scroll ───────────────────────────────────────────────────
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatLoading]);

  // ── 7. Scroll anchor when loading earlier ────────────────────────────
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
    setContextText("");
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

  // ── Render ────────────────────────────────────────────────────────────
  const displayedMessages = messages.slice(loadedFrom);
  const hasEarlier = loadedFrom > 0;
  const fontSize = chatFontSize === "xs" ? "0.75rem" : "0.8125rem";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 shrink-0 bg-gray-50">
        <select
          className="flex-1 text-xs rounded border border-gray-200 px-2 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          value={lang}
          onChange={(e) => { setLang(e.target.value); saveSettings({ insightLang: e.target.value }); }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <button
          onClick={() => {
            const next = chatFontSize === "xs" ? "sm" : "xs";
            setChatFontSize(next);
            saveSettings({ chatFontSize: next });
          }}
          title="Toggle font size"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 text-xs font-bold"
        >
          {chatFontSize === "xs" ? "A" : "a"}
        </button>
        <button
          onClick={() => setRefreshTick((n) => n + 1)}
          title={hasGeminiKey ? "Append a fresh insight" : "Gemini API key required"}
          disabled={!hasGeminiKey}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* ── Gemini key notice ─────────────────────────────────────────── */}
      {!hasGeminiKey && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
          Insights require a{" "}
          <a href="/profile" target="_blank" className="underline font-medium">Gemini API key</a>{" "}
          — free from Google AI Studio.
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div
        ref={messagesBoxRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        style={{ fontSize }}
      >
        {hasEarlier && (
          <button
            onClick={loadEarlier}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
          >
            ↑ Load earlier ({loadedFrom} more)
          </button>
        )}

        {/* Initial loading skeleton */}
        {chatLoading && messages.length === 0 && (
          <div className="space-y-2 animate-pulse pt-1 px-1">
            {[1, 0.85, 1, 0.7, 1, 0.8].map((w, i) => (
              <div key={i} className="h-3 bg-gray-100 rounded" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        )}

        {displayedMessages.map((msg, i) => {
          const absIdx = loadedFrom + i;

          // ── Chapter divider ────────────────────────────────────────
          if (msg.isChapterHeader) {
            return (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] text-gray-400 font-medium px-1 shrink-0">
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            );
          }

          // ── User message ───────────────────────────────────────────
          if (msg.role === "user") {
            return (
              <div key={i} className="flex flex-col items-end gap-1.5">
                <div className="bg-amber-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[88%] leading-relaxed shadow-sm break-words">
                  {msg.content}
                </div>
                {msg.context && (
                  <div className="max-w-[88%] w-full">
                    <MsgContextBlock
                      text={msg.context}
                      expanded={expandedMsgCtx.has(absIdx)}
                      onToggle={() =>
                        setExpandedMsgCtx((prev) => {
                          const next = new Set(prev);
                          next.has(absIdx) ? next.delete(absIdx) : next.add(absIdx);
                          return next;
                        })
                      }
                    />
                  </div>
                )}
              </div>
            );
          }

          // ── Assistant message ──────────────────────────────────────
          const prevUserMsg = displayedMessages.slice(0, i).reverse().find((m) => m.role === "user");
          return (
            <div key={i} className="flex gap-2 max-w-full">
              {/* AI icon */}
              <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13zm-.75-8.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={[
                    "prose max-w-none break-words",
                    "prose-p:my-1.5 prose-p:leading-[1.8] prose-p:text-gray-700",
                    "prose-headings:text-gray-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1",
                    "prose-strong:text-gray-800 prose-em:text-gray-600",
                    "prose-li:text-gray-700 prose-li:leading-[1.8] prose-li:my-0",
                    "prose-ul:my-1.5 prose-ol:my-1.5",
                    "prose-blockquote:border-l-2 prose-blockquote:border-amber-300 prose-blockquote:text-gray-600 prose-blockquote:not-italic prose-blockquote:pl-3 prose-blockquote:my-2",
                    "prose-code:text-amber-700 prose-code:bg-amber-50 prose-code:px-1 prose-code:rounded prose-code:font-mono prose-code:text-[0.85em]",
                    "prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:text-[0.8em] prose-pre:rounded-lg prose-pre:overflow-x-auto",
                    "text-gray-700",
                  ].join(" ")}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
                {onSaveInsight && prevUserMsg && (() => {
                  const saveKey = `${prevUserMsg.content.slice(0, 60)}|${msg.content.slice(0, 60)}`;
                  const isSaved = savedInsights.has(saveKey);
                  return (
                    <button
                      onClick={() => {
                        if (isSaved) return;
                        const next = new Set(savedInsights).add(saveKey);
                        setSavedInsights(next);
                        try {
                          localStorage.setItem(SAVED_KEY(userId ?? "anon", bookId), JSON.stringify([...next]));
                        } catch {}
                        onSaveInsight(prevUserMsg.content, msg.content, prevUserMsg.context);
                      }}
                      title={isSaved ? "Already saved" : "Save to notes"}
                      className={`mt-1.5 flex items-center gap-1 text-[11px] transition-colors ${
                        isSaved
                          ? "text-gray-300 cursor-default"
                          : "text-gray-400 hover:text-amber-700"
                      }`}
                    >
                      <svg className="w-3 h-3" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                      {isSaved ? "Saved" : "Save to notes"}
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {chatLoading && messages.length > 0 && (
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 px-3 pt-2 pb-3 shrink-0 bg-white">
        {/* Context chip */}
        {contextText && (
          <div className="mb-2">
            <ContextChip text={contextText} onRemove={() => setContextText("")} />
          </div>
        )}

        {!hasGeminiKey && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2 text-xs text-amber-800">
            Chat requires a{" "}
            <a href="/profile" target="_blank" className="underline font-medium">Gemini API key</a>.
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white focus:border-transparent resize-none leading-relaxed transition-colors placeholder:text-gray-400"
            rows={2}
            placeholder={hasGeminiKey ? "Ask about this chapter…" : "Gemini API key required"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!hasGeminiKey}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={sendMessage}
            disabled={chatLoading || !input.trim() || !hasGeminiKey}
            className="rounded-xl bg-amber-600 p-2 text-white hover:bg-amber-700 disabled:opacity-40 shrink-0 transition-colors"
            title="Send (Enter)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Message-level context block ───────────────────────────────────────────────
function MsgContextBlock({
  text,
  expanded,
  onToggle,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const needsToggle = text.length > CTX_COLLAPSE_AT;
  const shown = !needsToggle || expanded ? text : text.slice(0, CTX_COLLAPSE_AT);
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-amber-50/80 border border-amber-100 px-2.5 py-1.5">
      <span className="text-amber-400 text-xs shrink-0 mt-px">📎</span>
      <p className="text-xs text-amber-700 italic leading-relaxed flex-1">
        &ldquo;{shown}{!expanded && needsToggle ? "…" : ""}&rdquo;
        {needsToggle && (
          <button
            onClick={onToggle}
            className="ml-1.5 text-amber-500 hover:text-amber-700 font-medium not-italic"
          >
            {expanded ? "less" : "more"}
          </button>
        )}
      </p>
    </div>
  );
}
