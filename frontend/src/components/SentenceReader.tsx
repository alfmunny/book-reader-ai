"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Annotation, WordBoundary } from "@/lib/api";

// ── Text parsing ────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  flatIdx: number;
  startTime: number;  // estimated, seconds
  chunkIdx: number;   // which chunk this segment belongs to (-1 if no chunks given)
}

interface Paragraph {
  segments: Segment[];
  isVerse: boolean;      // true = poetry (newlines between lines), false = prose
}

/** Optional chunk metadata for accurate timing + per-chunk visual coloring. */
export interface ChunkInfo {
  text: string;
  duration: number;  // 0 if not yet loaded; positive once the chunk's audio loads
  wordBoundaries?: WordBoundary[];
}

// Common abbreviations that should not trigger a sentence split
const ABBREV = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Rev|Gen|Sgt|Cpl|Pvt|Capt|Lt|Col|Gov|Pres|St|Mt|vs|etc|no|vol|pp|ed|trans|approx|dept|corp|ltd|inc|co)\b|(?:\b[A-Z]\.)+)\.?\s*$/i;

/**
 * Split prose text into sentences.
 * Strategy: split on punctuation+space+uppercase, then merge back fragments
 * that ended with a known abbreviation or single-letter initial.
 */
function splitSentences(text: string): string[] {
  // Split at: .!? (optionally followed by closing quote) + whitespace + uppercase
  const parts = text.split(/(?<=[.!?]['""\u2019\u201D]?)\s+(?=[A-Z\u00C0-\u00DC\u0400-\u042F])/);

  const result: string[] = [];
  let pending = "";

  for (const part of parts) {
    if (!pending) {
      pending = part;
      continue;
    }
    // If the pending fragment ended with an abbreviation, rejoin
    if (ABBREV.test(pending)) {
      pending = pending + " " + part;
    } else {
      result.push(pending);
      pending = part;
    }
  }
  if (pending) result.push(pending);

  return result.map((s) => s.trim()).filter(Boolean);
}

/**
 * Decide whether a set of lines is real verse/poetry or just soft-wrapped prose.
 * Gutenberg wraps prose at ~70 chars per line, leaving one long line + a short tail.
 * If ANY line is longer than 60 chars it's almost certainly a prose line-wrap, not verse.
 */
function isVerse(lines: string[]): boolean {
  // Use median line length so a single long stage direction doesn't force
  // an entire verse stanza to be classified as prose and joined with spaces.
  const lengths = [...lines].map((l) => l.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  return median <= 60;
}

function parseIntoSegments(
  text: string,
  duration: number,
  chunks?: ChunkInfo[],
): Paragraph[] {
  // Step 1: collect all segment texts and classify paragraphs
  const rawParas = text.split(/\n\n+/);
  const paraData: { texts: string[]; isVerse: boolean }[] = [];
  const allTexts: string[] = [];

  for (const raw of rawParas) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    if (trimmed.includes("\n")) {
      const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
      if (isVerse(lines)) {
        paraData.push({ texts: lines, isVerse: true });
        allTexts.push(...lines);
      } else {
        const joined = lines.join(" ");
        const sents = splitSentences(joined);
        paraData.push({ texts: sents, isVerse: false });
        allTexts.push(...sents);
      }
    } else {
      const sents = splitSentences(trimmed);
      paraData.push({ texts: sents, isVerse: false });
      allTexts.push(...sents);
    }
  }

  // Step 2a: figure out which chunk each segment belongs to (when chunks present)
  // Walk both lists in chapter order. Sentences longer than a single chunk
  // (>400 chars) are assigned to the chunk where they start via prefix matching.
  const segmentChunkIdx: number[] = new Array(allTexts.length).fill(-1);
  if (chunks && chunks.length > 0) {
    let chunkIdx = 0;
    let cursor = 0;            // index into the current chunk's text
    for (let s = 0; s < allTexts.length; s++) {
      const seg = allTexts[s];
      // Snapshot the search position before we try matching this segment.
      // If all matching attempts fail (chunkIdx reaches chunks.length), we
      // restore to the snapshot so subsequent segments are not blocked by the
      // cascade (chunkIdx stuck at chunks.length → all remaining segs = -1).
      const snapChunkIdx = chunkIdx;
      const snapCursor = cursor;

      // Find this segment within the remaining chunk text
      while (chunkIdx < chunks.length) {
        const chunkText = chunks[chunkIdx].text.replace(/\r?\n/g, " ");
        const pos = chunkText.indexOf(seg, cursor);
        if (pos >= 0) {
          segmentChunkIdx[s] = chunkIdx;
          cursor = pos + seg.length;
          break;
        }
        // Full match failed — for sentences longer than the chunk size the full
        // string won't fit in any single chunk. Try matching a prefix (first 50
        // chars) to detect "sentence starts here but overflows into the next chunk".
        const PREFIX_LEN = 50;
        const prefix = seg.slice(0, PREFIX_LEN);
        if (prefix.length === PREFIX_LEN) {
          const prefixPos = chunkText.indexOf(prefix, cursor);
          if (prefixPos >= 0) {
            // Sentence starts in this chunk; assign it here and consume the rest
            // of the chunk so the next sentence searches from the next chunk.
            segmentChunkIdx[s] = chunkIdx;
            cursor = chunkText.length;
            break;
          }
        }
        // Normalized whitespace fallback — handles mismatches from line-joining
        // (e.g. trailing spaces before \n become extra spaces after replace).
        const normSeg = seg.replace(/\s+/g, " ").trim();
        const normChunkSlice = chunkText.slice(cursor).replace(/\s+/g, " ");
        const normPos = normChunkSlice.indexOf(normSeg);
        if (normPos >= 0) {
          segmentChunkIdx[s] = chunkIdx;
          // cursor approximation: normPos is in the normalized string, so this
          // slightly underestimates the real end, but never overshoots (safe).
          cursor = Math.min(cursor + normPos + normSeg.length, chunkText.length);
          break;
        }
        // Not in this chunk — move to the next
        chunkIdx++;
        cursor = 0;
      }

      // Cascade guard: if we exhausted all chunks without a match, restore the
      // snapshot so the next segment can continue searching from where we were.
      // Assign this segment to the snapshot chunk (best-effort; likely the chunk
      // where it starts or the immediately preceding chunk).
      if (chunkIdx >= chunks.length && segmentChunkIdx[s] === -1) {
        segmentChunkIdx[s] = snapChunkIdx;
        chunkIdx = snapChunkIdx;
        cursor = snapCursor;
      }
    }
  }

  // Step 2b: build time map.
  // Three paths (in order of accuracy):
  //   a) chunks with word boundaries → exact timing from TTS engine (offset_ms per word)
  //   b) chunks without word boundaries → character-count proportional per chunk
  //   c) no chunks → character-count linear fallback (LibriVox audiobook path)
  const charCounts = allTexts.map((s) => Math.max(1, s.trim().length));
  const startTimes: number[] = new Array(allTexts.length).fill(0);

  if (chunks && chunks.length > 0) {
    let chunkStartTime = 0;
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const segIndices: number[] = [];
      for (let s = 0; s < allTexts.length; s++) {
        if (segmentChunkIdx[s] === ci) segIndices.push(s);
      }

      if (chunk.duration === 0) {
        // Not yet loaded — Infinity prevents these segments from ever matching
        // currentTime prematurely. Recalculated once the chunk loads.
        for (const idx of segIndices) startTimes[idx] = Infinity;
        continue; // chunkStartTime stays unchanged until we know the real duration
      }

      const wbs = chunk.wordBoundaries;
      if (wbs && wbs.length > 0) {
        // Path a: locate each segment's start position in the (newline-normalised)
        // chunk text, count preceding words, and map to the corresponding word
        // boundary's offset_ms for exact TTS timing.
        const normalised = chunk.text.replace(/\r?\n/g, " ");
        let cursor = 0;
        for (const idx of segIndices) {
          const seg = allTexts[idx];
          const pos = normalised.indexOf(seg, cursor);
          if (pos >= 0) {
            const wordsBefore =
              pos === 0 ? 0 : normalised.slice(0, pos).trim().split(/\s+/).length;
            const wb = wbs[Math.min(wordsBefore, wbs.length - 1)];
            startTimes[idx] = chunkStartTime + wb.offset_ms / 1000;
            cursor = pos + seg.length;
          } else {
            startTimes[idx] = chunkStartTime;
          }
        }
      } else {
        // Path b: character-count proportional distribution within chunk
        const chunkChars = segIndices.reduce((sum, idx) => sum + charCounts[idx], 0) || 1;
        let elapsed = 0;
        for (const idx of segIndices) {
          startTimes[idx] = chunkStartTime + (elapsed / chunkChars) * chunk.duration;
          elapsed += charCounts[idx];
        }
      }

      chunkStartTime += chunk.duration;
    }
    // Segments that couldn't be matched to any chunk (segmentChunkIdx === -1) keep
    // startTime = 0, which would make them spuriously match currentTime > 0. Assign
    // Infinity so they behave like unloaded chunks.
    for (let s = 0; s < allTexts.length; s++) {
      if (segmentChunkIdx[s] === -1) startTimes[s] = Infinity;
    }
  } else {
    // Path c: linear fallback (LibriVox audiobook path)
    const totalChars = charCounts.reduce((a, b) => a + b, 0) || 1;
    let elapsed = 0;
    for (let i = 0; i < allTexts.length; i++) {
      startTimes[i] = (elapsed / totalChars) * duration;
      elapsed += charCounts[i];
    }
  }

  // Step 3: map back to paragraph structure
  let flat = 0;
  return paraData.map(({ texts, isVerse: verse }) => ({
    isVerse: verse,
    segments: texts.map((text) => {
      const here = flat++;
      return {
        text,
        flatIdx: here,
        startTime: startTimes[here],
        chunkIdx: segmentChunkIdx[here],
      };
    }),
  }));
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  text: string;
  duration: number;      // audio duration in seconds (0 = no audio linked)
  currentTime: number;   // audio currentTime in seconds
  isPlaying: boolean;
  onSegmentClick: (startTime: number, text: string) => void;
  /**
   * Per-chunk metadata for chunked TTS playback. When provided, segment
   * timings are computed per-chunk (much more accurate than linear), and
   * segments in not-yet-loaded chunks (duration === 0) are visually muted.
   */
  chunks?: ChunkInfo[];
  /**
   * When true, sentence clicks are ignored and segments are visually
   * deemphasized. Used while TTS audio is generating, so the user can't
   * accidentally trigger a one-off snippet that conflicts with the
   * in-flight chapter generation.
   */
  disabled?: boolean;
  /**
   * When provided, translations are rendered alongside the original text.
   * Each entry corresponds to a paragraph in the chapter (same indices as
   * text.split(/\n\n+/)). Highlighting still works on the original text.
   */
  translations?: string[];
  /** Layout for translation mode. "parallel" = side by side, "inline" = below. */
  translationDisplayMode?: "parallel" | "inline";
  /** BCP-47 language tag for the translation (e.g. "zh", "de"). Added as lang= on translated paragraphs so screen readers use the correct pronunciation engine (WCAG 3.1.2). */
  translationLang?: string;
  /** Show a loading skeleton for translations that haven't arrived yet. */
  translationLoading?: boolean;
  /** Sentence text to scroll to and briefly highlight. */
  scrollTargetSentence?: string;
  /**
   * Called when the user clicks an already-annotated segment.
   * Provides the annotation and the click position so the parent can open
   * an inline color-picker / delete panel without navigating away.
   */
  onAnnotationClick?: (
    annotation: Annotation,
    position: { x: number; y: number },
  ) => void;
  /** Chapter index — used to scope annotations to the current chapter. */
  chapterIndex?: number;
  /** Existing annotations to highlight matching segments. */
  annotations?: Annotation[];
  /**
   * Unified tap handler (replaces click/double-click/long-press on mobile).
   * When provided, a single tap on any word calls this with the word, sentence
   * text, timing info, and paragraph translation. The parent opens a bottom
   * drawer with actions (read, save, annotate).
   */
  onWordTap?: (info: {
    word: string;
    sentenceText: string;
    startTime: number;
    chapterIndex: number;
    translationText?: string;
  }) => void;
  /**
   * Called on a 500ms long-press when onWordTap is not provided.
   * Opens the note/highlight editor for the pressed sentence.
   */
  onAnnotate?: (sentenceText: string, chapterIndex: number) => void;
  /** When false, annotation underlines and note dots are hidden. Default true. */
  showAnnotations?: boolean;
  /** Word to highlight (amber pulse) inside the flash-target sentence. */
  scrollTargetWord?: string;
  /** Flat index of the sentence currently selected in keyboard sentence-select mode. */
  selectedSentenceFlatIdx?: number | null;
  /** When true, words within the selected sentence are rendered as individual spans for keyboard navigation. */
  wordSelectMode?: boolean;
  /** Index of the word currently highlighted within the selected sentence in keyboard word-select mode. */
  selectedWordIdx?: number | null;
  /** Vocabulary words to show with a subtle dotted underline in all segments. */
  vocabWords?: Set<string>;
  /** When set, dims all paragraphs except this index. */
  focusParagraphIdx?: number;
  /** When true, fires onParagraphVisible as the user scrolls. */
  paragraphFocusEnabled?: boolean;
  /** Fired when a paragraph scrolls into the viewport center (scroll-driven). */
  onParagraphVisible?: (idx: number) => void;
  /** Fired when audio playback crosses into a new paragraph. */
  onActiveParagraphChange?: (idx: number) => void;
  /** Fired when paragraph start/stop times are computed or updated. */
  onParagraphTimingsUpdate?: (timings: { startTime: number; stopTime: number }[]) => void;
}

const ANNOTATION_COLOR_CLASS: Record<string, string> = {
  yellow: "border-b-2 border-yellow-400",
  blue: "border-b-2 border-blue-400",
  green: "border-b-2 border-green-400",
  pink: "border-b-2 border-pink-400",
};

const NOTE_DOT_CLASS: Record<string, string> = {
  yellow: "bg-yellow-400",
  blue: "bg-blue-400",
  green: "bg-green-400",
  pink: "bg-pink-400",
};

const NOTE_CARD_CLASS: Record<string, string> = {
  yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
  blue: "bg-blue-50 text-blue-800 border-blue-200",
  green: "bg-green-50 text-green-800 border-green-200",
  pink: "bg-pink-50 text-pink-800 border-pink-200",
};

/** Render segment text with target-word pulse and vocab-word dotted underlines. */
function buildSegContent(
  text: string,
  targetWord: string | undefined,
  vocabWords: Set<string> | undefined,
  annotationMatches?: Array<{ start: number; end: number; className: string; annId: number }>,
  onAnnotationKeyDown?: (annId: number, e: React.KeyboardEvent<HTMLSpanElement>) => void,
): React.ReactNode {
  if (!targetWord && !vocabWords?.size && (!annotationMatches || annotationMatches.length === 0)) return text;

  type Match = { start: number; end: number; type: "target" | "vocab" | "annotation"; className?: string; annId?: number };
  const matches: Match[] = [];

  const addMatches = (needle: string, type: Match["type"]) => {
    const lc = text.toLowerCase();
    const nl = needle.toLowerCase();
    let i = 0;
    while (i < lc.length) {
      const idx = lc.indexOf(nl, i);
      if (idx === -1) break;
      const pre = idx === 0 || !/\w/.test(text[idx - 1]);
      const post = idx + nl.length >= text.length || !/\w/.test(text[idx + nl.length]);
      if (pre && post) matches.push({ start: idx, end: idx + nl.length, type });
      i = idx + nl.length;
    }
  };

  if (targetWord) addMatches(targetWord, "target");
  vocabWords?.forEach((w) => addMatches(w, "vocab"));
  if (annotationMatches) {
    for (const m of annotationMatches) matches.push({ ...m, type: "annotation" });
  }

  if (!matches.length) return text;

  // Sort by start; on tie, prefer annotation > target > vocab so the partial
  // highlight wins over an inner vocab underline.
  const typeOrder = { annotation: 0, target: 1, vocab: 2 } as const;
  matches.sort((a, b) => a.start - b.start || typeOrder[a.type] - typeOrder[b.type]);
  const deduped: Match[] = [];
  let lastEnd = 0;
  for (const m of matches) {
    if (m.start >= lastEnd) { deduped.push(m); lastEnd = m.end; }
  }

  const nodes: React.ReactNode[] = [];
  let pos = 0;
  for (const m of deduped) {
    if (m.start > pos) nodes.push(text.slice(pos, m.start));
    const word = text.slice(m.start, m.end);
    if (m.type === "target") {
      nodes.push(
        <mark key={m.start} className="bg-amber-300 text-inherit rounded px-0.5 not-italic animate-pulse">
          {word}
        </mark>,
      );
    } else if (m.type === "annotation") {
      nodes.push(
        <span
          key={m.start}
          className={m.className ?? ""}
          data-ann-id={m.annId}
          role="button"
          tabIndex={0}
          aria-label={`Annotation on: ${word.slice(0, 60)}. Press Enter to edit.`}
          onKeyDown={onAnnotationKeyDown ? (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            onAnnotationKeyDown(m.annId!, e);
          } : undefined}
        >
          {word}
        </span>,
      );
    } else {
      nodes.push(
        <span key={m.start} className="underline decoration-amber-400 decoration-dotted decoration-2 underline-offset-2">
          {word}
        </span>,
      );
    }
    pos = m.end;
  }
  if (pos < text.length) nodes.push(text.slice(pos));
  return <>{nodes}</>;
}

/** Render sentence text as per-word spans for keyboard word-select mode. */
function buildWordSelectContent(text: string, selectedWordIdx: number | null): React.ReactNode {
  // Split into alternating [word, whitespace, word, ...] tokens to preserve spacing
  const tokens = text.split(/(\s+)/);
  let wordIdx = 0;
  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <React.Fragment key={i}>{token}</React.Fragment>;
        const currentWordIdx = wordIdx++;
        const isSelected = currentWordIdx === selectedWordIdx;
        return (
          <span
            key={i}
            data-word-idx={currentWordIdx}
            className={isSelected ? "ring-2 ring-purple-500 bg-purple-50 rounded px-0.5" : ""}
          >
            {token}
          </span>
        );
      })}
    </>
  );
}

