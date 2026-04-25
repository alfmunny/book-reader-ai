"use client";

/**
 * Per-paragraph text preparation for the reader's left column.
 *
 * Two different line-break semantics in our data:
 *  - HTML-sourced chapters (Faust etc.): `\n` is an intentional verse
 *    break from `<br>`. Must be preserved visually.
 *  - Plain-text-sourced chapters: `\n` is Gutenberg's 72–80 char hard
 *    wrap in the middle of prose. Must be joined back so the line
 *    flows naturally.
 *
 * Classify per paragraph using the same heuristic as SentenceReader:
 * a multi-line paragraph where EVERY line is ≤ 60 chars looks like
 * verse (dramatic metre rarely exceeds 60). Anything longer is prose,
 * and `\n` mid-sentence is joined with a space — except after
 * sentence-ending punctuation where the break was clearly intentional.
 */
function renderSource(text: string): string {
  const lines = text.split("\n");
  if (lines.length >= 2 && lines.every((l) => l.trim().length <= 60)) {
    // Verse: keep the `\n` so pre-wrap renders line breaks.
    return text;
  }
  // Prose: join mid-sentence hard-wraps.
  return text.replace(/(?<![.!?:;"'\u201d])\n(?!\n)/g, " ");
}

interface Props {
  paragraphs: string[];
  translations: string[];
  displayMode: "parallel" | "inline";
  loading: boolean;
}

export default function TranslationView({ paragraphs, translations, displayMode, loading }: Props) {
  if (displayMode === "parallel") {
    return (
      <div className="max-w-7xl mx-auto divide-y divide-amber-100">
        {paragraphs.map((para, i) => (
          <div key={i} className="grid grid-cols-2 gap-6 py-4 first:pt-0 last:pb-0">
            <p className="font-serif text-base text-ink leading-relaxed whitespace-pre-wrap">
              {renderSource(para)}
            </p>
            <div className="border-l border-amber-200 pl-6">
              {translations[i] ? (
                <p className="font-serif text-base text-amber-800 leading-relaxed italic whitespace-pre-wrap">
                  {translations[i]}
                </p>
              ) : loading ? (
                <div role="status" aria-label="Loading translation" className="space-y-2 animate-pulse">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className={`h-3 bg-amber-100 rounded ${j === 2 ? "w-2/3" : "w-full"}`} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // inline mode: original paragraph then translation beneath
  return (
    <div className="prose-reader mx-auto space-y-6">
      {paragraphs.map((para, i) => (
        <div key={i}>
          <p className="font-serif text-base text-ink leading-relaxed whitespace-pre-wrap">
            {renderSource(para)}
          </p>
          {loading && i === 0 && !translations.length && (
            <div role="status" aria-label="Loading translation" className="mt-1 space-y-1 animate-pulse">
              <div className="h-3 bg-amber-100 rounded w-full" />
              <div className="h-3 bg-amber-100 rounded w-5/6" />
            </div>
          )}
          {translations[i] && (
            <p className="mt-1 font-serif text-sm text-amber-700 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
              {translations[i]}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
