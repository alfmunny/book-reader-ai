"use client";
import { useEffect, useState } from "react";
import { BookMeta, getBookTranslationStatus, TranslationStatus } from "@/lib/api";
import { RecentBook } from "@/lib/recentBooks";
import { getSettings } from "@/lib/settings";

const LANG_NAMES: Record<string, string> = {
  en: "English", de: "German", fr: "French", es: "Spanish",
  it: "Italian", ja: "Japanese", zh: "Chinese", ru: "Russian",
  pt: "Portuguese", nl: "Dutch", fi: "Finnish", sv: "Swedish",
  no: "Norwegian", da: "Danish", pl: "Polish", cs: "Czech",
};

interface Props {
  book: BookMeta;
  recentBook?: RecentBook;
  onClose: () => void;
  onRead: () => void;
}

export default function BookDetailModal({ book, recentBook, onClose, onRead }: Props) {
  const [translationStatus, setTranslationStatus] = useState<TranslationStatus | null>(null);
  const translationLang = getSettings().translationLang;

  useEffect(() => {
    getBookTranslationStatus(book.id, translationLang)
      .then(setTranslationStatus)
      .catch(() => {});
  }, [book.id, translationLang]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasTranslation =
    translationStatus !== null && translationStatus.translated_chapters > 0;
  const fullTranslation =
    hasTranslation && translationStatus!.translated_chapters >= translationStatus!.total_chapters;
  const showTranslation =
    hasTranslation && translationLang !== (book.languages[0] ?? "en");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: cover + metadata + close */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-16 h-24 shrink-0 rounded-lg border border-amber-100 bg-amber-50 overflow-hidden flex items-center justify-center text-3xl">
            {book.cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={book.cover} alt={book.title} className="w-full h-full object-cover" />
              : "📖"}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-serif font-bold text-ink text-lg leading-tight mb-1">
              {book.title}
            </h2>
            <p className="text-sm text-amber-700">{book.authors.join(", ")}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {book.languages.map((lang) => (
                <span
                  key={lang}
                  className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700"
                >
                  {LANG_NAMES[lang] ?? lang.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Subject tags */}
        {book.subjects.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {book.subjects.slice(0, 5).map((s) => (
              <span key={s} className="text-xs px-2 py-0.5 bg-stone-100 rounded-full text-stone-500">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Translation availability */}
        {showTranslation && (
          <div className="flex items-center gap-2 mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span>✓</span>
            <span>
              {fullTranslation
                ? `Full ${LANG_NAMES[translationLang] ?? translationLang} translation available`
                : `${translationStatus!.translated_chapters}/${translationStatus!.total_chapters} chapters translated to ${LANG_NAMES[translationLang] ?? translationLang}`}
            </span>
          </div>
        )}

        {/* Continue-reading progress */}
        {recentBook && (
          <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Last read: Chapter {recentBook.lastChapter + 1}
          </div>
        )}

        {/* Primary CTA */}
        <button
          onClick={onRead}
          className="w-full rounded-xl bg-amber-700 text-white py-3 text-sm font-medium hover:bg-amber-800 transition-colors"
        >
          {recentBook
            ? `Continue Reading — Ch. ${recentBook.lastChapter + 1}`
            : "Start Reading"}
        </button>

        {book.download_count > 0 && (
          <p className="text-center text-xs text-stone-400 mt-3">
            {book.download_count.toLocaleString()} downloads on Project Gutenberg
          </p>
        )}
      </div>
    </div>
  );
}
