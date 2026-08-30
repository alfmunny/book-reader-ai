/**
 * Section-level note pooling (owner decision, 2026-08-28, #2752).
 *
 * Shared-note anchors are free selections: a whole multi-sentence section,
 * one sentence, or a fragment inside one. Managing each selection as its own
 * thread would fracture the discussion — so notes POOL by overlap: clicking
 * anywhere in a marked section shows every note whose anchor overlaps that
 * section, including fragment notes made inside it. Highlights still render
 * at their exact selection; only note membership is section-level.
 */
import { Story } from "@/lib/api";

export function anchorsOverlap(a: string, b: string): boolean {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta || !tb) return false;
  return ta.includes(tb) || tb.includes(ta);
}

/**
 * All note stories belonging to the section around `sentenceText`:
 * direct overlaps first, then anything overlapping THOSE anchors — one
 * transitive step, enough to join fragment ⊂ sentence ⊂ section chains.
 */
export function poolNoteStories(stories: Story[], sentenceText: string): Story[] {
  const notes = stories.filter((st) => st.kind === "note" && st.sentence_text);
  const direct = notes.filter((st) => anchorsOverlap(st.sentence_text!, sentenceText));
  const sectionTexts = [sentenceText, ...direct.map((st) => st.sentence_text!)];
  return notes.filter((st) => sectionTexts.some((t) => anchorsOverlap(st.sentence_text!, t)));
}
