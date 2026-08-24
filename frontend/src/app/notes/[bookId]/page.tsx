"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  getAnnotations,
  getInsights,
  getVocabulary,
  getBookChapters,
  updateAnnotation,
  deleteAnnotation,
  deleteInsight,
  exportVocabularyToObsidian,
  Annotation,
  BookInsight,
  VocabularyWord,
  BookChapter,
  BookMeta,
} from "@/lib/api";

import { chapterLabel, truncate } from "@/lib/notesMarkdown";
import { ArrowLeftIcon, TrashIcon, EditIcon, ChevronRightIcon, ChevronDownIcon, ArrowRightIcon, RetryIcon, EmptyNotesIcon, ArrowUpRightIcon, AlertCircleIcon } from "@/components/Icons";
import UndoToast from "@/components/UndoToast";
import InsightMarkdown from "@/components/InsightMarkdown";

type ViewMode = "section" | "chapter";

// ── Sub-components ─────────────────────────────────────────────────────────────

function CollapseHeading({
  label,
  count,
  isCollapsed,
  onToggle,
  level = 2,
  controlsId,
}: {
  label: string;
  count?: number;
  isCollapsed: boolean;
  onToggle: () => void;
  level?: 2 | 3;
  controlsId?: string;
}) {
  const Tag = `h${level}` as "h2" | "h3";
  return (
    <Tag className={level === 2 ? "mt-8 mb-3" : "mt-5 mb-2"}>
      <button
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-controls={controlsId}
        className={`w-full flex items-center gap-2 text-left group min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
          level === 2 ? "pb-1.5 border-b border-amber-200" : ""
        }`}
      >
        {isCollapsed ? <ChevronRightIcon className="w-3 h-3 text-amber-700 shrink-0" /> : <ChevronDownIcon className="w-3 h-3 text-amber-700 shrink-0" />}
        <span className={level === 2
          ? "text-lg font-serif font-semibold text-ink group-hover:text-amber-800 transition-colors"
          : "text-sm font-semibold text-amber-800 uppercase tracking-wide group-hover:text-amber-900 transition-colors"
        }>
          {label}
        </span>
        {count !== undefined && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-700 font-sans ml-1 shrink-0">
            {count}
          </span>
        )}
      </button>
    </Tag>
  );
}

