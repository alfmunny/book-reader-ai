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
  return !lines.some((l) => l.length > 60);
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
      // Find this segment within the remaining chunk text
      while (chunkIdx < chunks.length) {
        const chunkText = chunks[chunkIdx].text.replace(/\n/g, " ");
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
        // Not in this chunk — move to the next
        chunkIdx++;
        cursor = 0;
      }
      // Out of chunks → leave -1 (won't get a startTime, won't be coloured-as-loaded)
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
        const normalised = chunk.text.replace(/\n/g, " ");
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
  /** Show a loading skeleton for translations that haven't arrived yet. */
  translationLoading?: boolean;
  /** Sentence text to scroll to and briefly highlight. */
  scrollTargetSentence?: string;
  /**
   * Called when the user long-presses a sentence (400ms hold).
   * Provides the sentence text, chapter index, and pointer position.
   */
  onAnnotate?: (
    sentenceText: string,
    chapterIndex: number,
    position: { x: number; y: number },
  ) => void;
  /** Chapter index — used with onAnnotate. */
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
  /** When false, annotation underlines and note dots are hidden. Default true. */
  showAnnotations?: boolean;
  /** Word to highlight (amber pulse) inside the flash-target sentence. */
  scrollTargetWord?: string;
  /** Vocabulary words to show with a subtle dotted underline in all segments. */
  vocabWords?: Set<string>;
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
): React.ReactNode {
  if (!targetWord && !vocabWords?.size) return text;

  type Match = { start: number; end: number; type: "target" | "vocab" };
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

  if (!matches.length) return text;

  matches.sort((a, b) => a.start - b.start);
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
  translationLoading = false,
  onAnnotate,
  chapterIndex = 0,
  annotations,
  scrollTargetSentence,
  onWordTap,
  showAnnotations = true,
  scrollTargetWord,
  vocabWords,
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

  // Current segment: last one whose startTime ≤ currentTime
  const currentIdx = useMemo(() => {
    if (duration === 0 || currentTime === 0) return -1;
    let best = -1;
    for (let i = 0; i < allSegments.length; i++) {
      if (allSegments[i].startTime <= currentTime) best = i;
      else break;
    }
    return best;
  }, [allSegments, currentTime, duration]);

  // Auto-scroll active segment into view
  const activeRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (currentIdx >= 0 && isPlaying) {
      activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentIdx, isPlaying]);

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
  // substring of the segment text rather than the full sentence.
  const getAnnotation = useMemo(() => {
    const anns = annotations ?? [];
    return (segText: string): Annotation | undefined => {
      const exact = annotationMap.get(segText);
      if (exact) return exact;
      return anns.find((a) => a.sentence_text.length >= 10 && segText.includes(a.sentence_text));
    };
  }, [annotations, annotationMap]);

  // Long-press handlers (shared across segments)
  function handlePointerDown(e: React.PointerEvent, seg: Segment) {
    if (!onAnnotate) return;
    const startX = e.clientX;
    const startY = e.clientY;
    longPressStartPos.current = { x: startX, y: startY };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressStartPos.current = null;
      onAnnotate(seg.text, chapterIndex, { x: startX, y: startY });
    }, 400);
  }

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
              ? "text-stone-500"
              : "text-stone-400/70";
          }
          return loaded
            ? "hover:bg-amber-50"
            : "text-stone-400 cursor-default";
        };

        // Long press (500ms) → open word action drawer
        const handleSegLongPress = (e: React.PointerEvent, seg: Segment) => {
          if (!onWordTap) {
            // Fallback to legacy annotation long-press
            handlePointerDown(e, seg);
            return;
          }
          const startX = e.clientX;
          const startY = e.clientY;
          longPressStartPos.current = { x: startX, y: startY };
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            // Prevent text selection
            window.getSelection()?.removeAllRanges();

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

            // Haptic feedback
            if (navigator.vibrate) navigator.vibrate(10);

            onWordTap({
              word,
              sentenceText: seg.text,
              startTime: seg.startTime,
              chapterIndex,
              translationText: translationText || undefined,
            });
          }, 500);
        };

        // Render a segment span with annotation underline + note dot
        const renderSeg = (seg: Segment, extraClass = "", trailingSpace = false) => {
          const active = seg.flatIdx === currentIdx;
          const isJumpTarget = flashTarget !== null && seg.text === flashTarget;
          const annotation = showAnnotations ? getAnnotation(seg.text) : undefined;
          const annotationClass = annotation
            ? (ANNOTATION_COLOR_CLASS[annotation.color] ?? ANNOTATION_COLOR_CLASS.yellow)
            : "";
          const flashClass = isJumpTarget ? "ring-2 ring-amber-400 bg-amber-50" : "";
          return (
            <span
              key={seg.flatIdx}
              ref={active ? (el) => { activeRef.current = el; } : undefined}
              data-seg={seg.flatIdx}
              data-jump-target={isJumpTarget ? "true" : undefined}
              onClick={(e) => {
                if (disabled || !isSegmentLoaded(seg)) return;
                // Ignore clicks that are the tail of a text-selection drag
                if (window.getSelection()?.toString().length) return;
                if (isPlaying || duration > 0) {
                  onSegmentClick(seg.startTime, seg.text);
                }
              }}
              onPointerDown={(e) => onWordTap ? handleSegLongPress(e, seg) : handlePointerDown(e, seg)}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onPointerMove={handlePointerMove}
              className={`rounded px-0.5 -mx-0.5 transition-colors duration-200 ${segClass(seg)} ${annotationClass} ${flashClass} ${extraClass}`}
            >
              {buildSegContent(seg.text, isJumpTarget ? scrollTargetWord : undefined, vocabWords)}
              {annotation?.note_text && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedNoteFlatIdx((prev) => prev === seg.flatIdx ? null : seg.flatIdx); }}
                  className="inline-block ml-0.5 align-middle leading-none cursor-pointer"
                  aria-label="Toggle note"
                >
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${NOTE_DOT_CLASS[annotation.color] ?? NOTE_DOT_CLASS.yellow}`} />
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
            <div className="font-serif text-base text-ink leading-relaxed">
              {para.segments.map((seg) => (
                <span key={seg.flatIdx} className="block">
                  {renderSeg(seg)}
                </span>
              ))}
            </div>
          );
        } else {
          originalContent = (
            <p className="font-serif text-base text-ink leading-relaxed">
              {para.segments.map((seg, sIdx) =>
                renderSeg(seg, "", sIdx < para.segments.length - 1)
              )}
            </p>
          );
        }

        // Expanded note card for any annotated sentence in this paragraph
        const expandedAnn = expandedNoteFlatIdx !== null
          ? (para.segments.map((s) => s.flatIdx === expandedNoteFlatIdx ? getAnnotation(s.text) : null).find((a) => a != null) ?? null)
          : null;
        const noteCard = expandedAnn?.note_text ? (
          <div className={`mt-1.5 text-xs rounded px-2.5 py-1.5 border ${NOTE_CARD_CLASS[expandedAnn.color] ?? NOTE_CARD_CLASS.yellow}`}>
            <p className="italic leading-relaxed">{expandedAnn.note_text}</p>
          </div>
        ) : null;

        // ── No translation: render original only ──
        if (!hasTranslations) {
          return (
            <div key={pIdx}>
              {originalContent}
              {noteCard}
            </div>
          );
        }

        // ── Translation: parallel (side by side) ──
        if (isParallel) {
          return (
            <div key={pIdx} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col md:grid md:grid-cols-2 md:gap-6 gap-2">
                <div>
                  {originalContent}
                  {noteCard}
                </div>
                <div className="border-t md:border-t-0 md:border-l border-amber-200 pt-2 md:pt-0 md:pl-6" data-translation="true">
                  {translationText ? (
                    <p className="font-serif text-base text-amber-800 leading-relaxed italic whitespace-pre-wrap">
                      {translationText}
                    </p>
                  ) : translationLoading ? (
                    <div className="space-y-2 animate-pulse">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className={`h-3 bg-amber-100 rounded ${j === 2 ? "w-2/3" : "w-full"}`} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        }

        // ── Translation: inline (below) ──
        return (
          <div key={pIdx}>
            {originalContent}
            {noteCard}
            {translationLoading && textParaIdx === 0 && !translationText && (
              <div className="mt-1 space-y-1 animate-pulse">
                <div className="h-3 bg-amber-100 rounded w-full" />
                <div className="h-3 bg-amber-100 rounded w-5/6" />
              </div>
            )}
            {translationText && (
              <p data-translation="true" className="mt-1 font-serif text-sm text-amber-700 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
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
