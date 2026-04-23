"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { ArrowLeftIcon, TrashIcon, EditIcon, ChevronRightIcon, ChevronDownIcon, ArrowRightIcon, RetryIcon, EmptyNotesIcon } from "@/components/Icons";

type ViewMode = "section" | "chapter";

// ── Sub-components ─────────────────────────────────────────────────────────────

function CollapseHeading({
  label,
  count,
  isCollapsed,
  onToggle,
  level = 2,
}: {
  label: string;
  count?: number;
  isCollapsed: boolean;
  onToggle: () => void;
  level?: 2 | 3;
}) {
  const Tag = `h${level}` as "h2" | "h3";
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 text-left group ${
        level === 2
          ? "mt-8 mb-3 pb-1.5 border-b border-amber-200"
          : "mt-5 mb-2"
      }`}
    >
      {isCollapsed ? <ChevronRightIcon className="w-3 h-3 text-amber-400 shrink-0" /> : <ChevronDownIcon className="w-3 h-3 text-amber-400 shrink-0" />}
      <Tag className={level === 2
        ? "text-lg font-serif font-semibold text-ink group-hover:text-amber-800 transition-colors"
        : "text-sm font-semibold text-amber-800 uppercase tracking-wide group-hover:text-amber-900 transition-colors"
      }>
        {label}
      </Tag>
      {count !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-700 font-sans ml-1 shrink-0">
          {count}
        </span>
      )}
    </button>
  );
}

function AnnotationCard({
  ann,
  chapters,
  bookId,
  isEditing,
  editNote,
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
  isEditing: boolean;
  editNote: string;
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
      <p className="italic text-stone-600 leading-relaxed text-sm">
        &ldquo;{ann.sentence_text}&rdquo;
      </p>

      {isEditing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={editNote}
            onChange={(e) => onEditChange(e.target.value)}
            className="w-full text-sm border border-amber-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="px-3 py-1 text-xs bg-amber-700 text-white rounded-lg hover:bg-amber-800 transition-colors min-h-[44px]"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1 text-xs text-stone-500 hover:text-stone-700 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
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
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline transition-colors"
          >
            <ArrowRightIcon className="w-3 h-3 shrink-0" /> {chapterLabel(chapters, ann.chapter_index)}
          </a>
          <button
            onClick={onEdit}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1 min-h-[44px] flex items-center justify-center"
            title="Edit note"
            aria-label="Edit note"
          >
            <EditIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors p-1 min-h-[44px] flex items-center justify-center"
            title="Delete annotation"
            aria-label="Delete annotation"
          >
            {isDeleting ? <RetryIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
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
}: {
  ins: BookInsight;
  chapters: BookChapter[];
  bookId: number;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const readerHref = ins.chapter_index !== null
    ? `/reader/${bookId}?chapter=${ins.chapter_index}${ins.context_text ? `&sentence=${encodeURIComponent(ins.context_text)}` : ""}`
    : null;

  return (
    <div className="my-3 space-y-1.5">
      {ins.context_text && (
        <blockquote className="border-l-4 border-amber-200 pl-4 italic text-stone-500 text-sm leading-relaxed">
          &ldquo;{truncate(ins.context_text, 200)}&rdquo;
        </blockquote>
      )}
      <p className="text-sm text-ink">
        <span className="font-semibold">Q:</span> {ins.question}
      </p>
      <p className="text-sm text-ink leading-relaxed">{ins.answer}</p>
      <div className="flex items-center gap-3 pt-0.5">
        {readerHref && (
          <a
            href={readerHref}
            className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 hover:underline transition-colors"
          >
            <ArrowRightIcon className="w-3 h-3 shrink-0" /> {chapterLabel(chapters, ins.chapter_index as number)}
          </a>
        )}
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="text-red-400 hover:text-red-600 disabled:opacity-40 transition-colors"
          title="Delete insight"
          aria-label="Delete insight"
        >
          {isDeleting ? <RetryIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function VocabRow({
  word,
  occurrence,
  chapters,
}: {
  word: string;
  occurrence: { book_id: number; chapter_index: number; sentence_text: string };
  chapters: BookChapter[];
}) {
  const readerHref = `/reader/${occurrence.book_id}?chapter=${occurrence.chapter_index}&sentence=${encodeURIComponent(occurrence.sentence_text)}&word=${encodeURIComponent(word)}`;
  return (
    <li className="flex gap-2 text-sm leading-relaxed before:content-['·'] before:text-amber-400 before:font-bold before:shrink-0">
      <span>
        <a
          href={`/vocabulary?word=${encodeURIComponent(word)}`}
          className="font-semibold text-amber-700 hover:text-amber-900 hover:underline"
        >
          {word}
        </a>{" "}
        <span className="text-stone-400 text-xs">({chapterLabel(chapters, occurrence.chapter_index)})</span>
        {" — "}
        <a
          href={readerHref}
          className="italic text-stone-600 hover:text-amber-700 hover:underline transition-colors"
        >
          &ldquo;{truncate(occurrence.sentence_text, 90)}&rdquo;
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

  // Collapse state
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  // Delete loading sets
  const [deletingAnns, setDeletingAnns] = useState<Set<number>>(new Set());
  const [deletingIns, setDeletingIns] = useState<Set<number>>(new Set());

  // Export
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const didScrollRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") { router.replace("/login"); return; }
    if (status !== "authenticated") return;
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
    }).catch(() => {})
      .finally(() => setLoading(false));
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
    setEditingId(ann.id);
    setEditNote(ann.note_text);
  }

  async function saveEdit() {
    if (editingId === null) return;
    try {
      const updated = await updateAnnotation(editingId, { note_text: editNote });
      setAnnotations((prev) => prev.map((a) => (a.id === editingId ? { ...a, note_text: updated.note_text } : a)));
      setEditingId(null);
    } catch { /* keep edit open on failure */ }
  }

  async function handleDeleteAnnotation(id: number) {
    if (!window.confirm("Delete this annotation?")) return;
    setDeletingAnns((prev) => new Set(prev).add(id));
    try {
      await deleteAnnotation(id);
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
    setDeletingAnns((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function handleDeleteInsight(id: number) {
    if (!window.confirm("Delete this insight?")) return;
    setDeletingIns((prev) => new Set(prev).add(id));
    try {
      await deleteInsight(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch { /* ignore */ }
    setDeletingIns((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { urls } = await exportVocabularyToObsidian(bookId);
      setExportMsg(urls[0] ? `Exported → ${urls[0]}` : "Exported successfully");
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 5000);
    }
  }

  const annCount = annotations.length;
  const insCount = insights.length;
  const vocCount = bookVocab.length;

  // Shared rendering helpers
  function renderAnnotation(ann: Annotation) {
    return (
      <AnnotationCard
        key={ann.id}
        ann={ann}
        chapters={chapters}
        bookId={bookId}
        isEditing={editingId === ann.id}
        editNote={editNote}
        onEdit={() => startEdit(ann)}
        onEditChange={setEditNote}
        onSave={saveEdit}
        onCancel={() => setEditingId(null)}
        onDelete={() => handleDeleteAnnotation(ann.id)}
        isDeleting={deletingAnns.has(ann.id)}
      />
    );
  }

  function renderInsight(ins: BookInsight) {
    return (
      <InsightCard
        key={ins.id}
        ins={ins}
        chapters={chapters}
        bookId={bookId}
        onDelete={() => handleDeleteInsight(ins.id)}
        isDeleting={deletingIns.has(ins.id)}
      />
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
          <section>
            <CollapseHeading
              label="Annotations"
              count={annCount}
              isCollapsed={collapsed.has("ann")}
              onToggle={() => toggleCollapse("ann")}
            />
            {!collapsed.has("ann") && (
              <div>
                {annChapters.map((ch) => (
                  <div key={ch}>
                    <CollapseHeading
                      label={chapterLabel(chapters, ch)}
                      count={byChapterAnn.get(ch)!.length}
                      isCollapsed={collapsed.has(`ann-ch-${ch}`)}
                      onToggle={() => toggleCollapse(`ann-ch-${ch}`)}
                      level={3}
                    />
                    {!collapsed.has(`ann-ch-${ch}`) && (
                      <div className="pl-2">
                        {byChapterAnn.get(ch)!.map(renderAnnotation)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Insights */}
        {insCount > 0 && (
          <section>
            <CollapseHeading
              label="AI Insights"
              count={insCount}
              isCollapsed={collapsed.has("insights")}
              onToggle={() => toggleCollapse("insights")}
            />
            {!collapsed.has("insights") && (
              <div>
                {bookLevelIns.length > 0 && (
                  <div>
                    <CollapseHeading
                      label="Book-level"
                      count={bookLevelIns.length}
                      isCollapsed={collapsed.has("ins-book")}
                      onToggle={() => toggleCollapse("ins-book")}
                      level={3}
                    />
                    {!collapsed.has("ins-book") && (
                      <div className="pl-2">{bookLevelIns.map(renderInsight)}</div>
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
                    />
                    {!collapsed.has(`ins-ch-${ch}`) && (
                      <div className="pl-2">
                        {byChapterIns.get(ch)!.map(renderInsight)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Vocabulary */}
        {vocCount > 0 && (
          <section>
            <CollapseHeading
              label="Vocabulary"
              count={vocCount}
              isCollapsed={collapsed.has("vocab")}
              onToggle={() => toggleCollapse("vocab")}
            />
            {!collapsed.has("vocab") && (
              <ul className="my-2 ml-4 space-y-1 list-none">
                {bookVocab.map((v) =>
                  v.occurrences
                    .filter((o) => o.book_id === bookId)
                    .map((occ, i) => (
                      <VocabRow
                        key={`${v.word}-${i}`}
                        word={v.word}
                        occurrence={occ}
                        chapters={chapters}
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
            <section key={ch}>
              <CollapseHeading
                label={chapterLabel(chapters, ch)}
                count={total}
                isCollapsed={collapsed.has(key)}
                onToggle={() => toggleCollapse(key)}
              />
              {!collapsed.has(key) && (
                <div className="pl-2 space-y-1">
                  {chAnns.map(renderAnnotation)}
                  {chIns.map(renderInsight)}
                  {chVoc.length > 0 && (
                    <ul className="mt-2 ml-4 space-y-1 list-none">
                      {chVoc.map((v) => {
                        const occ = v.occurrences.find((o) => o.book_id === bookId && o.chapter_index === ch);
                        return occ ? (
                          <VocabRow key={v.word} word={v.word} occurrence={occ} chapters={chapters} />
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
          <section>
            <CollapseHeading
              label="Book-level Insights"
              count={bookLevelIns.length}
              isCollapsed={collapsed.has("ch-book")}
              onToggle={() => toggleCollapse("ch-book")}
            />
            {!collapsed.has("ch-book") && (
              <div className="pl-2">{bookLevelIns.map(renderInsight)}</div>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-parchment">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-amber-200 bg-white/80 backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/notes")}
            className="text-amber-700 hover:text-amber-900 text-sm font-medium shrink-0"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5 mr-1 inline" aria-hidden="true" />Notes
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-400 truncate">
              {annCount} annotations · {insCount} insights · {vocCount} words
            </p>
          </div>

          {/* Collapse all toggle */}
          {(annCount + insCount + vocCount) > 0 && !loading && (
            <button
              onClick={toggleCollapseAll}
              className="text-xs text-stone-400 hover:text-stone-600 shrink-0 transition-colors min-h-[44px]"
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
                className={`px-3 py-1.5 min-h-[44px] transition-colors ${
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
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
          >
            {exporting ? "Exporting…" : "↗ Export"}
          </button>
        </div>

        {exportMsg && (
          <div className="max-w-3xl mx-auto mt-2">
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 truncate">
              {exportMsg}
            </p>
          </div>
        )}
      </header>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
        {loading ? (
          <div className="flex justify-center py-24">
            <span className="w-6 h-6 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
          </div>
        ) : annCount + insCount + vocCount === 0 ? (
          <div className="text-center py-24 text-stone-400">
            <EmptyNotesIcon className="w-16 h-16 mx-auto mb-3 text-amber-300" aria-hidden="true" />
            <p className="font-serif text-lg text-ink mb-1">No notes yet</p>
            <p className="text-sm">Annotate sentences, save AI insights, or add words to vocabulary while reading.</p>
            <button
              onClick={() => router.push(`/reader/${bookId}`)}
              className="mt-4 px-5 py-2 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800 inline-flex items-center gap-1"
            >
              Open reader <ArrowRightIcon className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div data-testid="notes-content">
            {meta && (
              <div className="mb-6">
                <h1 className="text-2xl font-serif font-bold text-ink">{meta.title}</h1>
                {(meta.authors ?? []).length > 0 && (
                  <p className="text-sm text-stone-500 italic mt-0.5">{meta.authors.join(", ")}</p>
                )}
              </div>
            )}
            {viewMode === "section" ? renderSectionView() : renderChapterView()}
          </div>
        )}
      </div>
    </main>
  );
}
