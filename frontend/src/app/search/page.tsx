"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { SearchIcon } from "@/components/Icons";
import { InAppSearchResponse, InAppSearchResult, searchInAppContent } from "@/lib/api";

function SnippetHtml({ snippet }: { snippet: string }) {
  // Backend returns snippets containing only `<b>…</b>` wrappers; safe to render.
  // We strip any other angle brackets defensively before rendering.
  const clean = snippet.replace(/<(?!\/?b\b)[^>]*>/g, "");
  return (
    <span
      className="text-sm text-ink"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

function AnnotationCard({ r }: { r: Extract<InAppSearchResult, { type: "annotation" }> }) {
  const href = `/reader/${r.book_id}?chapter=${r.chapter_index}`;
  return (
    <Link
      href={href}
      className="block p-4 rounded-md border border-amber-200 bg-parchment hover:-translate-y-0.5 transition-all duration-200"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-serif text-base text-ink">{r.book_title || `Book #${r.book_id}`}</div>
        <div className="text-xs text-stone-500">Annotation · Ch.&nbsp;{r.chapter_index + 1}</div>
      </div>
      <SnippetHtml snippet={r.snippet} />
      {r.note_text ? (
        <div className="mt-2 text-xs text-stone-600 italic">{r.note_text}</div>
      ) : null}
    </Link>
  );
}

function VocabularyCard({ r }: { r: Extract<InAppSearchResult, { type: "vocabulary" }> }) {
  const href = `/vocabulary`;
  return (
    <Link
      href={href}
      className="block p-4 rounded-md border border-amber-200 bg-parchment hover:-translate-y-0.5 transition-all duration-200"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-serif text-base text-ink">{r.word}</div>
        <div className="text-xs text-stone-500">Vocabulary · Ch.&nbsp;{r.chapter_index + 1}</div>
      </div>
      <SnippetHtml snippet={r.snippet} />
      <div className="mt-2 text-xs text-stone-600">in {r.book_title || `Book #${r.book_id}`}</div>
    </Link>
  );
}

function ChapterCard({ r }: { r: Extract<InAppSearchResult, { type: "chapter" }> }) {
  const href = `/reader/${r.book_id}?chapter=${r.chapter_index}`;
  return (
    <Link
      href={href}
      className="block p-4 rounded-md border border-amber-200 bg-parchment hover:-translate-y-0.5 transition-all duration-200"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="font-serif text-base text-ink">
          {r.book_title || `Book #${r.book_id}`} — {r.chapter_title || `Chapter ${r.chapter_index + 1}`}
        </div>
        <div className="text-xs text-stone-500">Chapter</div>
      </div>
      <SnippetHtml snippet={r.snippet} />
    </Link>
  );
}

function ResultCard({ r }: { r: InAppSearchResult }) {
  if (r.type === "annotation") return <AnnotationCard r={r} />;
  if (r.type === "vocabulary") return <VocabularyCard r={r} />;
  return <ChapterCard r={r} />;
}

function ResultsSection({ title, items }: { title: string; items: InAppSearchResult[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wide text-stone-500">
        {title} · {items.length}
      </h2>
      <div className="grid gap-3">
        {items.map((r, i) => (
          <ResultCard key={`${r.type}-${i}`} r={r} />
        ))}
      </div>
    </section>
  );
}

function SearchResultsInner() {
  const params = useSearchParams();
  const q = params?.get("q") ?? "";
  const [data, setData] = useState<InAppSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    searchInAppContent(q)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message ?? "Search failed");
        setLoading(false);
      });
  }, [q]);

  if (!q.trim()) {
    return (
      <div className="text-center text-stone-500 py-16">
        <SearchIcon className="w-10 h-10 mx-auto mb-2 text-stone-400" />
        <p className="font-serif text-lg text-ink">Search your notes, vocabulary, and uploads</p>
        <p className="text-sm mt-2">Start typing in the search bar.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="text-sm text-stone-500 py-8">Searching…</div>;
  }
  if (error) {
    return <div className="text-sm text-red-700 py-8">Error: {error}</div>;
  }
  if (!data || data.total === 0) {
    return (
      <div className="text-center text-stone-500 py-12">
        <p className="font-serif text-lg text-ink">No matches for “{q}”.</p>
        <p className="text-sm mt-2">Try a shorter or different word.</p>
      </div>
    );
  }

  const annotations = data.results.filter((r): r is Extract<InAppSearchResult, { type: "annotation" }> => r.type === "annotation");
  const vocabulary = data.results.filter((r): r is Extract<InAppSearchResult, { type: "vocabulary" }> => r.type === "vocabulary");
  const chapters = data.results.filter((r): r is Extract<InAppSearchResult, { type: "chapter" }> => r.type === "chapter");

  return (
    <div className="space-y-10">
      <ResultsSection title="Annotations" items={annotations} />
      <ResultsSection title="Vocabulary" items={vocabulary} />
      <ResultsSection title="Chapters" items={chapters} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8">
      <h1 className="font-serif text-2xl text-ink mb-6">Search</h1>
      <Suspense fallback={<div className="text-sm text-stone-500 py-8">Loading…</div>}>
        <SearchResultsInner />
      </Suspense>
    </main>
  );
}
