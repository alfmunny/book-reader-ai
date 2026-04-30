"use client";
import { useEffect, useRef, useState } from "react";
import { getWordDefinition, WordDefinition } from "@/lib/api";
import { CloseIcon, CheckCircleIcon, ArrowUpRightIcon } from "@/components/Icons";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Props {
  word: string;
  lang: string;
  rect: DOMRect;
  onClose: () => void;
  onSave: () => void;
}

export default function VocabWordTooltip({ word, lang, rect, onClose, onSave }: Props) {
  const [def, setDef] = useState<WordDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);

  useEffect(() => {
    setLoading(true);
    setFetchError(false);
    setDef(null);
    setSaved(false);
    getWordDefinition(word, lang)
      .then(setDef)
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [word, lang, retryTick]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
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

  // Move focus into the dialog on mount so screen readers announce it; restore on close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => { prev?.focus?.(); };
  }, []);

  // Position near the selection, keep within viewport
  const tooltipW = 288;
  const tooltipH = 220;
  let left = rect.left + rect.width / 2 - tooltipW / 2;
  let top = rect.bottom + 8;
  if (left < 8) left = 8;
  if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8;
  if (top + tooltipH > window.innerHeight - 8) top = rect.top - tooltipH - 8;

  function handleSave() {
    if (saved) return;
    setSaved(true);
    onSave();
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vocab-tooltip-title"
      tabIndex={-1}
      className="fixed z-50 w-72 rounded-xl border border-amber-200 bg-white shadow-xl overflow-hidden focus:outline-none"
      style={{ left, top }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-amber-100">
        <span id="vocab-tooltip-title" lang={lang ?? undefined} className="font-semibold text-ink text-sm">{word}</span>
        <button onClick={onClose} aria-label="Close word definition" className="text-stone-600 hover:text-stone-700 p-0.5 rounded transition-colors min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"><CloseIcon className="w-3.5 h-3.5" /></button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 max-h-40 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 text-amber-700 text-xs py-1" role="status">
            <span className="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin shrink-0" aria-hidden="true" />
            Looking up definition…
          </div>
        )}
        {!loading && fetchError && (
          <div role="status" className="flex flex-col items-center gap-1.5 py-1 text-center">
            <p className="text-xs text-stone-500">Couldn&apos;t load definition.</p>
            <button
              onClick={() => setRetryTick((t) => t + 1)}
              className="text-xs px-2.5 py-1 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !fetchError && (!def || def.definitions.length === 0) && (
          <p className="text-xs text-stone-600 italic">No definition found.</p>
        )}
        {!loading && def && def.definitions.length > 0 && (
          <div className="space-y-2">
            {def.lemma && def.lemma !== word && (
              <p className="text-[11px] text-stone-600">
                Base form: <span className="font-medium text-stone-600">{def.lemma}</span>
              </p>
            )}
            {def.definitions.slice(0, 2).map((d, i) => (
              <div key={i}>
                {d.pos && (
                  <span className="text-[11px] font-medium text-amber-700 italic">{d.pos}</span>
                )}
                <p className="text-xs text-ink leading-relaxed mt-0.5">{d.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-amber-100 bg-amber-50/40">
        {def?.url ? (
          <a
            href={def.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-amber-700 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
          >
            Wiktionary <ArrowUpRightIcon className="w-3 h-3 inline" aria-hidden="true" /><span className="sr-only"> (opens in new tab)</span>
          </a>
        ) : <span />}
        <button
          onClick={handleSave}
          disabled={saved}
          className={`text-xs font-medium px-3 py-1 min-h-[44px] md:min-h-0 rounded-lg transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700 ${
            saved
              ? "bg-stone-100 text-stone-600 cursor-default"
              : "bg-amber-700 text-white hover:bg-amber-800"
          }`}
        >
          {saved ? (
            <span className="flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />Saved</span>
          ) : "Save to vocab"}
        </button>
      </div>
    </div>
  );
}