function AnnotationCard({
  ann,
  chapters,
  bookId,
  bookLanguage,
  isEditing,
  editNote,
  saveError,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
  onDelete,
  isDeleting,
}: {
  ann: Annotation;
  chapters: BookChapter[];
  bookId: number;
  bookLanguage: string;
  isEditing: boolean;
  editNote: string;
  saveError: boolean;
  onEdit: () => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  return (
    <div
      id={`annotation-${ann.id}`}
      className="border-l-4 border-amber-300 pl-4 my-3 scroll-mt-24"
    >
      <p lang={bookLanguage} className="italic text-stone-600 leading-relaxed text-sm">
        &ldquo;{ann.sentence_text}&rdquo;
      </p>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <textarea
            aria-label="Edit note"
            value={editNote}
            onChange={(e) => onEditChange(e.target.value)}
            className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="px-3 py-1 text-xs bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1 text-xs text-stone-600 hover:text-stone-700 transition-colors min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              Cancel
            </button>
          </div>
          {saveError && (
            <p role="alert" className="text-xs text-red-600">
              Couldn&apos;t save — try again.
            </p>
          )}
        </div>
      ) : (
        ann.note_text && (
          <p className="mt-1.5 text-sm text-ink">{ann.note_text}</p>
        )
      )}

      {!isEditing && (
        <div className="flex items-center gap-3 mt-2">
          <a
            href={`/reader/${bookId}?chapter=${ann.chapter_index}&sentence=${encodeURIComponent(ann.sentence_text)}`}
            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
          >
            <ArrowRightIcon className="w-3 h-3 shrink-0" /> {chapterLabel(chapters, ann.chapter_index)}
          </a>
          <button
            onClick={onEdit}
            className="text-stone-600 hover:text-stone-700 transition-colors p-1 min-h-[44px] md:min-h-0 flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            title="Edit note"
            aria-label={`Edit annotation: ${ann.sentence_text.slice(0, 60)}`}
          >
            <EditIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            aria-busy={isDeleting}
            className="text-red-500 hover:text-red-600 disabled:opacity-40 transition-colors p-1 min-h-[44px] md:min-h-0 flex items-center justify-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
            title="Delete annotation"
            aria-label={isDeleting ? "Deleting annotation…" : `Delete annotation: ${ann.sentence_text.slice(0, 60)}`}
          >
            {isDeleting ? <RetryIcon className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}

function InsightCard({
  ins,
  chapters,
  bookId,
  onDelete,
  isDeleting,
  bookLanguage,
}: {
  ins: BookInsight;
  chapters: BookChapter[];
  bookId: number;
  onDelete: () => void;
  isDeleting: boolean;
  bookLanguage?: string;
}) {
  const readerHref = ins.chapter_index !== null
    ? `/reader/${bookId}?chapter=${ins.chapter_index}${ins.context_text ? `&sentence=${encodeURIComponent(ins.context_text)}` : ""}`
    : null;

  return (
    <div className="my-3 space-y-1.5">
      {ins.context_text && (
        <blockquote lang={bookLanguage ?? undefined} className="border-l-4 border-amber-200 pl-4 italic text-stone-600 text-sm leading-relaxed">
          &ldquo;{truncate(ins.context_text, 200)}&rdquo;
        </blockquote>
      )}
      <p className="text-sm text-ink">
        <span className="font-semibold">Q:</span> {ins.question}
      </p>
      <InsightMarkdown markdown={ins.answer} className="text-sm" />
      <div className="flex items-center gap-3 pt-0.5">
        {readerHref && (
          <a
            href={readerHref}
            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
          >
            <ArrowRightIcon className="w-3 h-3 shrink-0" /> {chapterLabel(chapters, ins.chapter_index as number)}
          </a>
        )}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          aria-busy={isDeleting}
          className="text-red-500 hover:text-red-600 disabled:opacity-40 transition-colors min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1"
          title="Delete insight"
          aria-label={isDeleting ? "Deleting insight…" : `Delete insight: ${ins.question.slice(0, 60)}`}
        >
          {isDeleting ? <RetryIcon className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <TrashIcon className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function VocabRow({
  word,
  occurrence,
  chapters,
  bookLanguage,
}: {
  word: string;
  occurrence: { book_id: number; chapter_index: number; sentence_text: string };
  chapters: BookChapter[];
  bookLanguage: string;
}) {
  const { book_id, chapter_index, sentence_text } = occurrence;
  const readerHref = `/reader/${book_id}?chapter=${chapter_index}&sentence=${encodeURIComponent(sentence_text)}&word=${encodeURIComponent(word)}`;
  return (
    <li className="flex gap-2 text-sm leading-relaxed before:content-['·'] before:text-amber-400 before:font-bold before:shrink-0">
      <span>
        <a
          lang={bookLanguage ?? undefined}
          href={`/vocabulary?word=${encodeURIComponent(word)}`}
          className="font-semibold text-amber-700 hover:text-amber-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
        >
          {word}
        </a>{" "}
        <span className="text-stone-600 text-xs">({chapterLabel(chapters, chapter_index)})</span>
        {" — "}
        <a
          href={readerHref}
          className="italic text-stone-600 hover:text-amber-700 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
        >
          <span lang={bookLanguage}>&ldquo;{truncate(occurrence.sentence_text, 90)}&rdquo;</span>
        </a>
      </span>
    </li>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function BookNotesPage() {
  const params = useParams();
  const bookId = Number(params.bookId);
  const router = useRouter();
  const { status } = useSession();

  const [viewMode, setViewMode] = useState<ViewMode>("section");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [insights, setInsights] = useState<BookInsight[]>([]);
  const [vocab, setVocab] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Collapse state
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editSaveError, setEditSaveError] = useState(false);

  // Delete loading sets (still used for notes opened mid-delete)
  const [deletingAnns, setDeletingAnns] = useState<Set<number>>(new Set());
  const [deletingIns, setDeletingIns] = useState<Set<number>>(new Set());

  // Undo toast state
  const [deletedAnnToast, setDeletedAnnToast] = useState<Annotation | null>(null);
  const [deletedInsToast, setDeletedInsToast] = useState<BookInsight | null>(null);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Export
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const didScrollRef = useRef(false);

  const loadData = useCallback(() => {
    setFetchError(false);
    setLoading(true);
    Promise.all([
      getBookChapters(bookId),
      getAnnotations(bookId),
      getInsights(bookId),
      getVocabulary(),
    ]).then(([chapData, anns, ins, voc]) => {
      setMeta(chapData.meta);
      setChapters(chapData.chapters);
      setAnnotations(anns);
      setInsights(ins);
      setVocab(voc);
    }).catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status !== "authenticated") return;
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, bookId]);

  // Scroll to anchor on first load
  useEffect(() => {
    if (loading || didScrollRef.current) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash) return;
    didScrollRef.current = true;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  }, [loading]);

  // Update page title when book metadata loads (WCAG 2.4.2)
  useEffect(() => {
    if (!meta?.title) return;
    document.title = `${meta.title} — Notes — Book Reader AI`;
    return () => { document.title = "My Library — Book Reader AI"; };
  }, [meta]);

  const bookLanguage = meta?.languages?.[0] ?? "en";
  const bookVocab = vocab.filter((v) => v.occurrences.some((o) => o.book_id === bookId));

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function allSectionKeys(): string[] {
    const keys: string[] = ["ann", "insights", "vocab"];
    const chSet = new Set<number>();
    annotations.forEach((a) => chSet.add(a.chapter_index));
    insights.filter((i) => i.chapter_index !== null).forEach((i) => chSet.add(i.chapter_index as number));
    bookVocab.forEach((v) => v.occurrences.filter((o) => o.book_id === bookId).forEach((o) => chSet.add(o.chapter_index)));
    chSet.forEach((ch) => keys.push(`ch-${ch}`));
    return keys;
  }

  const isAllCollapsed = allSectionKeys().every((k) => collapsed.has(k));

  function toggleCollapseAll() {
    if (isAllCollapsed) {
      setCollapsed(new Set());
    } else {
      setCollapsed(new Set(allSectionKeys()));
    }
  }

  // Edit handlers
  function startEdit(ann: Annotation) {
    setEditSaveError(false);
    setEditingId(ann.id);
    setEditNote(ann.note_text);
  }

  async function saveEdit() {
    if (editingId === null) return;
    setEditSaveError(false);
    try {
      const updated = await updateAnnotation(editingId, { note_text: editNote });
      setAnnotations((prev) => prev.map((a) => (a.id === editingId ? { ...a, note_text: updated.note_text } : a)));
      setEditingId(null);
    } catch {
      setEditSaveError(true);
    }
  }

  function handleDeleteAnnotation(id: number) {
    // If a previous toast is pending, commit that delete immediately
    if (deletedAnnToast) {
      deleteAnnotation(deletedAnnToast.id).catch(() => {
        setDeleteErrorMsg("Could not delete annotation — please try again");
        setTimeout(() => setDeleteErrorMsg(null), 5000);
      });
      setDeletedAnnToast(null);
    }
    const ann = annotations.find((a) => a.id === id);
    if (!ann) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    setDeletedAnnToast(ann);
  }

  function handleDeleteInsight(id: number) {
    // If a previous toast is pending, commit that delete immediately
    if (deletedInsToast) {
      deleteInsight(deletedInsToast.id).catch(() => {
        setDeleteErrorMsg("Could not delete insight — please try again");
        setTimeout(() => setDeleteErrorMsg(null), 5000);
      });
      setDeletedInsToast(null);
    }
    const ins = insights.find((i) => i.id === id);
    if (!ins) return;
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setDeletedInsToast(ins);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { urls } = await exportVocabularyToObsidian(bookId);
      const url = urls[0] ?? null;
      setExportUrl(url);
      setExportMsg(url ? "Exported!" : "Exported successfully");
    } catch (e) {
      setExportUrl(null);
      setExportMsg(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setTimeout(() => { setExportMsg(null); setExportUrl(null); }, 5000);
    }
  }

  const annCount = annotations.length;
  const insCount = insights.length;
  const vocCount = bookVocab.length;

  // Shared rendering helpers
  function renderAnnotation(ann: Annotation) {
    return (
      <li key={ann.id}>
        <AnnotationCard
          ann={ann}
          chapters={chapters}
          bookId={bookId}
          bookLanguage={bookLanguage}
          isEditing={editingId === ann.id}
          editNote={editNote}
          saveError={editSaveError}
          onEdit={() => startEdit(ann)}
          onEditChange={setEditNote}
          onSave={saveEdit}
          onCancel={() => { setEditSaveError(false); setEditingId(null); }}
          onDelete={() => handleDeleteAnnotation(ann.id)}
          isDeleting={deletingAnns.has(ann.id)}
        />
      </li>
    );
  }

  function renderInsight(ins: BookInsight) {
    return (
      <li key={ins.id}>
        <InsightCard
          ins={ins}
          chapters={chapters}
          bookId={bookId}
          onDelete={() => handleDeleteInsight(ins.id)}
          isDeleting={deletingIns.has(ins.id)}
          bookLanguage={bookLanguage}
        />
      </li>
    );
  }

  // ── Section view ─────────────────────────────────────────────────────────────
  function renderSectionView() {
    const byChapterAnn = new Map<number, Annotation[]>();
    for (const a of annotations) {
      (byChapterAnn.get(a.chapter_index) ?? (byChapterAnn.set(a.chapter_index, []) && byChapterAnn.get(a.chapter_index)))!.push(a);
    }
    const annChapters = Array.from(byChapterAnn.keys()).sort((a, b) => a - b);

    const byChapterIns = new Map<number, BookInsight[]>();
    const bookLevelIns: BookInsight[] = [];
    for (const i of insights) {
      if (i.chapter_index === null) { bookLevelIns.push(i); continue; }
      (byChapterIns.get(i.chapter_index) ?? (byChapterIns.set(i.chapter_index, []) && byChapterIns.get(i.chapter_index)))!.push(i);
    }
    const insChapters = Array.from(byChapterIns.keys()).sort((a, b) => a - b);

    return (
      <div>
        {/* Annotations */}
        {annCount > 0 && (
          <section aria-label="Annotations">
            <CollapseHeading
              label="Annotations"
              count={annCount}
              isCollapsed={collapsed.has("ann")}
              onToggle={() => toggleCollapse("ann")}
              controlsId="collapse-ann"
            />
            {!collapsed.has("ann") && (
              <div id="collapse-ann">
                {annChapters.map((ch) => (
                  <div key={ch}>
                    <CollapseHeading
                      label={chapterLabel(chapters, ch)}
                      count={byChapterAnn.get(ch)!.length}
                      isCollapsed={collapsed.has(`ann-ch-${ch}`)}
                      onToggle={() => toggleCollapse(`ann-ch-${ch}`)}
                      level={3}
                      controlsId={`collapse-ann-ch-${ch}`}
                    />
                    {!collapsed.has(`ann-ch-${ch}`) && (
                      <ul role="list" id={`collapse-ann-ch-${ch}`} aria-label="Annotations" className="pl-2 list-none p-0 m-0">
                        {byChapterAnn.get(ch)!.map(renderAnnotation)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Insights */}
        {insCount > 0 && (
          <section aria-label="AI Insights">
            <CollapseHeading
              label="AI Insights"
              count={insCount}
              isCollapsed={collapsed.has("insights")}
              onToggle={() => toggleCollapse("insights")}
              controlsId="collapse-insights"
            />
            {!collapsed.has("insights") && (
              <div id="collapse-insights">
                {bookLevelIns.length > 0 && (
                  <div>
                    <CollapseHeading
                      label="Book-level"
                      count={bookLevelIns.length}
                      isCollapsed={collapsed.has("ins-book")}
                      onToggle={() => toggleCollapse("ins-book")}
                      level={3}
                      controlsId="collapse-ins-book"
                    />
                    {!collapsed.has("ins-book") && (
                      <ul role="list" id="collapse-ins-book" aria-label="Insights" className="pl-2 list-none p-0 m-0">
                        {bookLevelIns.map(renderInsight)}
                      </ul>
                    )}
                  </div>
                )}
                {insChapters.map((ch) => (
                  <div key={ch}>
                    <CollapseHeading
                      label={chapterLabel(chapters, ch)}
                      count={byChapterIns.get(ch)!.length}
                      isCollapsed={collapsed.has(`ins-ch-${ch}`)}
                      onToggle={() => toggleCollapse(`ins-ch-${ch}`)}
                      level={3}
                      controlsId={`collapse-ins-ch-${ch}`}
                    />
                    {!collapsed.has(`ins-ch-${ch}`) && (
                      <ul role="list" id={`collapse-ins-ch-${ch}`} aria-label="Insights" className="pl-2 list-none p-0 m-0">
                        {byChapterIns.get(ch)!.map(renderInsight)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Vocabulary */}
        {vocCount > 0 && (
          <section aria-label="Vocabulary">
            <CollapseHeading
              label="Vocabulary"
              count={vocCount}
              isCollapsed={collapsed.has("vocab")}
              onToggle={() => toggleCollapse("vocab")}
              controlsId="collapse-vocab"
            />
            {!collapsed.has("vocab") && (
              <ul role="list" id="collapse-vocab" className="my-2 ml-4 space-y-1 list-none">
                {bookVocab.map((v) =>
                  v.occurrences
                    .filter((o) => o.book_id === bookId)
                    .map((occ, i) => (
                      <VocabRow
                        key={`${v.word}-${i}`}
                        word={v.word}
                        occurrence={occ}
                        chapters={chapters}
                        bookLanguage={bookLanguage}
                      />
                    ))
                )}
              </ul>
            )}
          </section>
        )}
      </div>
    );
  }

  // ── Chapter view ──────────────────────────────────────────────────────────────
  function renderChapterView() {
    const chSet = new Set<number>();
    annotations.forEach((a) => chSet.add(a.chapter_index));
    insights.filter((i) => i.chapter_index !== null).forEach((i) => chSet.add(i.chapter_index as number));
    bookVocab.forEach((v) => v.occurrences.filter((o) => o.book_id === bookId).forEach((o) => chSet.add(o.chapter_index)));
    const sortedChapters = Array.from(chSet).sort((a, b) => a - b);
    const bookLevelIns = insights.filter((i) => i.chapter_index === null);

    return (
      <div>
        {sortedChapters.map((ch) => {
          const chAnns = annotations.filter((a) => a.chapter_index === ch);
          const chIns = insights.filter((i) => i.chapter_index === ch);
          const chVoc = bookVocab.filter((v) =>
            v.occurrences.some((o) => o.book_id === bookId && o.chapter_index === ch),
          );
          const total = chAnns.length + chIns.length + chVoc.length;
          const key = `ch-${ch}`;
          return (
            <section key={ch} aria-label={chapterLabel(chapters, ch)}>
              <CollapseHeading
                label={chapterLabel(chapters, ch)}
                count={total}
                isCollapsed={collapsed.has(key)}
                onToggle={() => toggleCollapse(key)}
                controlsId={`collapse-${key}`}
              />
              {!collapsed.has(key) && (
                <div id={`collapse-${key}`} className="pl-2 space-y-1">
                  {chAnns.length > 0 && (
                    <ul role="list" aria-label="Annotations" className="list-none p-0 m-0">
                      {chAnns.map(renderAnnotation)}
                    </ul>
                  )}
                  {chIns.length > 0 && (
                    <ul role="list" aria-label="Insights" className="list-none p-0 m-0">
                      {chIns.map(renderInsight)}
                    </ul>
                  )}
                  {chVoc.length > 0 && (
                    <ul role="list" className="mt-2 ml-4 space-y-1 list-none">
                      {chVoc.map((v) => {
                        const occ = v.occurrences.find((o) => o.book_id === bookId && o.chapter_index === ch);
                        return occ ? (
                          <VocabRow key={v.word} word={v.word} occurrence={occ} chapters={chapters} bookLanguage={bookLanguage} />
                        ) : null;
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {bookLevelIns.length > 0 && (
          <section aria-label="Book-level Insights">
            <CollapseHeading
              label="Book-level Insights"
              count={bookLevelIns.length}
              isCollapsed={collapsed.has("ch-book")}
              onToggle={() => toggleCollapse("ch-book")}
              controlsId="collapse-ch-book"
            />
            {!collapsed.has("ch-book") && (
              <ul role="list" id="collapse-ch-book" aria-label="Insights" className="pl-2 list-none p-0 m-0">
                {bookLevelIns.map(renderInsight)}
              </ul>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-parchment">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-amber-200 bg-white/80 backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          <Link
            href="/notes"
            className="text-amber-700 hover:text-amber-900 text-sm font-medium shrink-0 min-h-[44px] md:min-h-0 flex items-center rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline" aria-hidden="true" />Notes
          </Link>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-600 truncate" title={`${annCount} annotations · ${insCount} insights · ${vocCount} words`}>
              {annCount} annotations · {insCount} insights · {vocCount} words
            </p>
          </div>

          {/* Collapse all toggle */}
          {(annCount + insCount + vocCount) > 0 && !loading && (
            <button
              onClick={toggleCollapseAll}
              aria-expanded={!isAllCollapsed}
              className="text-xs text-stone-600 hover:text-stone-700 shrink-0 transition-colors min-h-[44px] md:min-h-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              {isAllCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}

          {/* View toggle */}
          <div className="flex rounded-lg border border-amber-200 overflow-hidden text-xs font-medium shrink-0">
            {(["section", "chapter"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                aria-pressed={viewMode === m}
                className={`px-3 py-1.5 min-h-[44px] md:min-h-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
                  viewMode === m
                    ? "bg-amber-700 text-white"
                    : "text-amber-700 hover:bg-amber-50"
                }`}
              >
                {m === "section" ? "By section" : "By chapter"}
              </button>
            ))}
          </div>

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
          >
            {exporting ? "Exporting…" : <><ArrowUpRightIcon className="w-3.5 h-3.5 inline" aria-hidden="true" /> Export</>}
          </button>
        </div>

        <div className="max-w-3xl mx-auto mt-2">
          <p
            role="status"
            aria-live="polite"
            aria-atomic="true"
            title={exportMsg || undefined}
            className={`text-xs px-3 py-1.5 rounded transition-all ${exportMsg ? "bg-amber-50 border border-amber-200 text-amber-800" : ""}`}
          >
            {exportMsg ?? ""}{exportUrl && (
              exportUrl.startsWith("http") ? (
                <> <a
                  href={exportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 rounded"
                  title={exportUrl}
                >{exportUrl}<span className="sr-only"> (opens in new tab)</span></a></>
              ) : (
                <> <span className="break-all">{exportUrl}</span></>
              )
            )}
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        {loading ? (
          <div role="status" aria-label="Loading notes" className="flex justify-center py-24">
            <span className="sr-only">Loading notes...</span>
            <span className="w-6 h-6 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" aria-hidden="true" />
          </div>
        ) : fetchError ? (
          <div role="alert" className="text-center text-stone-600 mt-20 flex flex-col items-center gap-2">
            <AlertCircleIcon className="w-12 h-12 text-red-300 mx-auto mb-1" aria-hidden="true" />
            <p className="font-serif text-lg text-red-700 mt-1">Failed to load notes.</p>
            <p className="text-sm">Check your connection and try again.</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium transition-colors min-h-[44px] md:min-h-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
            >
              <RetryIcon className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : annCount + insCount + vocCount === 0 ? (
          <div className="text-center py-24 text-stone-600">
            <EmptyNotesIcon className="w-16 h-16 mx-auto mb-3 text-amber-300" aria-hidden="true" />
            <p className="font-serif text-lg text-ink mb-1">No notes yet</p>
            <p className="text-sm">Annotate sentences, save AI insights, or add words to vocabulary while reading.</p>
            <Link
              href={`/reader/${bookId}`}
              className="mt-4 px-5 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-700"
            >
              Open reader <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div data-testid="notes-content">
            {meta && (
              <div className="mb-6">
                <h1 className="text-2xl font-serif font-bold text-ink">{meta.title}</h1>
                {(meta.authors ?? []).length > 0 && (
                  <p className="text-sm text-stone-600 italic mt-0.5">{meta.authors.join(", ")}</p>
                )}
              </div>
            )}
            {viewMode === "section" ? renderSectionView() : renderChapterView()}
          </div>
        )}
      </div>

      {deleteErrorMsg && (
        <div role="alert" aria-live="assertive" className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shadow-md">
          {deleteErrorMsg}
        </div>
      )}

      {deletedAnnToast && (
        <UndoToast
          message="Annotation deleted"
          onUndo={() => {
            setAnnotations((prev) => [...prev, deletedAnnToast]);
            setDeletedAnnToast(null);
          }}
          onDone={() => {
            deleteAnnotation(deletedAnnToast.id).catch(() => {
              setDeleteErrorMsg("Could not delete annotation — please try again");
              setTimeout(() => setDeleteErrorMsg(null), 5000);
            });
            setDeletedAnnToast(null);
          }}
        />
      )}

      {deletedInsToast && (
        <UndoToast
          message="Insight deleted"
          onUndo={() => {
            setInsights((prev) => [...prev, deletedInsToast]);
            setDeletedInsToast(null);
          }}
          onDone={() => {
            deleteInsight(deletedInsToast.id).catch(() => {
              setDeleteErrorMsg("Could not delete insight — please try again");
              setTimeout(() => setDeleteErrorMsg(null), 5000);
            });
            setDeletedInsToast(null);
          }}
        />
      )}
    </main>
  );
}
