"use client";
import { useEffect, useRef, useState } from "react";
import { createAnnotation, updateAnnotation, deleteAnnotation, Annotation } from "@/lib/api";

const COLORS = [
  { key: "yellow", label: "Yellow", bg: "bg-yellow-400", border: "border-yellow-500" },
  { key: "blue", label: "Blue", bg: "bg-blue-400", border: "border-blue-500" },
  { key: "green", label: "Green", bg: "bg-green-400", border: "border-green-500" },
  { key: "pink", label: "Pink", bg: "bg-pink-400", border: "border-pink-500" },
] as const;

type ColorKey = (typeof COLORS)[number]["key"];

interface Props {
  sentenceText: string;
  chapterIndex: number;
  bookId: number;
  position: { x: number; y: number };
  existingAnnotation?: { id: number; note_text: string; color: string };
  onClose: () => void;
  onSaved: (annotation: Annotation) => void;
  onDeleted: (id: number) => void;
}

export default function AnnotationToolbar({
  sentenceText,
  chapterIndex,
  bookId,
  position,
  existingAnnotation,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [color, setColor] = useState<ColorKey>(
    (existingAnnotation?.color as ColorKey) ?? "yellow",
  );
  const [note, setNote] = useState(existingAnnotation?.note_text ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
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

  // Position the panel so it doesn't overflow viewport
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    top: Math.min(position.y, window.innerHeight - 240),
    left: Math.min(position.x, window.innerWidth - 280),
    zIndex: 1000,
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let saved: Annotation;
      if (existingAnnotation) {
        saved = await updateAnnotation(existingAnnotation.id, { note_text: note, color });
      } else {
        saved = await createAnnotation({
          book_id: bookId,
          chapter_index: chapterIndex,
          sentence_text: sentenceText,
          note_text: note,
          color,
        });
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingAnnotation) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAnnotation(existingAnnotation.id);
      onDeleted(existingAnnotation.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      ref={panelRef}
      style={panelStyle}
      className="w-64 bg-white border border-amber-200 rounded-xl shadow-xl p-4 space-y-3"
      data-testid="annotation-toolbar"
    >
      {/* Color picker */}
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button
            key={c.key}
            title={c.label}
            onClick={() => setColor(c.key)}
            className={`w-7 h-7 rounded-full ${c.bg} border-2 transition-all ${
              color === c.key ? `${c.border} scale-110` : "border-transparent"
            }`}
            aria-label={c.label}
          />
        ))}
      </div>

      {/* Note textarea */}
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note… (optional)"
        rows={3}
        className="w-full text-sm border border-stone-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
      />

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-amber-700 text-white text-sm py-1.5 hover:bg-amber-800 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {existingAnnotation && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-red-300 text-red-600 text-sm px-3 py-1.5 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {deleting ? "…" : "Delete"}
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-lg border border-stone-300 text-stone-500 text-sm px-3 py-1.5 hover:bg-stone-50 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
