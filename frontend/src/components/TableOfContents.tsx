"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon } from "./Icons";

/** Chapters past this count get a filter box — below it, scanning is faster. */
const FILTER_THRESHOLD = 20;

export interface TocChapter {
  title: string;
}

/**
 * A run of rows the panel draws together.
 *
 * `front` is publisher apparatus — collapsed by default, because it is not the
 * reading path. `part` is an act or part of the work — expanded by default, for
 * the opposite reason: collapsing them by default would hide the book. `loose`
 * has no header at all and renders at top level, for a chapter belonging to no
 * part (Crime and Punishment's epilogue, or any book without parts).
 */
type Section =
  | { kind: "front"; label: string; indices: number[] }
  | { kind: "part"; label: string; indices: number[] }
  | { kind: "loose"; indices: number[] };

interface Props {
  chapters: TocChapter[];
  chapterIndex: number;
  onSelect: (index: number) => void;
  /**
   * Indices with a translation in the reader's target language. Optional:
   * omitted until the API exposes per-chapter coverage, and the row simply
   * says nothing about translation rather than guessing.
   */
  translated?: Set<number>;
  /**
   * Per-chapter role from the fossilized artifact (#2745). Only "frontmatter"
   * is meaningful today; chapters without an entry are body text. Optional for
   * the same reason as `translated` — absent means no front-matter group.
   */
  roles?: Record<number, string>;
  /**
   * Per-chapter part label, verbatim from the source (#2745 Phase 2). Absent
   * means the book has no declared parts and renders flat, which is the case
   * for sixteen of the twenty frozen books.
   */
  parts?: Record<number, string>;
}

export default function TableOfContents({
  chapters,
  chapterIndex,
  onSelect,
  translated,
  roles,
  parts,
}: Props) {
  const [query, setQuery] = useState("");
  const currentRef = useRef<HTMLButtonElement | null>(null);

  const frontMatter = useMemo(
    () =>
      new Set(
        Object.entries(roles ?? {})
          .filter(([, role]) => role === "frontmatter")
          .map(([index]) => Number(index))
      ),
    [roles]
  );

  // Front matter first, then the body in reading order, with consecutive
  // same-part chapters gathered into one section. A part label change starts a
  // new section, so a label reused later in the book gets its own group rather
  // than being merged across the chapters between.
  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    const front = [...frontMatter].sort((a, b) => a - b);
    if (front.length) out.push({ kind: "front", label: "Front matter", indices: front });

    let current: Section | null = null;
    chapters.forEach((_, index) => {
      if (frontMatter.has(index)) return;
      const label = parts?.[index];
      // Compared against a literal in each arm so the union narrows — testing
      // `current.kind === kind` against a variable does not.
      const continues =
        current !== null &&
        (label
          ? current.kind === "part" && current.label === label
          : current.kind === "loose");
      if (!continues) {
        current = label
          ? { kind: "part", label, indices: [] }
          : { kind: "loose", indices: [] };
        out.push(current);
      }
      (current as Section).indices.push(index);
    });
    return out;
  }, [chapters, frontMatter, parts]);

  // Collapse is opt-in per section: front matter starts closed, parts open.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const toggle = (label: string, openByDefault: boolean) =>
    setOpened((prev) => ({ ...prev, [label]: !(prev[label] ?? openByDefault) }));

  // Bring the current chapter into view when the panel mounts, so a reader
  // 120 chapters deep isn't dropped at the top of the list.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const label = (index: number) =>
    chapters[index]?.title?.trim() || `Section ${index + 1}`;

  const matches = (index: number) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return label(index).toLowerCase().includes(q) || String(index + 1).startsWith(q);
  };

  // A section survives the filter if any of its rows do; a header whose
  // children all fail disappears with them.
  const visible = sections
    .map((section) => ({ section, indices: section.indices.filter(matches) }))
    .filter(({ indices }) => indices.length > 0);

  const showFilter = chapters.length > FILTER_THRESHOLD;
  const nothingMatched = visible.length === 0;

  function row(index: number, isFront: boolean) {
    const isCurrent = index === chapterIndex;
    const title = label(index);
    const coverage =
      translated === undefined
        ? ""
        : translated.has(index)
        ? ". Translated"
        : ". Not translated";

    return (
      <button
        key={index}
        ref={isCurrent ? currentRef : undefined}
        type="button"
        onClick={() => onSelect(index)}
        title={title}
        aria-current={isCurrent ? "true" : undefined}
        aria-label={`${index + 1}. ${title}${coverage}`}
        className={`w-full flex items-baseline gap-2 px-2 py-1 min-h-[44px] md:min-h-0 text-left border-l-2 rounded-r-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-inset ${
          isCurrent
            ? "border-amber-700 bg-amber-50"
            : "border-transparent hover:bg-amber-50/60"
        }`}
      >
        <span
          aria-hidden="true"
          className={`text-[10px] tabular-nums shrink-0 min-w-[1.3rem] ${
            isCurrent ? "text-amber-700" : "text-stone-400"
          }`}
        >
          {index + 1}
        </span>
        <span
          aria-hidden="true"
          className={`flex-1 min-w-0 break-words text-xs leading-relaxed ${
            isCurrent
              ? "font-semibold text-ink"
              : isFront
              ? "italic text-stone-400"
              : "text-stone-600"
          }`}
        >
          {title}
        </span>
        {translated !== undefined && (
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full shrink-0 self-center border border-amber-700 ${
              translated.has(index) ? "bg-amber-700" : ""
            }`}
          />
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {showFilter && (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter chapters…"
            aria-label="Filter chapters"
            className="w-full text-xs rounded-lg border border-amber-200 bg-parchment px-2.5 py-2 min-h-[44px] md:min-h-0 text-ink placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition-colors"
          />
        </div>
      )}

      <nav
        aria-label="Table of contents"
        className="flex-1 min-h-0 overflow-y-auto px-1.5 pb-3"
      >
        {visible.map(({ section, indices }, position) => {
          if (section.kind === "loose") {
            return (
              <div key={`loose-${position}`}>{indices.map((i) => row(i, false))}</div>
            );
          }

          const isFront = section.kind === "front";
          // Never hide where the reader is: a section holding the current
          // chapter is open regardless of how it was left.
          const holdsCurrent = section.indices.includes(chapterIndex);
          const open = (opened[section.label] ?? !isFront) || holdsCurrent;

          return (
            <div key={`${section.kind}-${section.label}-${position}`}>
              <button
                type="button"
                onClick={() => toggle(section.label, !isFront)}
                aria-expanded={open}
                className="w-full flex items-center gap-1.5 px-2 pt-2 pb-1 min-h-[44px] md:min-h-0 text-left text-[10px] uppercase tracking-wider font-semibold text-stone-400 hover:text-amber-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block w-1.5 h-1.5 border-r-[1.5px] border-b-[1.5px] border-current transition-transform duration-200 ${
                    open ? "rotate-45" : "-rotate-45"
                  }`}
                />
                {section.label}
                <span aria-hidden="true" className="flex-1 h-px bg-amber-100" />
              </button>
              {open && indices.map((i) => row(i, isFront))}
            </div>
          );
        })}

        {nothingMatched && (
          <div className="px-4 py-10 text-center">
            <SearchIcon className="w-6 h-6 mx-auto mb-2 text-stone-300" />
            <p className="font-serif text-[13px] text-stone-500 mb-1">
              No chapter matches that
            </p>
            <p className="text-[11px] text-stone-400">Try a number, or part of a title.</p>
          </div>
        )}
      </nav>
    </div>
  );
}
