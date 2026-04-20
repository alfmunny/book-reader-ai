"use client";
import { useEffect, useMemo, useRef } from "react";

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
  // The chunker splits the chapter at paragraph boundaries; the segmenter
  // splits at sentences/lines. So a segment never spans chunk boundaries —
  // we just walk both lists in chapter order and assign.
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
        // Not in this chunk — move to the next
        chunkIdx++;
        cursor = 0;
      }
      // Out of chunks → leave -1 (won't get a startTime, won't be coloured-as-loaded)
    }
  }

  // Step 2b: build time map.
  // Two paths:
  //   a) chunks given → distribute segments within each chunk by word count,
  //      using the chunk's MEASURED duration. This is much more accurate
  //      than linear interpolation across the whole chapter because it
  //      accounts for varying speech rate per chunk.
  //   b) no chunks → fall back to linear word-proportion across `duration`.
  // Character count is a better proxy for TTS speaking time than word count
  // because words vary widely in length (e.g. "I" vs "extraordinarily").
  const wordCounts = allTexts.map((s) => Math.max(1, s.trim().length));
  const startTimes: number[] = new Array(allTexts.length).fill(0);

  if (chunks && chunks.length > 0) {
    let chunkStartTime = 0;
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      // Indices of segments in this chunk
      const segIndices: number[] = [];
      for (let s = 0; s < allTexts.length; s++) {
        if (segmentChunkIdx[s] === ci) segIndices.push(s);
      }
      const chunkWords = segIndices.reduce((sum, idx) => sum + wordCounts[idx], 0) || 1;
      let elapsed = 0;
      for (const idx of segIndices) {
        startTimes[idx] = chunkStartTime + (elapsed / chunkWords) * chunk.duration;
        elapsed += wordCounts[idx];
      }
      chunkStartTime += chunk.duration;
    }
  } else {
    // Linear fallback (used by the LibriVox audiobook path)
    const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;
    let elapsed = 0;
    for (let i = 0; i < allTexts.length; i++) {
      startTimes[i] = (elapsed / totalWords) * duration;
      elapsed += wordCounts[i];
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
}: Props) {
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
    let best = 0;
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

  const hasTranslations = translations && translations.length > 0;
  const isParallel = hasTranslations && translationDisplayMode === "parallel";

  return (
    <div className={isParallel ? "max-w-7xl mx-auto divide-y divide-amber-100" : "prose-reader mx-auto space-y-4"}>
      {paragraphs.map((para, pIdx) => {
        // Track the text paragraph index so we
        // can pair with the right entry in translations[].
        textParaIdx++;
        const translationText = translations?.[textParaIdx];

        // Helper: pick the className for a segment span
        const segClass = (seg: { flatIdx: number; chunkIdx: number }): string => {
          const active = seg.flatIdx === currentIdx;
          const loaded = isSegmentLoaded(seg);
          if (active) return "bg-amber-300 text-amber-950 cursor-pointer";
          if (disabled) {
            return loaded
              ? "text-stone-500 cursor-default"
              : "text-stone-400/70 cursor-default";
          }
          return loaded
            ? "cursor-pointer hover:bg-amber-100"
            : "text-stone-400 cursor-default";
        };

        const handleSegClick = (seg: { startTime: number; text: string; chunkIdx: number }) => {
          if (disabled) return;
          if (!isSegmentLoaded(seg)) return;
          onSegmentClick(seg.startTime, seg.text);
        };

        // Render the original text (highlighted, clickable)
        let originalContent: React.ReactNode;
        if (para.isVerse) {
          originalContent = (
            <div className="font-serif text-base text-ink leading-relaxed">
              {para.segments.map((seg) => {
                const active = seg.flatIdx === currentIdx;
                return (
                  <span key={seg.flatIdx} className="block">
                    <span
                      ref={active ? (el) => { activeRef.current = el; } : undefined}
                      data-seg={seg.flatIdx}
                      onClick={() => handleSegClick(seg)}
                      className={`rounded px-0.5 -mx-0.5 transition-colors duration-200 ${segClass(seg)}`}
                    >
                      {seg.text}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        } else {
          originalContent = (
            <p className="font-serif text-base text-ink leading-relaxed">
              {para.segments.map((seg, sIdx) => {
                const active = seg.flatIdx === currentIdx;
                return (
                  <span
                    key={seg.flatIdx}
                    ref={active ? (el) => { activeRef.current = el; } : undefined}
                    data-seg={seg.flatIdx}
                    onClick={() => handleSegClick(seg)}
                    className={`rounded px-0.5 -mx-0.5 transition-colors duration-200 ${segClass(seg)}`}
                  >
                    {seg.text}
                    {sIdx < para.segments.length - 1 ? " " : ""}
                  </span>
                );
              })}
            </p>
          );
        }

        // ── No translation: render original only ──
        if (!hasTranslations) {
          return <div key={pIdx}>{originalContent}</div>;
        }

        // ── Translation: parallel (side by side) ──
        if (isParallel) {
          return (
            <div key={pIdx} className="grid grid-cols-2 gap-6 py-4 first:pt-0 last:pb-0">
              {originalContent}
              <div className="border-l border-amber-200 pl-6">
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
          );
        }

        // ── Translation: inline (below) ──
        return (
          <div key={pIdx}>
            {originalContent}
            {translationLoading && textParaIdx === 0 && !translationText && (
              <div className="mt-1 space-y-1 animate-pulse">
                <div className="h-3 bg-amber-100 rounded w-full" />
                <div className="h-3 bg-amber-100 rounded w-5/6" />
              </div>
            )}
            {translationText && (
              <p className="mt-1 font-serif text-sm text-amber-700 italic border-l-2 border-amber-300 pl-3 whitespace-pre-wrap">
                {translationText}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
