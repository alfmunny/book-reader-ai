"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import InsightMarkdown from "@/components/InsightMarkdown";
import {
  getInsight,
  askQuestion,
  getChatMessages,
  postChatMessage,
  getInsights,
} from "@/lib/api";
import { getSettings, saveSettings, ChatProviderSetting } from "@/lib/settings";
import { PaperclipIcon, CloseIcon, RetryIcon, BookmarkIcon, ArrowUpIcon, ArrowUpRightIcon, AlertCircleIcon, CopyIcon, CheckCircleIcon } from "@/components/Icons";

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
const insightKey = (question: string, answer: string) =>
  `${question.slice(0, 60)}|${answer.slice(0, 60)}`;
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
  /** On an error bubble: the question that failed, so Retry can re-send it. */
  failedQuestion?: string;
  failedContext?: string;
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
  onSaveInsight?: (question: string, answer: string, context?: string) => void | Promise<unknown>;
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
  const [suggestionsHidden, setSuggestionsHidden] = useState<boolean>(() => getSettings().chatSuggestionsHidden ?? false);
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // Insight id per saved key — powers the "View note" jump link to the
  // anchored insight on /notes/[bookId].
  const [savedIds, setSavedIds] = useState<Map<string, number>>(new Map());
  const [savedIdsByAnswer, setSavedIdsByAnswer] = useState<Map<string, number>>(new Map());
  // Message index whose Copy button shows the transient "Copied" state.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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

  // ── 1b. Saved-state truth: the server's insights, not localStorage ───
  // Regression (owner report, 2026-08-24): a save that failed after the
  // optimistic localStorage write left a permanent phantom "Saved" label.
  // For authenticated users the saved set is rebuilt from what actually
  // persisted; localStorage is only a seed / anonymous fallback.
  useEffect(() => {
    if (!userId || !bookId) return;
    getInsights(Number(bookId))
      .then((list) => {
        const keys = new Set(list.map((i) => insightKey(i.question, i.answer)));
        setSavedInsights(keys);
        setSavedIds(new Map(list.map((i) => [insightKey(i.question, i.answer), i.id])));
        // Questions are editable on the notes page (typo fixes) — after an
        // edit the full question|answer key no longer matches the chat pair,
        // so keep an answer-only index too (the answer is immutable).
        setSavedIdsByAnswer(new Map(list.map((i) => [i.answer.slice(0, 60), i.id])));
        try {
          localStorage.setItem(SAVED_KEY(userId, bookId), JSON.stringify([...keys]));
        } catch {}
      })
      .catch(() => {}); // server unreachable — keep the localStorage seed
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
    await runAsk(text, attachedContext);
  }

  /** Fire the AI request for an already-appended user message. Failures become
   *  an error bubble carrying the question so Retry can re-send it without
   *  duplicating the user's message (owner report, 2026-08-25). */
  async function runAsk(text: string, attachedContext?: string) {
    setChatLoading(true);

    const parts: string[] = [];
    if (attachedContext) parts.push(`Selected passage:\n"${attachedContext}"`);
    const history = messagesRef.current
      .filter((m) => !m.isChapterHeader && !m.content.startsWith("Error:"))
      .slice(-6)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 400)}`)
      .join("\n\n");
    if (history) parts.push(`Conversation:\n${history}`);
    parts.push(`Chapter excerpt:\n${chapterText.slice(0, 800)}`);
    const passage = parts.join("\n\n---\n\n");

    try {
      onAIUsed?.();
      const r = await askQuestion(text, passage, bookTitle, author, langRef.current, providerRef.current);
      const answer = (r.answer ?? "").trim();
      // A blank answer rendered as an empty bubble is the silent failure the
      // owner reported — surface it as a retryable error instead.
      if (!answer) throw new Error("The AI returned an empty answer — retry, or switch provider.");
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
      if (userId) postChatMessage(bookId, "assistant", answer).catch(() => {});
    } catch (e: unknown) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Error: ${e instanceof Error ? e.message : String(e)}`,
        failedQuestion: text,
        failedContext: attachedContext,
      }]);
    } finally {
      setChatLoading(false);
    }
  }

  function retryFailed(absIdx: number) {
    const failed = messagesRef.current[absIdx];
    if (!failed?.failedQuestion || chatLoading) return;
    autoScrollRef.current = true;
    setMessages((prev) => prev.filter((_, i) => i !== absIdx));
    runAsk(failed.failedQuestion, failed.failedContext);
  }

  function copyMessage(absIdx: number, text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopiedIdx(absIdx);
        setTimeout(() => setCopiedIdx((cur) => (cur === absIdx ? null : cur)), 1500);
      })
      .catch(() => {});
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
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset"
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
              <div key={i} className="flex flex-col items-end gap-1">
                <div className="bg-amber-700 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[88%] leading-relaxed shadow-sm break-words">
                  <span className="sr-only">You: </span>{msg.content}
                </div>
                <button
                  onClick={() => copyMessage(absIdx, msg.content)}
                  aria-label={copiedIdx === absIdx ? "Copied" : "Copy your message"}
                  title="Copy"
                  className="flex items-center min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 justify-center text-stone-400 hover:text-stone-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                >
                  {copiedIdx === absIdx
                    ? <CheckCircleIcon className="w-3 h-3 text-green-600" aria-hidden="true" />
                    : <CopyIcon className="w-3 h-3" aria-hidden="true" />}
                </button>
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
              <div key={i} role="alert" className="px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                <div className="flex items-start gap-2">
                  <AlertCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
                  <span>{msg.content.replace(/^Error:\s*/, "")}</span>
                </div>
                <div className="mt-1.5 ml-5 flex items-center gap-3">
                  {msg.failedQuestion && (
                    <button
                      onClick={() => retryFailed(absIdx)}
                      disabled={chatLoading}
                      className="flex items-center gap-1 min-h-[44px] md:min-h-0 text-[11px] font-medium text-red-700 hover:text-red-800 hover:underline disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 rounded"
                    >
                      <RetryIcon className="w-3 h-3" aria-hidden="true" /> Retry
                    </button>
                  )}
                  <button
                    onClick={() => copyMessage(absIdx, msg.content.replace(/^Error:\s*/, ""))}
                    aria-label={copiedIdx === absIdx ? "Copied" : "Copy error"}
                    className="flex items-center gap-1 min-h-[44px] md:min-h-0 text-[11px] text-red-700 hover:text-red-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 rounded"
                  >
                    {copiedIdx === absIdx
                      ? <><CheckCircleIcon className="w-3 h-3" aria-hidden="true" /> Copied</>
                      : <><CopyIcon className="w-3 h-3" aria-hidden="true" /> Copy</>}
                  </button>
                </div>
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
                <InsightMarkdown markdown={msg.content} srPrefix="Assistant: " />
                <div className="mt-1.5 flex items-center gap-3">
                <button
                  onClick={() => copyMessage(absIdx, msg.content)}
                  aria-label={copiedIdx === absIdx ? "Copied" : "Copy answer"}
                  className="flex items-center gap-1 min-h-[44px] md:min-h-0 text-[11px] text-stone-600 hover:text-amber-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                >
                  {copiedIdx === absIdx
                    ? <><CheckCircleIcon className="w-3 h-3 text-green-600" aria-hidden="true" /> Copied</>
                    : <><CopyIcon className="w-3 h-3" aria-hidden="true" /> Copy</>}
                </button>
                {onSaveInsight && prevUserMsg && (() => {
                  const saveKey = insightKey(prevUserMsg.content, msg.content);
                  const answerOnlyKey = msg.content.slice(0, 60);
                  const isSaved = savedInsights.has(saveKey) || savedIdsByAnswer.has(answerOnlyKey);
                  const isSaving = savingKey === saveKey;
                  const noteId = savedIds.get(saveKey) ?? savedIdsByAnswer.get(answerOnlyKey);
                  return (
                    <>
                    <button
                      onClick={() => {
                        // Only mark saved once the API confirms — an optimistic
                        // write here left phantom "Saved" labels on failed saves.
                        if (isSaved || isSaving) return;
                        setSavingKey(saveKey);
                        Promise.resolve(onSaveInsight(prevUserMsg.content, msg.content, prevUserMsg.context))
                          .then((created) => {
                            setSavedInsights((prev) => {
                              const next = new Set(prev).add(saveKey);
                              try {
                                localStorage.setItem(SAVED_KEY(userId ?? "anon", bookId), JSON.stringify([...next]));
                              } catch {}
                              return next;
                            });
                            const id = (created as { id?: number } | null | undefined)?.id;
                            if (typeof id === "number") {
                              setSavedIds((prev) => new Map(prev).set(saveKey, id));
                            }
                          })
                          .catch(() => {}) // parent surfaces the failure toast
                          .finally(() => setSavingKey((k) => (k === saveKey ? null : k)));
                      }}
                      disabled={isSaving}
                      title={isSaved ? "Already saved" : "Save to notes"}
                      className={`flex items-center gap-1 min-h-[44px] md:min-h-0 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded ${
                        isSaved
                          ? "text-stone-600 cursor-default"
                          : "text-stone-600 hover:text-amber-700"
                      }`}
                    >
                      <BookmarkIcon className="w-3 h-3" fill={isSaved ? "currentColor" : "none"} />
                      {isSaved ? "Saved" : isSaving ? "Saving…" : "Save to notes"}
                    </button>
                    {isSaved && (
                      <a
                        href={noteId != null ? `/notes/${bookId}#insight-${noteId}` : `/notes/${bookId}`}
                        className="flex items-center gap-0.5 min-h-[44px] md:min-h-0 text-[11px] text-amber-700 hover:text-amber-800 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                      >
                        View note <ArrowUpRightIcon className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                    </>
                  );
                })()}
                </div>
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
        {providerReady && !chatLoading && !input.trim() && !suggestionsHidden && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2" role="group" aria-label="Suggested questions">
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
            <button
              type="button"
              onClick={() => { setSuggestionsHidden(true); saveSettings({ chatSuggestionsHidden: true }); }}
              aria-label="Hide suggestions"
              title="Hide suggestions"
              className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center rounded text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <CloseIcon aria-hidden="true" className="w-3 h-3" />
            </button>
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
        <p className="text-[11px] text-stone-600 mt-1 flex items-center justify-between gap-2">
          <span>Enter to send · Shift+Enter for newline</span>
          {suggestionsHidden && (
            <button
              type="button"
              onClick={() => { setSuggestionsHidden(false); saveSettings({ chatSuggestionsHidden: false }); }}
              className="text-amber-700 hover:text-amber-900 underline shrink-0 min-h-[44px] md:min-h-0 inline-flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Show suggestions
            </button>
          )}
        </p>
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
