"use client";
import { useEffect, useRef, useState } from "react";
import { createAnnotation, updateAnnotation, deleteAnnotation, Annotation } from "@/lib/api";
import { CloseIcon, NoteIcon, TrashIcon } from "@/components/Icons";

const COLORS = [
  { key: "yellow", label: "Yellow", bg: "bg-yellow-400", border: "border-yellow-500", ring: "ring-yellow-400" },
  { key: "blue",   label: "Blue",   bg: "bg-blue-400",   border: "border-blue-500",   ring: "ring-blue-400"   },
  { key: "green",  label: "Green",  bg: "bg-green-400",  border: "border-green-500",  ring: "ring-green-400"  },
  { key: "pink",   label: "Pink",   bg: "bg-pink-400",   border: "border-pink-500",   ring: "ring-pink-400"   },
] as const;

type ColorKey = (typeof COLORS)[number]["key"];

interface Props {
  sentenceText: string;
  chapterIndex: number;
  bookId: number;
  existingAnnotation?: { id: number; note_text: string; color: string };
  onClose: () => void;
  onSaved: (annotation: Annotation) => void;
  onDeleted: (id: number) => void;
}

export default function AnnotationToolbar({
  sentenceText,
  chapterIndex,
  bookId,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" aria-hidden="true" data-testid="annotation-backdrop" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="annotation-toolbar-title"
        className="relative w-full max-w-sm bg-parchment border border-amber-200 rounded-2xl shadow-2xl animate-fade-in overflow-hidden"
        data-testid="annotation-toolbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-100">
          <div className="flex items-center gap-2 text-amber-800">
            <NoteIcon className="w-4 h-4" aria-hidden="true" />
            <span id="annotation-toolbar-title" className="font-serif font-semibold text-sm">
              {existingAnnotation ? "Edit note" : "Add note"}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-stone-500 hover:text-stone-700 hover:bg-amber-50 transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-5 space-y-4">
          {/* Quoted sentence */}
          <p className="text-xs text-amber-700 font-serif italic line-clamp-2 leading-relaxed border-l-2 border-amber-300 pl-3">
            {sentenceText}
          </p>

          {/* Color picker */}
          <div>
            <p className="text-xs text-stone-500 mb-2" aria-hidden="true">Highlight colour</p>
            <div role="radiogroup" aria-label="Highlight colour" className="flex items-center gap-0.5">
              {COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  title={c.label}
                  onClick={() => setColor(c.key)}
                  aria-label={c.label}
                  aria-checked={color === c.key}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <span
                    className={`w-8 h-8 rounded-full ${c.bg} border-2 transition-all duration-150 hover:scale-110 inline-block ${
                      color === c.key
                        ? `${c.border} scale-110 ring-2 ring-offset-1 ${c.ring}`
                        : "border-transparent"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Note textarea */}
          <div>
            <label htmlFor="annotation-note" className="block text-xs text-stone-500 mb-1.5">Note <span className="text-stone-500">(optional)</span></label>
            <textarea
              ref={textareaRef}
              id="annotation-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Your thoughts on this passage…"
              rows={4}
              className="w-full text-sm font-serif text-ink bg-white border border-amber-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 placeholder:text-stone-400 leading-relaxed"
            />
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-amber-700 text-white text-sm font-medium py-2.5 min-h-[44px] hover:bg-amber-800 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : existingAnnotation ? "Update" : "Save note"}
            </button>
            {existingAnnotation && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                aria-label="Delete note"
                className="rounded-xl border border-red-200 text-red-500 px-3 py-2.5 min-h-[44px] hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
