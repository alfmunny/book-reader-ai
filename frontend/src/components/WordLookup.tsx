"use client";
import { useEffect, useRef, useState } from "react";

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
  onClose: () => void;
}

export default function WordLookup({ word, position, onClose }: Props) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);

    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`)
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
    <div ref={ref} style={style} className="sm:w-72 max-h-64 overflow-y-auto rounded-xl border border-amber-300 bg-white shadow-lg p-3 text-sm">
      {loading && (
        <div className="flex items-center gap-2 text-amber-600">
          <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
          Looking up &ldquo;{word}&rdquo;...
        </div>
      )}

      {error && (
        <p className="text-amber-600 italic">{error} for &ldquo;{word}&rdquo;</p>
      )}

      {result && (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-serif font-bold text-ink text-base">{result.word}</span>
            {result.phonetic && (
              <span className="text-xs text-amber-500">{result.phonetic}</span>
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
