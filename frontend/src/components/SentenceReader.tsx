"use client";
import { useEffect, useMemo, useRef } from "react";
import { BookImage } from "@/lib/api";

// ── Text parsing ────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  flatIdx: number;
  startTime: number; // estimated, seconds
}

interface Paragraph {
  segments: Segment[];
  isVerse: boolean;      // true = poetry (newlines between lines), false = prose
  illustration: BookImage | null; // non-null = render as image, not text
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

/** Match a [Illustration...] marker and extract the caption. */
const ILLUS_RE = /^\[Illustration(?::\s*(.+?))?\s*\]$/is;

function parseIntoSegments(text: string, duration: number, images: BookImage[]): Paragraph[] {
  // Step 1: collect all segment texts and classify paragraphs
  const rawParas = text.split(/\n\n+/);
  const paraData: { texts: string[]; isVerse: boolean; illustrationIdx: number | null }[] = [];
  const allTexts: string[] = [];
  let illustrationCount = 0;

  for (const raw of rawParas) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Detect illustration marker
    const illusMatch = trimmed.match(ILLUS_RE);
    if (illusMatch) {
      paraData.push({ texts: [], isVerse: false, illustrationIdx: illustrationCount++ });
      continue;
    }

    if (trimmed.includes("\n")) {
      const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
      if (isVerse(lines)) {
        // Real poetry — each line is its own segment
        paraData.push({ texts: lines, isVerse: true, illustrationIdx: null });
        allTexts.push(...lines);
      } else {
        // Soft-wrapped prose — join lines then split into sentences
        const joined = lines.join(" ");
        const sents = splitSentences(joined);
        paraData.push({ texts: sents, isVerse: false, illustrationIdx: null });
        allTexts.push(...sents);
      }
    } else {
      // Single-line paragraph — split into sentences
      const sents = splitSentences(trimmed);
      paraData.push({ texts: sents, isVerse: false, illustrationIdx: null });
      allTexts.push(...sents);
    }
  }

  // Step 2: build time map (word-proportion estimate)
  const wordCounts = allTexts.map((s) => Math.max(1, s.split(/\s+/).filter(Boolean).length));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || 1;
  const startTimes: number[] = [];
  let elapsed = 0;
  for (const wc of wordCounts) {
    startTimes.push((elapsed / totalWords) * duration);
    elapsed += wc;
  }

  // Step 3: map back to paragraph structure
  let flat = 0;
  return paraData.map(({ texts, isVerse: verse, illustrationIdx }) => {
    if (illustrationIdx !== null) {
      const img = images[illustrationIdx] ?? null;
      return { isVerse: false, illustration: img, segments: [] };
    }
    return {
      isVerse: verse,
      illustration: null,
      segments: texts.map((text) => ({
        text,
        flatIdx: flat,
        startTime: startTimes[flat++],
      })),
    };
  });
}

// ── Component ───────────────────────────────────────────────────────────────

interface Props {
  text: string;
  duration: number;      // audio duration in seconds (0 = no audio linked)
  currentTime: number;   // audio currentTime in seconds
  isPlaying: boolean;
  images?: BookImage[];
  onSegmentClick: (startTime: number, text: string) => void;
}

export default function SentenceReader({
  text,
  duration,
  currentTime,
  isPlaying,
  images = [],
  onSegmentClick,
}: Props) {
  const paragraphs = useMemo(
    () => parseIntoSegments(text, Math.max(duration, 1), images),
    [text, duration, images]
  );

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

  return (
    <div className="prose-reader mx-auto space-y-4">
      {paragraphs.map((para, pIdx) => {
        // ── Illustration ──
        if (para.illustration) {
          const { url, caption } = para.illustration;
          return (
            <figure key={pIdx} className="my-6 flex flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={caption}
                className="max-w-full rounded shadow-sm"
                loading="lazy"
              />
              {caption && (
                <figcaption className="text-center text-sm text-stone-500 italic">
                  {caption}
                </figcaption>
              )}
            </figure>
          );
        }

        if (para.isVerse) {
          // Poetry: each segment on its own line
          return (
            <div key={pIdx} className="font-serif text-base text-ink leading-relaxed">
              {para.segments.map((seg) => {
                const active = seg.flatIdx === currentIdx;
                return (
                  <span key={seg.flatIdx} className="block">
                    <span
                      ref={active ? (el) => { activeRef.current = el; } : undefined}
                      data-seg={seg.flatIdx}
                      onClick={() => onSegmentClick(seg.startTime, seg.text)}
                      className={`cursor-pointer rounded px-0.5 -mx-0.5 transition-colors duration-150 ${
                        active
                          ? "bg-amber-300 text-amber-950"
                          : "hover:bg-amber-100"
                      }`}
                    >
                      {seg.text}
                    </span>
                  </span>
                );
              })}
            </div>
          );
        }

        // Prose: inline sentence spans
        return (
          <p key={pIdx} className="font-serif text-base text-ink leading-relaxed">
            {para.segments.map((seg, sIdx) => {
              const active = seg.flatIdx === currentIdx;
              return (
                <span
                  key={seg.flatIdx}
                  ref={active ? (el) => { activeRef.current = el; } : undefined}
                  data-seg={seg.flatIdx}
                  onClick={() => onSegmentClick(seg.startTime, seg.text)}
                  className={`cursor-pointer rounded px-0.5 -mx-0.5 transition-colors duration-150 ${
                    active
                      ? "bg-amber-300 text-amber-950"
                      : "hover:bg-amber-100"
                  }`}
                >
                  {seg.text}
                  {sIdx < para.segments.length - 1 ? " " : ""}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
