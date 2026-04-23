"use client";
import { useState } from "react";
import type { Annotation } from "@/lib/api";
import { ArrowRightIcon, NoteIcon, EditIcon, CloseIcon, EmptyNotesIcon } from "@/components/Icons";

const COLOR_BADGE: Record<string, string> = {
  yellow: "bg-yellow-100 border-yellow-300 text-yellow-800",
  blue:   "bg-blue-100 border-blue-300 text-blue-800",
  green:  "bg-green-100 border-green-300 text-green-800",
  pink:   "bg-pink-100 border-pink-300 text-pink-800",
};

const COLOR_DOT: Record<string, string> = {
  yellow: "bg-yellow-400",
  blue:   "bg-blue-400",
  green:  "bg-green-400",
  pink:   "bg-pink-400",
};

interface Props {
  annotations: Annotation[];
  /** Total annotation count across all chapters — shown in the badge */
  totalCount: number;
  /** Called when user clicks an annotation entry to jump to it */
  onJump: (annotation: Annotation) => void;
  onEdit: (annotation: Annotation) => void;
  loading?: boolean;
  /** When provided, "View all notes" links to /notes/{bookId} instead of /notes */
  bookId?: number;
}

export default function AnnotationsSidebar({ annotations, totalCount, onJump, onEdit, loading, bookId }: Props) {
  const [open, setOpen] = useState(false);

  // Group by chapter
  const byChapter = annotations.reduce<Record<number, Annotation[]>>((acc, a) => {
    (acc[a.chapter_index] ??= []).push(a);
    return acc;
  }, {});
  const chapters = Object.keys(byChapter).map(Number).sort((a, b) => a - b);

  return (
    <>
      {/* Toggle button — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Annotations"
        className="relative shrink-0 flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-medium transition-colors min-h-[44px] md:min-h-0"
        data-testid="annotations-toggle"
      >
        <NoteIcon className="w-3.5 h-3.5" /> Notes
        {totalCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold px-1">
            {totalCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div
          className="fixed right-0 top-0 h-full w-full sm:w-80 bg-white border-l border-amber-200 shadow-2xl z-50 flex flex-col"
          data-testid="annotations-sidebar"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
            <h2 className="font-serif font-semibold text-ink text-sm">Annotations</h2>
            <button
              onClick={() => setOpen(false)}
              className="text-stone-400 hover:text-stone-600"
              aria-label="Close"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-0">
            {loading && annotations.length === 0 ? (
              <div className="flex justify-center mt-10">
                <span className="w-5 h-5 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
              </div>
            ) : annotations.length === 0 ? (
              <div className="text-center text-stone-400 mt-10 text-sm">
                <EmptyNotesIcon className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                <p>No annotations yet.</p>
                <p className="mt-1 text-xs">Click a sentence and choose Note to add one.</p>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="flex justify-center py-1">
                    <span className="w-4 h-4 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
                  </div>
                )}
              {chapters.map((ch) => (
                <div key={ch}>
                  <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">
                    Chapter {ch + 1}
                  </h3>
                  <div className="space-y-2">
                    {byChapter[ch].map((ann) => (
                      <div
                        key={ann.id}
                        className={`rounded-lg border px-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity ${COLOR_BADGE[ann.color] ?? COLOR_BADGE.yellow}`}
                        onClick={() => { onJump(ann); setOpen(false); }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs italic leading-relaxed line-clamp-3 flex-1">
                            &ldquo;{ann.sentence_text}&rdquo;
                          </p>
                          <div className="flex items-center gap-1 shrink-0 mt-0.5">
                            {bookId && (
                              <a
                                href={`/notes/${bookId}#annotation-${ann.id}`}
                                onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                                className="opacity-60 hover:opacity-100"
                                title="View in notes page"
                                aria-label="View in notes page"
                              >
                                <ArrowRightIcon className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); onEdit(ann); setOpen(false); }}
                              className="opacity-60 hover:opacity-100"
                              title="Edit annotation"
                              aria-label="Edit annotation"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {ann.note_text && (
                          <p className="mt-1.5 text-xs font-medium border-t border-current/20 pt-1.5">
                            {ann.note_text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-amber-100 px-4 py-3 shrink-0 flex gap-3 justify-between">
            <a
              href={bookId ? `/notes/${bookId}` : "/notes"}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
            >
              {bookId ? "Book notes" : "All notes"} <ArrowRightIcon className="w-3 h-3 shrink-0" />
            </a>
            <a
              href="/notes"
              onClick={() => setOpen(false)}
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              All books
            </a>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/10"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
