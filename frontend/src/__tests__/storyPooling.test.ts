/**
 * Section-level note pooling (owner decision, 2026-08-28, #2752):
 * anchors stay exact; only click-time matching pools by overlap.
 */
import { anchorsOverlap, poolNoteStories } from "@/lib/storyPooling";
import type { Story } from "@/lib/api";

const SECTION = "Erster Satz hier. Zweiter Satz folgt. Dritter Satz endet.";

function note(id: number, sentence_text: string): Story {
  return {
    id, user_id: id, kind: "note", book_id: 1, chapter_index: 0,
    created_at: "", author_name: `U${id}`, comment_count: 0, sentence_text,
  } as Story;
}

test("anchorsOverlap matches containment in either direction, never empties", () => {
  expect(anchorsOverlap(SECTION, "Zweiter Satz folgt.")).toBe(true);
  expect(anchorsOverlap("Zweiter Satz", SECTION)).toBe(true);
  expect(anchorsOverlap(SECTION, "Ganz anderer Text.")).toBe(false);
  expect(anchorsOverlap(SECTION, "  ")).toBe(false);
});

test("clicking inside a section pools the section note and fragment notes within it", () => {
  const stories = [
    note(1, SECTION),                    // community note on the whole section
    note(2, "Zweiter Satz folgt."),      // note on the middle sentence
    note(3, "Dritter Satz"),             // fragment note
    note(4, "Unrelated other passage."), // elsewhere — stays out
  ];
  // Click lands on the middle sentence
  const pooled = poolNoteStories(stories, "Zweiter Satz folgt.");
  expect(pooled.map((s) => s.id).sort()).toEqual([1, 2, 3]);
});

test("clicking a lone note without section overlap pools only itself", () => {
  const stories = [note(1, "Unrelated other passage."), note(2, SECTION)];
  const pooled = poolNoteStories(stories, "Unrelated other passage.");
  expect(pooled.map((s) => s.id)).toEqual([1]);
});

test("translation stories never enter the note pool", () => {
  const stories = [
    note(1, SECTION),
    { ...note(2, SECTION), kind: "translation" as const },
  ];
  expect(poolNoteStories(stories, SECTION).map((s) => s.id)).toEqual([1]);
});
