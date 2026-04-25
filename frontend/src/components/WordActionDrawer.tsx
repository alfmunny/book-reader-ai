"use client";
import { useEffect, useRef, useState } from "react";
import { SpeakerIcon, SaveIcon, NoteIcon, CheckCircleIcon } from "@/components/Icons";

interface Definition {
  partOfSpeech: string;
  definitions: { definition: string }[];
}

interface LookupResult {
  word: string;
  phonetic?: string;
  meanings: Definition[];
}

export interface WordAction {
  word: string;
  sentenceText: string;
  segmentStartTime: number;
  chapterIndex: number;
  translationText?: string;
}

interface Props {
  action: WordAction | null;
  language?: string;
  onClose: () => void;
  onReadSentence?: (text: string, startTime: number) => void;
  onSaveWord?: (word: string, sentenceText: string) => void;
  onAnnotate?: (sentenceText: string, chapterIndex: number) => void;
}

export default function WordActionDrawer({
  action,
  language,
  onClose,
  onReadSentence,
  onSaveWord,
  onAnnotate,
}: Props) {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const word = action?.word ?? "";

  useEffect(() => {
    if (!word || word.length < 2) return;
    setSaved(false);
    setLoading(true);
    setError("");
    setResult(null);

    const lang = language?.split(/[-_]/)[0] ?? "en";
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/${lang}/${encodeURIComponent(word.toLowerCase())}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        const entry = data?.[0];
        if (!entry) { setError("No definition found"); return; }
        setResult({
          word: entry.word,
          phonetic: entry.phonetic || entry.phonetics?.[0]?.text,
          meanings: entry.meanings?.slice(0, 2).map((m: any) => ({
            partOfSpeech: m.partOfSpeech,
            definitions: m.definitions?.slice(0, 2),
          })) ?? [],
        });
      })
      .catch(() => setError("No definition found"))
      .finally(() => setLoading(false));
  }, [word]);

  useEffect(() => {
    if (!action) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [action, onClose]);

  // Close when clicking outside the drawer
  useEffect(() => {
    if (!action) return;
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    const t = setTimeout(() => document.addEventListener("mousedown", handleClick), 100);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [action, onClose]);

  // Move focus to drawer on open; restore on unmount
  useEffect(() => {
    if (!action) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    drawerRef.current?.focus();
    return () => {
      previouslyFocused?.focus?.();
    };
  }, [action]);

  if (!action) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Word lookup: ${word}`}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t border-amber-200 max-h-[60vh] overflow-y-auto safe-bottom animate-slide-up focus:outline-none"
      >
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-amber-200 rounded-full" />
        </div>

        <div className="px-5 pb-5 space-y-3">
          {/* Word + phonetic */}
          <div className="flex items-baseline gap-2">
            <span className="font-serif font-bold text-ink text-xl">{action.word}</span>
            {result?.phonetic && (
              <span className="text-sm text-amber-500">{result.phonetic}</span>
            )}
          </div>

          {/* Dictionary definitions */}
          {loading && (
            <div role="status" aria-label="Looking up word" className="flex items-center gap-2 text-amber-600 text-sm">
              <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
              Looking up...
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-amber-500 italic">{error}</p>
          )}

          {result && result.meanings.length > 0 && (
            <div className="space-y-2">
              {result.meanings.map((m, i) => (
                <div key={i}>
                  <span className="text-xs font-medium text-amber-700 italic">{m.partOfSpeech}</span>
                  <ol className="list-decimal list-inside ml-1 mt-0.5 space-y-0.5">
                    {m.definitions.map((d, j) => (
                      <li key={j} className="text-ink text-sm leading-relaxed">{d.definition}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {/* Translation context */}
          {action.translationText && (
            <div className="border-l-2 border-amber-300 pl-3 py-1">
              <p className="text-xs text-amber-500 mb-0.5">Translation</p>
              <p className="text-sm text-amber-800 italic">{action.translationText}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            {onReadSentence && (
              <button
                onClick={() => {
                  onReadSentence(action.sentenceText, action.segmentStartTime);
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                <SpeakerIcon className="w-4 h-4 shrink-0" /> Read
              </button>
            )}
            {onSaveWord && (
              <button
                onClick={() => {
                  if (!saved) {
                    onSaveWord(action.word, action.sentenceText);
                    setSaved(true);
                  }
                }}
                disabled={saved}
                className={`flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl border text-sm font-medium transition-colors ${
                  saved
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                }`}
              >
                {saved ? <><CheckCircleIcon className="w-4 h-4 shrink-0" /> Saved</> : <><SaveIcon className="w-4 h-4 shrink-0" /> Save</>}
              </button>
            )}
            {onAnnotate && (
              <button
                onClick={() => {
                  onAnnotate(action.sentenceText, action.chapterIndex);
                  onClose();
                }}
                className="flex-1 flex items-center justify-center gap-1.5 min-h-[48px] rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                <NoteIcon className="w-4 h-4 shrink-0" /> Note
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
