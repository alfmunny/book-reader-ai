"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared markdown rendering for AI answers — used by the insight chat and the
// notes page so a saved answer looks the same in both places.
const PROSE_CLASSES = [
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
].join(" ");

export default function InsightMarkdown({
  markdown,
  srPrefix,
  className = "",
}: {
  markdown: string;
  srPrefix?: string;
  className?: string;
}) {
  return (
    <div data-testid="insight-markdown" className={`${PROSE_CLASSES} ${className}`}>
      {srPrefix && <span className="sr-only">{srPrefix}</span>}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}
