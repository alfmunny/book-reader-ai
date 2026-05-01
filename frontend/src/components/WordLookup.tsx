"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, ArrowUpRightIcon } from "@/components/Icons";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Definition {
  partOfSpeech: string;
  definitions: { definition: string }[];
}

interface LookupResult {
  word: string;
  phonetic?: string;
  meanings: Definition[];
}

interface Props {
  word: string;
  position: { x: number; y: number };
  language?: string;
  onClose: () => void;
}

export default function WordLookup({ word, position, language, onClose }: Props) {
  const descId = useId();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const lang = language?.split(/[-_]/)[0] ?? "en";
  useFocusTrap(ref);

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);

    fetch(`https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word.toLowerCase())}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        const entry = data[0];
        setResult({
          word: entry.word,
          phonetic: entry.phonetic || entry.phonetics?.[0]?.text,
          meanings: entry.meanings?.slice(0, 3).map((m: any) => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions?.slice(0, 2),
          })) ?? [],
        });
      })
      .catch(() => setError("No definition found"))
      .finally(() => setLoading(false));
  }, [word]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Move focus into dialog on open; restore to trigger on close
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Position the popup near the word, but keep it within viewport
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const style: React.CSSProperties = isMobile
    ? { position: "fixed", left: 8, right: 8, bottom: 8, zIndex: 50 }
    : {
        position: "fixed",
        left: Math.min(position.x, window.innerWidth - 320),
        top: Math.min(position.y + 20, window.innerHeight - 300),
        zIndex: 50,
      };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Word definition: ${word}`}
      aria-describedby={descId}
      style={style}
      className="relative sm:w-72 max-h-64 overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-lg p-3 text-sm focus:outline-none"
    >
      <span id={descId} className="sr-only">Word definition lookup</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close definition"
        className="absolute top-1.5 right-1.5 rounded-full p-0.5 hover:bg-amber-100 transition-colors min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        <CloseIcon className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
      {loading && (
        <div className="flex items-center gap-2 text-amber-700 pr-6" role="status">
          <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
          Looking up &ldquo;<span lang={lang}>{word}</span>&rdquo;...
        </div>
      )}

      {error && (
        <div className="space-y-1.5 pr-6">
          <p role="alert" className="text-amber-700 italic">{error} for &ldquo;<span lang={lang}>{word}</span>&rdquo;</p>
          <a
            href={`https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-amber-700 hover:text-amber-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
          >
            Search Wiktionary <ArrowUpRightIcon className="w-3 h-3 inline" aria-hidden="true" /><span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
      )}

      {result && (
        <>
          <div className="flex items-baseline gap-2 mb-2 pr-5">
            <span lang={lang} className="font-serif font-bold text-ink text-base">{result.word}</span>
            {result.phonetic && (
              <span className="text-xs text-amber-700">{result.phonetic}</span>
            )}
          </div>
          {result.meanings.map((m, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <span className="text-xs font-medium text-amber-700 italic">{m.partOfSpeech}</span>
              <ol className="list-decimal list-inside ml-1 mt-0.5 space-y-0.5">
                {m.definitions.map((d, j) => (
                  <li key={j} className="text-ink text-xs leading-relaxed">{d.definition}</li>
                ))}
              </ol>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
