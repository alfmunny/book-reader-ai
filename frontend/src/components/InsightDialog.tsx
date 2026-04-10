"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { askQuestion } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  insight: string;
  chapterText: string;
  selectedText: string;
  bookTitle: string;
  author: string;
  onClose: () => void;
}

export default function InsightDialog({
  insight,
  chapterText,
  selectedText,
  bookTitle,
  author,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: insight },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    // Build a rich passage context: selected text + insight + chapter excerpt
    const parts: string[] = [];
    if (selectedText) parts.push(`Selected passage:\n"${selectedText}"`);
    parts.push(`Chapter insight:\n${insight}`);
    parts.push(`Chapter excerpt:\n${chapterText.slice(0, 1000)}`);
    const passage = parts.join("\n\n---\n\n");

    try {
      const r = await askQuestion(text, passage, bookTitle, author, "en");
      setMessages((prev) => [...prev, { role: "assistant", content: r.answer }]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Something went wrong: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl mx-0 sm:mx-4 flex flex-col h-[90vh] sm:max-h-[85vh]">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-amber-200 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-bold text-ink text-base">Continue Exploring</h2>
            <p className="text-xs text-amber-600 mt-0.5 truncate">{bookTitle}</p>
          </div>

          {selectedText && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 max-w-[220px] shrink-0">
              <p className="text-xs text-amber-500 font-medium mb-0.5">Selected</p>
              <p className="text-xs text-amber-800 font-serif line-clamp-2">
                "{selectedText.slice(0, 100)}{selectedText.length > 100 ? "…" : ""}"
              </p>
            </div>
          )}

          <button
            onClick={onClose}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-amber-100 text-amber-600 hover:text-ink text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "flex justify-end" : ""}>
              {msg.role === "user" ? (
                <div className="bg-amber-700 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed">
                  {msg.content}
                </div>
              ) : (
                <div className="prose prose-sm prose-headings:font-serif prose-headings:text-ink prose-p:text-ink prose-strong:text-ink max-w-none font-serif text-sm text-ink leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-amber-100 rounded w-3/4" />
              <div className="h-3 bg-amber-100 rounded w-full" />
              <div className="h-3 bg-amber-100 rounded w-5/6" />
              <div className="h-3 bg-amber-100 rounded w-2/3" />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-amber-200 shrink-0 flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 rounded-xl border border-amber-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-serif"
            placeholder="Ask a follow-up question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="rounded-xl bg-amber-700 px-5 py-2.5 text-white text-sm font-medium hover:bg-amber-800 disabled:opacity-40 shrink-0"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
