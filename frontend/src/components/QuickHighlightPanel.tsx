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
}: Props) {
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

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
    }
  }

  async function handleDelete() {
    if (!existingAnnotation || busy) return;
    setBusy(true);
    try {
      await deleteAnnotation(existingAnnotation.id);
      onDeleted(existingAnnotation.id);
      onClose();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      ref={panelRef}
      style={{ position: "fixed", top, left, zIndex: 1000 }}
      className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl shadow-xl px-3 py-2.5 animate-fade-in"
      data-testid="quick-highlight-panel"
    >
      {COLORS.map((c) => (
        <button
          key={c.key}
          title={c.label}
          onClick={() => handleColor(c.key)}
          disabled={busy}
          aria-label={c.label}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
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
          title="Add note"
          onClick={onOpenNote}
          disabled={busy}
          aria-label="Add note"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-500 hover:text-stone-700 disabled:opacity-50 transition-colors"
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
          disabled={busy}
          aria-label="Delete highlight"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-500 disabled:opacity-50 transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors">
            <TrashIcon className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
    </div>
  );
}
