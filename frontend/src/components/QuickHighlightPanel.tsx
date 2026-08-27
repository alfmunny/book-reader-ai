"use client";
import { useEffect, useRef, useState } from "react";
import { createAnnotation, updateAnnotation, deleteAnnotation, Annotation } from "@/lib/api";
import { TrashIcon, NoteIcon } from "@/components/Icons";

const COLORS = [
  { key: "yellow", bg: "bg-yellow-400", border: "border-yellow-500", label: "Yellow" },
  { key: "blue", bg: "bg-blue-400", border: "border-blue-500", label: "Blue" },
  { key: "green", bg: "bg-green-400", border: "border-green-500", label: "Green" },
  { key: "pink", bg: "bg-pink-400", border: "border-pink-500", label: "Pink" },
] as const;

type ColorKey = (typeof COLORS)[number]["key"];

interface Props {
  sentenceText: string;
  chapterIndex: number;
  bookId: number;
  position: { x: number; y: number };
  existingAnnotation?: Annotation;
  onClose: () => void;
  onSaved: (annotation: Annotation) => void;
  onDeleted: (id: number) => void;
  onOpenNote?: () => void;
  /** Other readers' shared notes on this sentence (WeRead beside-your-note
   *  pattern, #2752). Rendered as a row that opens the shared-notes panel. */
  sharedCount?: number;
  onShowShared?: () => void;
}

export default function QuickHighlightPanel({
  sentenceText,
  chapterIndex,
  bookId,
  position,
  existingAnnotation,
  onClose,
  onSaved,
  onDeleted,
  onOpenNote,
  sharedCount,
  onShowShared,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedToolbarIdx, setFocusedToolbarIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  function handleToolbarKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const btns = Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    if (btns.length === 0) return;
    const cur = btns.indexOf(document.activeElement as HTMLButtonElement);
    const base = cur >= 0 ? cur : focusedToolbarIdx;
    const next = e.key === "ArrowRight"
      ? (base + 1) % btns.length
      : (base - 1 + btns.length) % btns.length;
    setFocusedToolbarIdx(next);
    btns[next].focus();
  }

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    toolbarRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { prev?.focus?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const PANEL_W = 220;
  const left = Math.max(8, Math.min(position.x - PANEL_W / 2, window.innerWidth - PANEL_W - 8));
  const top = Math.min(position.y + 8, window.innerHeight - 72);

  async function handleColor(colorKey: ColorKey) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let saved: Annotation;
      if (existingAnnotation) {
        saved = await updateAnnotation(existingAnnotation.id, {
          color: colorKey,
          note_text: existingAnnotation.note_text,
        });
      } else {
        saved = await createAnnotation({
          book_id: bookId,
          chapter_index: chapterIndex,
          sentence_text: sentenceText,
          note_text: "",
          color: colorKey,
        });
      }
      onSaved(saved);
      onClose();
    } catch {
      setBusy(false);
      setError("Save failed — tap a colour to retry.");
    }
  }

  async function handleDelete() {
    if (!existingAnnotation || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAnnotation(existingAnnotation.id);
      onDeleted(existingAnnotation.id);
      onClose();
    } catch {
      setBusy(false);
      setError("Delete failed — tap to retry.");
    }
  }

  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", top, left, zIndex: 1000 }}
      className="flex flex-col gap-1 animate-fade-in"
      data-testid="quick-highlight-panel"
    >
    {/* WeChat-style note display: the note lives in this panel — tapping the
        marked text is the affordance; there is no per-line dot anymore. */}
    {existingAnnotation?.note_text && (
      <div
        data-testid="quick-highlight-note"
        className="bg-white border border-amber-200 rounded-xl shadow-xl px-3 py-2.5 text-sm text-stone-700 leading-relaxed max-h-40 overflow-y-auto overscroll-contain"
        style={{ width: PANEL_W + 60 }}
      >
        <p className="text-[11px] font-medium text-stone-500 mb-1">Note</p>
        <p className="whitespace-pre-wrap">{existingAnnotation.note_text}</p>
      </div>
    )}
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Highlight options"
      onKeyDown={handleToolbarKeyDown}
      className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl shadow-xl px-3 py-2.5"
    >
      {COLORS.map((c, idx) => (
        <button
          key={c.key}
          title={c.label}
          onClick={() => { setFocusedToolbarIdx(idx); handleColor(c.key); }}
          onFocus={() => setFocusedToolbarIdx(idx)}
          tabIndex={focusedToolbarIdx === idx ? 0 : -1}
          disabled={busy}
          aria-label={c.label}
          aria-pressed={existingAnnotation?.color === c.key}
          className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <span
            className={`w-7 h-7 rounded-full ${c.bg} border-2 transition-all hover:scale-110 ${
              existingAnnotation?.color === c.key ? `${c.border} scale-110` : "border-transparent"
            }`}
          />
        </button>
      ))}
      {onOpenNote && (
        <button
          title={existingAnnotation?.note_text ? "Edit note" : "Add note"}
          onClick={onOpenNote}
          onFocus={() => setFocusedToolbarIdx(COLORS.length)}
          tabIndex={focusedToolbarIdx === COLORS.length ? 0 : -1}
          disabled={busy}
          aria-label={existingAnnotation?.note_text ? "Edit note" : "Add note"}
          className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-stone-600 hover:text-stone-700 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
        >
          <span className="w-7 h-7 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center hover:bg-stone-200 transition-colors">
            <NoteIcon className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
      {existingAnnotation && (
        <button
          title="Delete highlight"
          onClick={handleDelete}
          onFocus={() => setFocusedToolbarIdx(COLORS.length + (onOpenNote ? 1 : 0))}
          tabIndex={focusedToolbarIdx === COLORS.length + (onOpenNote ? 1 : 0) ? 0 : -1}
          disabled={busy}
          aria-label="Delete highlight"
          className="min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center text-red-500 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
        >
          <span className="w-7 h-7 rounded-full bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors">
            <TrashIcon className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
    </div>
    {error && (
      <p role="alert" className="text-xs text-red-600 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 shadow-sm">
        {error}
      </p>
    )}
    {!!sharedCount && onShowShared && (
      <button
        onClick={onShowShared}
        data-testid="quick-panel-shared-notes"
        className="text-xs text-amber-700 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 shadow-sm hover:bg-amber-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      >
        Shared notes from other readers →
      </button>
    )}
    </div>
  );
}