export default function SentenceReader({
  text,
  duration,
  currentTime,
  isPlaying,
  onSegmentClick,
  chunks,
  disabled = false,
  translations,
  translationDisplayMode = "parallel",
  translationLang,
  translationLoading = false,
  onAnnotationClick,
  chapterIndex = 0,
  annotations,
  scrollTargetSentence,
  onWordTap,
  onAnnotate,
  showAnnotations = true,
  scrollTargetWord,
  selectedSentenceFlatIdx = null,
  wordSelectMode = false,
  selectedWordIdx = null,
  vocabWords,
  focusParagraphIdx,
  paragraphFocusEnabled = false,
  onParagraphVisible,
  onActiveParagraphChange,
  onParagraphTimingsUpdate,
}: Props) {
  const [flashTarget, setFlashTarget] = useState<string | null>(null);
  const [expandedNoteFlatIdx, setExpandedNoteFlatIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartPos = useRef<{ x: number; y: number } | null>(null);
  // Track which internal paragraph index each rendered paragraph corresponds
  // to, so we can pair it with the right translation entry. We count only
  // non-illustration paragraphs because TranslationView's paragraphs array
  // comes from text.split(/\n\n+/) which doesn't include illustration markers.
  let textParaIdx = -1;
  const paragraphs = useMemo(
    () => parseIntoSegments(text, Math.max(duration, 1), chunks),
    [text, duration, chunks]
  );

  // For coloring: which chunk indices have actually loaded (duration > 0)
  const loadedChunkIndices = useMemo(() => {
    if (!chunks) return null;
    const set = new Set<number>();
    chunks.forEach((c, i) => { if (c.duration > 0) set.add(i); });
    return set;
  }, [chunks]);

  function isSegmentLoaded(seg: { chunkIdx: number }): boolean {
    if (loadedChunkIndices === null) return true;  // no chunks given → always rendered normally
    return seg.chunkIdx >= 0 && loadedChunkIndices.has(seg.chunkIdx);
  }

  const allSegments = useMemo(
    () => paragraphs.flatMap((p) => p.segments),
    [paragraphs]
  );

  // Current segment: last one whose startTime ≤ currentTime.
  // Do NOT break early on Infinity values — unmatched segments create holes
  // in the sorted order, so scanning all segments is required.
  const currentIdx = useMemo(() => {
    if (duration === 0 || currentTime === 0) return -1;
    let best = -1;
    for (let i = 0; i < allSegments.length; i++) {
      if (allSegments[i].startTime <= currentTime) best = i;
    }
    return best;
  }, [allSegments, currentTime, duration]);

  // Auto-scroll active segment into view — scroll only #reader-scroll, not the window.
  // scrollIntoView() on iOS Safari scrolls multiple ancestors including the body,
  // which causes the whole page to jump upward (#1736). Use container.scrollTo() directly.
  const activeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (currentIdx < 0 || !isPlaying || !activeRef.current) return;
    const el = activeRef.current;
    const container = document.getElementById("reader-scroll");
    if (!container) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const relTop = elRect.top - containerRect.top;
    const relBottom = elRect.bottom - containerRect.top;
    if (relTop < 0 || relBottom > containerRect.height) {
      container.scrollTo({
        top: container.scrollTop + relTop - containerRect.height / 3,
        behavior: "smooth",
      });
    }
  }, [currentIdx, isPlaying]);

  // Expose paragraph timings to parent whenever paragraphs recompute (chunks load)
  useEffect(() => {
    if (!onParagraphTimingsUpdate) return;
    onParagraphTimingsUpdate(
      paragraphs.map((p, i) => ({
        startTime: p.segments[0]?.startTime ?? 0,
        stopTime: paragraphs[i + 1]?.segments[0]?.startTime ?? Infinity,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs]);

  // Track which paragraph contains the currently-playing segment and notify parent
  const currentParagraphIdx = useMemo(() => {
    if (currentIdx < 0) return -1;
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].segments.some((s) => s.flatIdx === currentIdx)) return i;
    }
    return -1;
  }, [currentIdx, paragraphs]);

  const prevActiveParagraphRef = useRef(-1);
  useEffect(() => {
    if (currentParagraphIdx >= 0 && currentParagraphIdx !== prevActiveParagraphRef.current) {
      prevActiveParagraphRef.current = currentParagraphIdx;
      onActiveParagraphChange?.(currentParagraphIdx);
    }
  }, [currentParagraphIdx, onActiveParagraphChange]);

  // Scroll-based paragraph focus: fire onParagraphVisible with the paragraph
  // nearest the viewport center while the user scrolls (and on mount)
  useEffect(() => {
    if (!paragraphFocusEnabled || !onParagraphVisible) return;
    const container = document.getElementById("reader-scroll");
    if (!container) return;

    function update() {
      const containerRect = container!.getBoundingClientRect();
      const center = containerRect.top + containerRect.height / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      containerRef.current?.querySelectorAll<HTMLElement>("[data-para-idx]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - center);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = Number(el.getAttribute("data-para-idx"));
        }
      });
      onParagraphVisible!(bestIdx);
    }

    container.addEventListener("scroll", update, { passive: true });
    update();
    return () => container.removeEventListener("scroll", update);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphFocusEnabled, paragraphs]);

  // Scroll to and flash the target sentence when scrollTargetSentence changes.
  // We capture the sentence in a closure so rapid re-triggers (< 80ms apart)
  // don't scroll to the wrong element: each timer checks its own sentence.
  useEffect(() => {
    if (!scrollTargetSentence) return;
    const target = scrollTargetSentence;
    setFlashTarget(target);
    const scroll = setTimeout(() => {
      // Only scroll if this effect's target is still the current flash target
      const el = containerRef.current?.querySelector("[data-jump-target]") as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const clear = setTimeout(() => setFlashTarget((cur) => cur === target ? null : cur), 2500);
    return () => { clearTimeout(scroll); clearTimeout(clear); };
  }, [scrollTargetSentence]);

  const hasTranslations = translations && translations.length > 0;
  const isParallel = hasTranslations && translationDisplayMode === "parallel";

  // Build a lookup map: sentence_text → annotation
  const annotationMap = useMemo(() => {
    const map = new Map<string, Annotation>();
    annotations?.forEach((a) => map.set(a.sentence_text, a));
    return map;
  }, [annotations]);

  // Lookup with substring fallback: annotations from text-selection may store a
  // substring of the segment text rather than the full sentence. Returns ALL
  // matching annotations (a single segment may contain multiple sub-sentence
  // annotations — see #1707). The exact full-segment match (if any) is first.
  const getAnnotations = useMemo(() => {
    const anns = annotations ?? [];
    return (segText: string): Annotation[] => {
      const out: Annotation[] = [];
      const exact = annotationMap.get(segText);
      if (exact) out.push(exact);
      for (const a of anns) {
        if (a === exact) continue;
        if (a.sentence_text.length >= 10 && a.sentence_text !== segText && segText.includes(a.sentence_text)) {
          out.push(a);
        }
      }
      return out;
    };
  }, [annotations, annotationMap]);

  // Long-press cancel (shared across segments)
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStartPos.current = null;
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!longPressStartPos.current) return;
    const dx = e.clientX - longPressStartPos.current.x;
    const dy = e.clientY - longPressStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) cancelLongPress();
  }

  return (
    <>
      <div ref={containerRef} className={isParallel ? "max-w-7xl mx-auto divide-y divide-amber-100" : "prose-reader mx-auto space-y-4"}>
      {paragraphs.map((para, pIdx) => {
        // Track the text paragraph index so we
        // can pair with the right entry in translations[].
        textParaIdx++;
        const translationText = translations?.[textParaIdx];

        // Helper: pick the className for a segment span
        const segClass = (seg: { flatIdx: number; chunkIdx: number }): string => {
          const active = seg.flatIdx === currentIdx;
          const loaded = isSegmentLoaded(seg);
          if (active) return "bg-amber-300 text-amber-950";
          if (disabled) {
            return loaded
              ? "text-stone-600"
              : "text-stone-600";
          }
          return loaded
            ? "hover:bg-amber-50"
            : "text-stone-600";
        };

        // Long press (500ms) → open word action drawer or annotation panel.
        // Note: we intentionally do NOT preventDefault() on touch pointerdown.
        // Suppressing the native selection loupe also blocks sub-sentence
        // drag-selection on mobile (see #364). Motion-based disambiguation
        // (pointermove >10px cancels the timer) routes drag gestures to the
        // browser's native selection while a still hold for 500ms triggers
        // the drawer; if the loupe briefly appears before the timer fires,
        // removeAllRanges() inside the timer clears it.
        const handleSegLongPress = (e: React.PointerEvent, seg: Segment) => {
          if (!onWordTap && !onAnnotate) return;
          const startX = e.clientX;
          const startY = e.clientY;
          longPressStartPos.current = { x: startX, y: startY };
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            // Prevent text selection
            window.getSelection()?.removeAllRanges();

            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(10);

            if (onWordTap) {
              // Extract word at press position
              let word = "";
              if ("caretRangeFromPoint" in document) {
                const range = (document as any).caretRangeFromPoint(startX, startY);
                if (range) { range.expand("word"); word = range.toString().trim(); }
              }
              if (!word) {
                word = seg.text.split(/\s+/).reduce((a: string, b: string) => (b.length > a.length ? b : a), "");
              }
              word = word.replace(/^[^a-zA-Z\u00C0-\u024F\u0400-\u04FF]+/, "")
                         .replace(/[^a-zA-Z\u00C0-\u024F\u0400-\u04FF]+$/, "");
              if (!word || word.length < 2) word = seg.text.split(/\s+/)[0] ?? "";

              onWordTap({
                word,
                sentenceText: seg.text,
                startTime: seg.startTime,
                chapterIndex,
                translationText: translationText || undefined,
              });
            } else if (onAnnotate) {
              onAnnotate(seg.text, chapterIndex);
            }
          }, 500);
        };

        // Render a segment span with annotation underline + note dot
        const renderSeg = (seg: Segment, extraClass = "", trailingSpace = false) => {
          const active = seg.flatIdx === currentIdx;
          const isJumpTarget = flashTarget !== null && (
            seg.text === flashTarget ||
            (flashTarget.length >= 10 && seg.text.includes(flashTarget))
          );
          // All annotations whose sentence_text matches this segment (#1707).
          // The first-matching full-segment annotation drives the wrapping span
          // colour; every sub-sentence annotation becomes its own data-ann-id
          // span inside buildSegContent so per-annotation clicks route correctly.
          const segAnns = showAnnotations ? getAnnotations(seg.text) : [];
          const fullSegmentAnnotation = segAnns.find((a) => a.sentence_text === seg.text);
          const annotationClass = fullSegmentAnnotation
            ? (ANNOTATION_COLOR_CLASS[fullSegmentAnnotation.color] ?? ANNOTATION_COLOR_CLASS.yellow)
            : "";
          const annotationMatches: Array<{ start: number; end: number; className: string; annId: number }> = [];
          for (const a of segAnns) {
            if (a === fullSegmentAnnotation) continue;
            const start = seg.text.indexOf(a.sentence_text);
            if (start >= 0) {
              annotationMatches.push({
                start,
                end: start + a.sentence_text.length,
                className: ANNOTATION_COLOR_CLASS[a.color] ?? ANNOTATION_COLOR_CLASS.yellow,
                annId: a.id,
              });
            }
          }
          // For the existing note-dot UI keep keying off "first annotation
          // with a note" — multi-note rendering is a separate follow-up.
          const noteAnnotation = segAnns.find((a) => a.note_text);
          const flashClass = isJumpTarget ? "ring-2 ring-amber-400 bg-amber-50" : "";
          const selectedClass = selectedSentenceFlatIdx === seg.flatIdx ? "ring-2 ring-blue-500 bg-blue-50 rounded" : "";
          // Keyboard accessibility for annotated segments (WCAG 2.1.1 / #2553):
          // A span with an existing annotation is an interactive control — keyboard
          // users must be able to focus it and activate it to edit or delete it.
          const isAnnotationInteractive = !!(showAnnotations && fullSegmentAnnotation && onAnnotationClick);
          return (
            <span
              key={seg.flatIdx}
              ref={active ? (el) => { activeRef.current = el; } : undefined}
              data-seg={seg.flatIdx}
              data-jump-target={isJumpTarget ? "true" : undefined}
              role={isAnnotationInteractive ? "button" : undefined}
              tabIndex={isAnnotationInteractive ? 0 : undefined}
              aria-label={isAnnotationInteractive ? (segAnns.length > 1 ? `${segAnns.length} annotations on: ${seg.text.slice(0, 80)}. Press Enter to edit first annotation.` : `Annotated sentence: ${seg.text.slice(0, 80)}. Press Enter to edit.`) : undefined}
              onKeyDown={isAnnotationInteractive ? (e: React.KeyboardEvent<HTMLSpanElement>) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                const rect = (e.currentTarget as HTMLSpanElement).getBoundingClientRect();
                onAnnotationClick!(fullSegmentAnnotation, {
                  x: rect.left + rect.width / 2,
                  y: rect.bottom,
                });
              } : undefined}
              onClick={(e) => {
                if (disabled || !isSegmentLoaded(seg)) return;
                // Ignore clicks that are the tail of a text-selection drag
                if (window.getSelection()?.toString().length) return;
                // Multi-annotation click routing (#1707): walk up from the
                // event target to the nearest [data-ann-id]; a click that does
                // not land on any annotation span falls through to the
                // segment-click path so a fresh selection can begin.
                if (showAnnotations && onAnnotationClick) {
                  const annHost = (e.target as HTMLElement | null)?.closest?.("[data-ann-id]") as HTMLElement | null;
                  if (annHost) {
                    const id = Number(annHost.getAttribute("data-ann-id"));
                    const ann = (annotations ?? []).find((a) => a.id === id);
                    if (ann) {
                      onAnnotationClick(ann, { x: e.clientX, y: e.clientY });
                      return;
                    }
                  } else if (fullSegmentAnnotation) {
                    onAnnotationClick(fullSegmentAnnotation, { x: e.clientX, y: e.clientY });
                    return;
                  }
                }
                if (isPlaying || duration > 0) {
                  onSegmentClick(seg.startTime, seg.text);
                }
              }}
              onPointerDown={(onWordTap || onAnnotate) ? (e) => handleSegLongPress(e, seg) : undefined}
              onPointerUp={(onWordTap || onAnnotate) ? cancelLongPress : undefined}
              onPointerCancel={(onWordTap || onAnnotate) ? cancelLongPress : undefined}
              onPointerMove={(onWordTap || onAnnotate) ? handlePointerMove : undefined}
              className={`rounded px-0.5 -mx-0.5 transition-colors duration-200 ${segClass(seg)} ${annotationClass} ${flashClass} ${selectedClass} ${extraClass}`}
            >
              {wordSelectMode && seg.flatIdx === selectedSentenceFlatIdx
                ? buildWordSelectContent(seg.text, selectedWordIdx)
                : buildSegContent(
                    seg.text,
                    isJumpTarget ? scrollTargetWord : undefined,
                    vocabWords,
                    annotationMatches,
                    (showAnnotations && onAnnotationClick && annotationMatches.length > 0) ? (annId, e) => {
                      const ann = (annotations ?? []).find((a) => a.id === annId);
                      if (!ann) return;
                      const rect = (e.currentTarget as HTMLSpanElement).getBoundingClientRect();
                      onAnnotationClick(ann, { x: rect.left + rect.width / 2, y: rect.bottom });
                    } : undefined,
                  )}
              {noteAnnotation?.note_text && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedNoteFlatIdx((prev) => prev === seg.flatIdx ? null : seg.flatIdx); }}
                  className="inline-flex items-center justify-center ml-0.5 align-middle cursor-pointer min-h-[44px] md:min-h-0 min-w-[44px] md:min-w-0 -m-[19px] p-[19px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                  aria-label={`Toggle note for: ${seg.text.slice(0, 60)}`}
                  aria-expanded={expandedNoteFlatIdx === seg.flatIdx}
                  aria-controls={`note-panel-${seg.flatIdx}`}
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${NOTE_DOT_CLASS[noteAnnotation.color] ?? NOTE_DOT_CLASS.yellow}`} />
                </button>
              )}
              {trailingSpace ? " " : ""}
            </span>
          );
        };

        // Render the original text (highlighted, clickable)
        let originalContent: React.ReactNode;
        if (para.isVerse) {
          originalContent = (
            <div className="font-serif text-base text-ink">
              {para.segments.map((seg) => (
                <span key={seg.flatIdx} className="block">
                  {renderSeg(seg)}
                </span>
              ))}
            </div>
          );
        } else {
          originalContent = (
            <p className="font-serif text-base text-ink">
              {para.segments.map((seg, sIdx) =>
                renderSeg(seg, "", sIdx < para.segments.length - 1)
              )}
            </p>
          );
        }

        // Expanded note card for any annotated sentence in this paragraph.
        // With multi-annotation support (#1707), pick the first annotation
        // with a note on the expanded segment.
        const expandedAnn = expandedNoteFlatIdx !== null
          ? (para.segments
              .filter((s) => s.flatIdx === expandedNoteFlatIdx)
              .flatMap((s) => getAnnotations(s.text))
              .find((a) => a.note_text) ?? null)
          : null;
        const noteCard = expandedAnn?.note_text ? (
          <div id={`note-panel-${expandedNoteFlatIdx}`} className={`mt-1.5 text-xs rounded px-2.5 py-1.5 border ${NOTE_CARD_CLASS[expandedAnn.color] ?? NOTE_CARD_CLASS.yellow}`}>
            <p className="italic leading-relaxed">{expandedAnn.note_text}</p>
          </div>
        ) : null;

        const focusClass = focusParagraphIdx !== undefined
          ? (pIdx === focusParagraphIdx ? "para-active" : "para-dim")
          : "";

        // ── No translation: render original only ──
        if (!hasTranslations) {
          return (
            <div key={pIdx} data-para-idx={pIdx} className={focusClass}>
              {originalContent}
              {noteCard}
            </div>
          );
        }

        // ── Translation: parallel (side by side) ──
        if (isParallel) {
          return (
            <div key={pIdx} data-para-idx={pIdx} className={`py-4 first:pt-0 last:pb-0 ${focusClass}`}>
              <div className="flex flex-col md:grid md:grid-cols-2 md:gap-6 gap-2">
                <div>
                  {originalContent}
                  {noteCard}
                </div>
                <div className="border-t md:border-t-0 md:border-l border-amber-200 pt-2 md:pt-0 md:pl-6" data-translation="true">
                  {translationText ? (
                    <p lang={translationLang} className="font-serif text-base text-amber-800 italic whitespace-pre-wrap">
                      {translationText}
                    </p>
                  ) : translationLoading ? (
                    <div role="status" aria-label="Loading translation">
                      <span className="sr-only">Loading translation...</span>
                      <div className="space-y-2 animate-pulse">
                        {Array.from({ length: 3 }).map((_, j) => (
                          <div key={j} className={`h-3 bg-amber-100 rounded ${j === 2 ? "w-2/3" : "w-full"}`} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }

        // ── Translation: inline (below) ──
        return (
          <div key={pIdx} data-para-idx={pIdx} className={focusClass}>
            {originalContent}
            {noteCard}
            {translationLoading && textParaIdx === 0 && !translationText && (
              <div role="status" aria-label="Loading translation">
                <span className="sr-only">Loading translation...</span>
                <div className="mt-1 space-y-1 animate-pulse">
                  <div className="h-3 bg-amber-100 rounded w-full" />
                  <div className="h-3 bg-amber-100 rounded w-5/6" />
                </div>
              </div>
            )}
            {translationText && (
              <p lang={translationLang} data-translation="true" className="mt-1 font-serif text-sm text-amber-700 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
                {translationText}
              </p>
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
