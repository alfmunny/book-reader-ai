"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getAnnotations,
  getInsights,
  getVocabulary,
  getBookChapters,
  deleteAnnotation,
  deleteInsight,
  exportVocabularyToObsidian,
  Annotation,
  BookInsight,
  VocabularyWord,
  BookChapter,
  BookMeta,
} from "@/lib/api";

type ViewMode = "section" | "chapter";

// ── Markdown generation ────────────────────────────────────────────────────────

function chapterLabel(chapters: BookChapter[], idx: number): string {
  const t = chapters[idx]?.title?.trim();
  return t && t.toLowerCase() !== `chapter ${idx + 1}` ? t : `Chapter ${idx + 1}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildMarkdown(
  mode: ViewMode,
  meta: BookMeta,
  chapters: BookChapter[],
  annotations: Annotation[],
  insights: BookInsight[],
  vocab: VocabularyWord[],
  bookId: number,
): string {
  const title = meta.title;
  const author = (meta.authors ?? []).join(", ");
  const lines: string[] = [];

  lines.push(`# ${title}`);
  if (author) lines.push(`*${author}*`);
  lines.push("");

  const bookVocab = vocab.filter((v) => v.occurrences.some((o) => o.book_id === bookId));

  if (mode === "section") {
    // ── Annotations ──────────────────────────────────────────────────────────
    if (annotations.length > 0) {
      lines.push("## Annotations");
      lines.push("");
      const byChapter = groupByChapterIdx(annotations, (a) => a.chapter_index);
      for (const [ch, anns] of sortedEntries(byChapter)) {
        lines.push(`### ${chapterLabel(chapters, ch)}`);
        lines.push("");
        for (const a of anns) {
          lines.push(`> "${a.sentence_text}"`);
          lines.push("");
          if (a.note_text) { lines.push(a.note_text); lines.push(""); }
        }
      }
    }

    // ── Insights ─────────────────────────────────────────────────────────────
    if (insights.length > 0) {
      lines.push("## AI Insights");
      lines.push("");
      const bookLevel = insights.filter((i) => i.chapter_index === null);
      const byChapter = groupByChapterIdx(
        insights.filter((i) => i.chapter_index !== null),
        (i) => i.chapter_index as number,
      );
      if (bookLevel.length > 0) {
        lines.push("### Book-level");
        lines.push("");
        for (const i of bookLevel) {
          lines.push(`**Q:** ${i.question}`);
          lines.push(`**A:** ${i.answer}`);
          lines.push("");
        }
      }
      for (const [ch, ins] of sortedEntries(byChapter)) {
        lines.push(`### ${chapterLabel(chapters, ch)}`);
        lines.push("");
        for (const i of ins) {
          lines.push(`**Q:** ${i.question}`);
          lines.push(`**A:** ${i.answer}`);
          lines.push("");
        }
      }
    }

    // ── Vocabulary ────────────────────────────────────────────────────────────
    if (bookVocab.length > 0) {
      lines.push("## Vocabulary");
      lines.push("");
      for (const v of bookVocab) {
        const occs = v.occurrences.filter((o) => o.book_id === bookId);
        for (const o of occs) {
          const ch = chapterLabel(chapters, o.chapter_index);
          lines.push(`- **${v.word}** *(${ch})* — "${truncate(o.sentence_text, 90)}"`);
        }
      }
      lines.push("");
    }
  } else {
    // ── Chapter view ──────────────────────────────────────────────────────────
    const chSet = new Set<number>();
    annotations.forEach((a) => chSet.add(a.chapter_index));
    insights.filter((i) => i.chapter_index !== null).forEach((i) => chSet.add(i.chapter_index as number));
    bookVocab.forEach((v) => v.occurrences.filter((o) => o.book_id === bookId).forEach((o) => chSet.add(o.chapter_index)));

    const sortedChapters = Array.from(chSet).sort((a, b) => a - b);
    const bookLevelInsights = insights.filter((i) => i.chapter_index === null);

    for (const ch of sortedChapters) {
      lines.push(`## ${chapterLabel(chapters, ch)}`);
      lines.push("");

      const chAnns = annotations.filter((a) => a.chapter_index === ch);
      for (const a of chAnns) {
        lines.push(`> "${a.sentence_text}"`);
        lines.push("");
        if (a.note_text) { lines.push(a.note_text); lines.push(""); }
      }

      const chIns = insights.filter((i) => i.chapter_index === ch);
      for (const i of chIns) {
        lines.push(`**Q:** ${i.question}`);
        lines.push(`**A:** ${i.answer}`);
        lines.push("");
      }

      const chVoc = bookVocab.filter((v) =>
        v.occurrences.some((o) => o.book_id === bookId && o.chapter_index === ch),
      );
      if (chVoc.length > 0) {
        lines.push("**Words:**");
        for (const v of chVoc) {
          const occ = v.occurrences.find((o) => o.book_id === bookId && o.chapter_index === ch);
          if (occ) lines.push(`- **${v.word}** — "${truncate(occ.sentence_text, 70)}"`);
        }
        lines.push("");
      }
    }

    if (bookLevelInsights.length > 0) {
      lines.push("## Book-level Insights");
      lines.push("");
      for (const i of bookLevelInsights) {
        lines.push(`**Q:** ${i.question}`);
        lines.push(`**A:** ${i.answer}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function groupByChapterIdx<T>(items: T[], getIdx: (t: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const k = getIdx(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

function sortedEntries<T>(map: Map<number, T[]>): [number, T[]][] {
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

// ── Markdown components ────────────────────────────────────────────────────────

const mdComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-2xl font-serif font-bold text-ink mt-2 mb-1">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-lg font-serif font-semibold text-ink mt-8 mb-3 pb-1.5 border-b border-amber-200">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide mt-6 mb-2">
      {children}
    </h3>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-amber-300 pl-4 my-3 italic text-stone-600 leading-relaxed">
      {children}
    </blockquote>
  ),
  p: ({ children }: any) => (
    <p className="my-2 text-ink leading-relaxed text-sm">{children}</p>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-stone-500">{children}</em>
  ),
  ul: ({ children }: any) => (
    <ul className="my-2 ml-4 space-y-1 list-none">{children}</ul>
  ),
  li: ({ children }: any) => (
    <li className="text-ink text-sm leading-relaxed flex gap-2 before:content-['·'] before:text-amber-400 before:font-bold">
      <span>{children}</span>
    </li>
  ),
  hr: () => <hr className="my-8 border-amber-100" />,
};

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
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const markdown = useMemo(() => {
    if (!meta) return "";
    return buildMarkdown(viewMode, meta, chapters, annotations, insights, vocab, bookId);
  }, [viewMode, meta, chapters, annotations, insights, vocab, bookId]);

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
  const vocCount = vocab.filter((v) => v.occurrences.some((o) => o.book_id === bookId)).length;

  return (
    <main className="min-h-screen bg-parchment">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 border-b border-amber-200 bg-white/80 backdrop-blur px-4 md:px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/notes")}
            className="text-amber-700 hover:text-amber-900 text-sm font-medium shrink-0"
          >
            ← Notes
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-400 truncate">
              {annCount} annotations · {insCount} insights · {vocCount} words
            </p>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-amber-200 overflow-hidden text-xs font-medium shrink-0">
            {(["section", "chapter"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 transition-colors ${
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
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-medium hover:bg-amber-800 disabled:opacity-50 transition-colors"
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
            <p className="text-4xl mb-3">📒</p>
            <p className="font-serif text-lg text-ink mb-1">No notes yet</p>
            <p className="text-sm">Annotate sentences, save AI insights, or add words to vocabulary while reading.</p>
            <button
              onClick={() => router.push(`/reader/${bookId}`)}
              className="mt-4 px-5 py-2 rounded-lg bg-amber-700 text-white text-sm font-medium hover:bg-amber-800"
            >
              Open reader →
            </button>
          </div>
        ) : (
          <div data-testid="notes-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </main>
  );
}
