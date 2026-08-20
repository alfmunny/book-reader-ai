"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getInsight,
  askQuestion,
  getChatMessages,
  postChatMessage,
} from "@/lib/api";
import { getSettings, saveSettings, ChatProviderSetting } from "@/lib/settings";
import { PaperclipIcon, CloseIcon, RetryIcon, BookmarkIcon, ArrowUpIcon, AlertCircleIcon } from "@/components/Icons";

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
  hasClaudeKey?: boolean;
  hasDeepseekKey?: boolean;
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
  bookLanguage,
  onRemove,
}: {
  text: string;
  bookLanguage?: string;
  onRemove?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ctxId = useId();
  const needsToggle = text.length > CTX_COLLAPSE_AT;
  const shown = !needsToggle || expanded ? text : text.slice(0, CTX_COLLAPSE_AT);
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      <div className="flex items-start gap-1.5">
        <PaperclipIcon className="w-3.5 h-3.5 shrink-0 mt-px text-amber-400" />
        <div className="flex-1 min-w-0">
          <span id={ctxId} lang={bookLanguage ?? undefined} className="italic leading-relaxed">
            &ldquo;{shown}{!expanded && needsToggle ? "…" : ""}&rdquo;
          </span>
          {needsToggle && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-1.5 text-amber-700 hover:text-amber-900 font-medium not-italic min-h-[44px] md:min-h-0 inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
              aria-label="Toggle context"
              aria-expanded={expanded}
              aria-controls={ctxId}
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="shrink-0 text-amber-600 hover:text-amber-700 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            title="Remove context"
            aria-label="Remove context"
          >
            <CloseIcon aria-hidden="true" className="w-3 h-3" />
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
  hasClaudeKey = false,
  hasDeepseekKey = false,
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
  const [chatProvider, setChatProvider] = useState<ChatProviderSetting>(() => getSettings().chatProvider ?? "auto");
  const langRef = useRef(lang);
  langRef.current = lang;
  const providerRef = useRef(chatProvider);
  providerRef.current = chatProvider;

  // Gate the box on the key for the SELECTED provider, not Gemini alone
  // (owner feedback: a Claude-only setup was locked out entirely).
  // "auto" is ready when any provider has a key.
  const providerKeys = { gemini: hasGeminiKey, claude: hasClaudeKey, deepseek: hasDeepseekKey };
  const providerReady = chatProvider === "auto"
    ? hasGeminiKey || hasClaudeKey || hasDeepseekKey
    : providerKeys[chatProvider];
  const providerKeyLabel = chatProvider === "auto"
    ? "an AI provider"
    : { gemini: "a Gemini", claude: "a Claude", deepseek: "a DeepSeek" }[chatProvider];
  const providerReadyRef = useRef(providerReady);
  providerReadyRef.current = providerReady;

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

  // ── 1. Load history when bookId / userId changes ─────────────────────
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

    if (!userId) {
      // Anonymous users: stay with localStorage
      try {
        const raw = localStorage.getItem(HISTORY_KEY("anon", bookId));
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
      return;
    }

    // Authenticated users: fetch from server
    getChatMessages(bookId, 50)
      .then(({ messages: serverMsgs }) => {
        // Server returns newest-first; reverse to chronological order for display
        const uiMessages: Message[] = serverMsgs
          .slice()
          .reverse()
          .map((m) => ({ role: m.role, content: m.content }));

        if (uiMessages.length === 0) {
          // One-time migration: if localStorage has history, push it to the server
          const raw = localStorage.getItem(HISTORY_KEY(String(userId), bookId));
          if (raw) {
            try {
              const stored: Message[] = JSON.parse(raw);
              const toMigrate = stored.filter((m) => !m.isChapterHeader);
              for (const m of toMigrate) {
                postChatMessage(bookId, m.role, m.content).catch(() => {});
              }
              localStorage.removeItem(HISTORY_KEY(String(userId), bookId));
              setMessages(stored);
              setLoadedFrom(Math.max(0, stored.length - INITIAL_DISPLAY));
              stored
                .filter((m) => m.isChapterHeader && m.chapterKey)
                .forEach((m) => visitedKeys.current.add(m.chapterKey!));
              return;
            } catch {
              // migration failed silently; fall through to empty state
            }
          }
          setMessages([]);
          setLoadedFrom(0);
        } else {
          setMessages(uiMessages);
          setLoadedFrom(Math.max(0, uiMessages.length - INITIAL_DISPLAY));
        }
      })
      .catch(() => {
        // Server unreachable — fall back to localStorage
        try {
          const raw = localStorage.getItem(HISTORY_KEY(String(userId), bookId));
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
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, userId]);

  // ── 2. Persist history (anonymous fallback only) ─────────────────────
  useEffect(() => {
    if (!bookId || userId) return; // authenticated users: server handles persistence
    try {
      const toStore = messages.slice(-MAX_STORED);
      if (toStore.length > 0)
        localStorage.setItem(HISTORY_KEY("anon", bookId), JSON.stringify(toStore));
    } catch {}
  }, [messages, bookId, userId]);

  // ── 3. Chapter first-visit header ────────────────────────────────────
  // Marks the chapter boundary in the thread. No AI call — the automatic
  // insight fetch was removed (owner, 2026-08-20): opening the chat must not
  // spend tokens on a request nobody asked for. The suggestion chips below
  // the messages are the explicit way to ask.
  useEffect(() => {
    if (!isVisible) return;
    if (!chapterText || !bookTitle || !bookId) return;
    const key = chapterText.slice(0, 100);
    if (visitedKeys.current.has(key)) return;
    visitedKeys.current.add(key);
    autoScrollRef.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: chapterTitle || "Chapter", isChapterHeader: true, chapterKey: key },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterText, chapterTitle, bookTitle, bookId, author, isVisible]);

  // ── 4. Manual refresh ────────────────────────────────────────────────
  useEffect(() => {
    if (refreshTick === 0 || !chapterText || !bookTitle || !providerReadyRef.current) return;
    let cancelled = false;
    autoScrollRef.current = true;
    setChatLoading(true);
    onAIUsed?.();
    getInsight(chapterText, bookTitle, author, langRef.current, providerRef.current)
      .then((r) => {
        if (cancelled) return;
        setMessages((prev) => [...prev, { role: "assistant", content: r.insight }]);
        if (userId) postChatMessage(bookId, "assistant", r.insight).catch(() => {});
      })
      .catch((e) => { if (!cancelled) setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]); })
      .finally(() => { if (!cancelled) setChatLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // ── 5. Sync selected text ────────────────────────────────────────────
  useEffect(() => {
    if (selectedText) setContextText(selectedText);
  }, [selectedText]);

  // ── 6. Auto-scroll ───────────────────────────────────────────────────
  // Scroll only the messages container — not the page — so opening the
  // Insight panel doesn't jump the reader back to the top.
  useEffect(() => {
    if (autoScrollRef.current && messagesBoxRef.current) {
      messagesBoxRef.current.scrollTop = messagesBoxRef.current.scrollHeight;
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

  // Quick prompts shown above the input — the explicit replacement for the
  // removed auto-insight: nothing is sent until the reader taps one.
  const SUGGESTIONS = [
    "Summarize this chapter",
    "Give me one fascinating insight",
    "Explain the historical context",
    "Who are the characters so far?",
  ];

  // ── Send message ──────────────────────────────────────────────────────
  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || chatLoading) return;
    const attachedContext = contextText || undefined;
    setInput("");
    setContextText("");
    autoScrollRef.current = true;
    setMessages((prev) => [...prev, { role: "user", content: text, context: attachedContext }]);
    // Persist user message to server (fire-and-forget; UI already updated optimistically)
    if (userId) postChatMessage(bookId, "user", text).catch(() => {});
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
      const r = await askQuestion(text, passage, bookTitle, author, langRef.current, providerRef.current);
      setMessages((prev) => [...prev, { role: "assistant", content: r.answer }]);
      if (userId) postChatMessage(bookId, "assistant", r.answer).catch(() => {});
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
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
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-stone-100 shrink-0 bg-stone-50">
        <select
          aria-label="Insight language"
          className="flex-1 text-xs rounded border border-stone-200 px-2 py-1 text-stone-700 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          value={lang}
          onChange={(e) => { setLang(e.target.value); saveSettings({ insightLang: e.target.value }); }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <select
          aria-label="Chat AI provider"
          className="flex-1 text-xs rounded border border-stone-200 px-2 py-1 text-stone-700 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
          value={chatProvider}
          onChange={(e) => {
            const next = e.target.value as ChatProviderSetting;
            setChatProvider(next);
            saveSettings({ chatProvider: next });
          }}
        >
          <option value="auto">Auto</option>
          <option value="gemini">Gemini</option>
          <option value="claude">Claude</option>
          <option value="deepseek">DeepSeek</option>
        </select>
        <button
          onClick={() => {
            const next = chatFontSize === "xs" ? "sm" : "xs";
            setChatFontSize(next);
            saveSettings({ chatFontSize: next });
          }}
          title={`Toggle font size (${chatFontSize === "xs" ? "small" : "medium"})`}
          aria-label={chatFontSize === "xs" ? "Increase chat font size" : "Decrease chat font size"}
          className={`shrink-0 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center rounded text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 ${
            chatFontSize === "sm"
              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
              : "text-stone-600 hover:bg-stone-200 hover:text-stone-700"
          }`}
        >
          {chatFontSize === "xs" ? "A" : "a"}
        </button>
        <button
          onClick={() => setRefreshTick((n) => n + 1)}
          title={providerReady ? "Append a fresh insight" : `${providerKeyLabel[0].toUpperCase()}${providerKeyLabel.slice(1)} API key required`}
          aria-label="Append a fresh insight"
          disabled={!providerReady}
          className="shrink-0 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center rounded hover:bg-stone-200 text-stone-600 hover:text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <RetryIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Provider key notice ───────────────────────────────────────── */}
      {!providerReady && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800">
          Insights require {providerKeyLabel}{" "}
          <a href="/profile" target="_blank" rel="noopener noreferrer" className="underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded">API key<span className="sr-only"> (opens in new tab)</span></a>
          {chatProvider === "auto" || chatProvider === "gemini" ? " — Gemini is free from Google AI Studio." : "."}
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────── */}
      <div
        ref={messagesBoxRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        tabIndex={0}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
        style={{ fontSize }}
      >
        {hasEarlier && (
          <button
            onClick={loadEarlier}
            className="w-full text-xs text-stone-600 hover:text-stone-800 py-1.5 min-h-[44px] md:min-h-0 rounded-lg border border-stone-200 hover:bg-stone-50 transition-colors inline-flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <ArrowUpIcon className="w-3 h-3" />
            <span>Load earlier ({loadedFrom} more)</span>
          </button>
        )}

        {/* Initial loading skeleton */}
        {chatLoading && messages.length === 0 && (
          <div role="status" aria-label="Loading messages">
            <span className="sr-only">Loading messages...</span>
            <div className="space-y-2 animate-pulse pt-1 px-1">
              {[1, 0.85, 1, 0.7, 1, 0.8].map((w, i) => (
                <div key={i} className="h-3 bg-stone-100 rounded" style={{ width: `${w * 100}%` }} />
              ))}
            </div>
          </div>
        )}

        {displayedMessages.map((msg, i) => {
          const absIdx = loadedFrom + i;

          // ── Chapter divider ────────────────────────────────────────
          if (msg.isChapterHeader) {
            return (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px bg-stone-100" />
                <span className="text-[11px] text-stone-600 font-medium px-1 shrink-0">
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-stone-100" />
              </div>
            );
          }

          // ── User message ───────────────────────────────────────────
          if (msg.role === "user") {
            return (
              <div key={i} className="flex flex-col items-end gap-1.5">
                <div className="bg-amber-700 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[88%] leading-relaxed shadow-sm break-words">
                  <span className="sr-only">You: </span>{msg.content}
                </div>
                {msg.context && (
                  <div className="max-w-[88%] w-full">
                    <MsgContextBlock
                      text={msg.context}
                      bookLanguage={bookLanguage}
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
          const isError = msg.content.startsWith("Error:");
          if (isError) {
            return (
              <div key={i} role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <AlertCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
                <span>{msg.content.replace(/^Error:\s*/, "")}</span>
              </div>
            );
          }
          return (
            <div key={i} className="flex gap-2 max-w-full">
              {/* AI icon */}
              <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-amber-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 14.5a6.5 6.5 0 110-13 6.5 6.5 0 010 13zm-.75-8.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.875.875 0 110-1.75.875.875 0 010 1.75z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={[
                    "prose max-w-none break-words",
                    "prose-p:my-1.5 prose-p:leading-[1.8] prose-p:text-stone-700",
                    "prose-headings:text-stone-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1",
                    "prose-strong:text-stone-800 prose-em:text-stone-600",
                    "prose-li:text-stone-700 prose-li:leading-[1.8] prose-li:my-0",
                    "prose-ul:my-1.5 prose-ol:my-1.5",
                    "prose-blockquote:border-l-2 prose-blockquote:border-amber-300 prose-blockquote:text-stone-600 prose-blockquote:not-italic prose-blockquote:pl-3 prose-blockquote:my-2",
                    "prose-code:text-amber-700 prose-code:bg-amber-50 prose-code:px-1 prose-code:rounded prose-code:font-mono prose-code:text-[0.85em]",
                    "prose-pre:bg-stone-900 prose-pre:text-stone-100 prose-pre:text-[0.8em] prose-pre:rounded-lg prose-pre:overflow-x-auto",
                    "text-stone-700",
                  ].join(" ")}
                >
                  <span className="sr-only">Assistant: </span>
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
                      className={`mt-1.5 flex items-center gap-1 min-h-[44px] md:min-h-0 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded ${
                        isSaved
                          ? "text-stone-600 cursor-default"
                          : "text-stone-600 hover:text-amber-700"
                      }`}
                    >
                      <BookmarkIcon className="w-3 h-3" fill={isSaved ? "currentColor" : "none"} />
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
          <div className="flex gap-2" role="status" aria-label="AI is typing" aria-live="polite">
            <span className="sr-only">AI is typing...</span>
            <div className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce" aria-hidden="true" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce" aria-hidden="true" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce" aria-hidden="true" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────────────── */}
      <div className="border-t border-stone-100 px-3 pt-2 pb-3 shrink-0 bg-white">
        {/* Context chip */}
        {contextText && (
          <div className="mb-2">
            <ContextChip text={contextText} bookLanguage={bookLanguage} onRemove={() => setContextText("")} />
          </div>
        )}

        {!providerReady && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2 text-xs text-amber-800">
            Chat requires {providerKeyLabel}{" "}
            <a href="/profile" target="_blank" rel="noopener noreferrer" className="underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded">API key<span className="sr-only"> (opens in new tab)</span></a>.
          </div>
        )}

        {/* Suggestion chips — tap to send that request about the chapter */}
        {providerReady && !chatLoading && !input.trim() && (
          <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendMessage(s)}
                className="text-xs rounded-full border border-amber-200 bg-amber-50 text-amber-800 px-2.5 py-1 min-h-[44px] md:min-h-0 hover:bg-amber-100 hover:border-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            aria-label="Ask about this chapter"
            className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white focus:border-transparent resize-none leading-relaxed transition-colors placeholder:text-stone-600"
            rows={2}
            placeholder={providerReady ? "Ask about this chapter…" : "API key required"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!providerReady}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={chatLoading || !input.trim() || !providerReady}
            className="rounded-xl bg-amber-600 p-2 min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-white hover:bg-amber-700 disabled:opacity-40 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-600"
            aria-label="Send message"
            title="Send (Enter)"
          >
            <ArrowUpIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-stone-600 mt-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Message-level context block ───────────────────────────────────────────────
function MsgContextBlock({
  text,
  bookLanguage,
  expanded,
  onToggle,
}: {
  text: string;
  bookLanguage?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const msgCtxId = useId();
  const needsToggle = text.length > CTX_COLLAPSE_AT;
  const shown = !needsToggle || expanded ? text : text.slice(0, CTX_COLLAPSE_AT);
  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-amber-50/80 border border-amber-100 px-2.5 py-1.5">
      <PaperclipIcon aria-hidden="true" className="w-3 h-3 text-amber-400 shrink-0 mt-px" />
      <p id={msgCtxId} lang={bookLanguage ?? undefined} className="text-xs text-amber-700 italic leading-relaxed flex-1">
        &ldquo;{shown}{!expanded && needsToggle ? "…" : ""}&rdquo;
        {needsToggle && (
          <button
            onClick={onToggle}
            className="ml-1.5 text-amber-700 hover:text-amber-900 font-medium not-italic min-h-[44px] md:min-h-0 inline-flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
            aria-label="Toggle context"
            aria-expanded={expanded}
            aria-controls={msgCtxId}
          >
            {expanded ? "less" : "more"}
          </button>
        )}
      </p>
    </div>
  );
}
