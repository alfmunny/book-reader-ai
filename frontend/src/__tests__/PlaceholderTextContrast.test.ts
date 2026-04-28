import { readFileSync } from "fs";
import { join } from "path";

const decksDetailSrc = readFileSync(join(__dirname, "../app/decks/[deckId]/page.tsx"), "utf-8");
const annotationToolbarSrc = readFileSync(join(__dirname, "../components/AnnotationToolbar.tsx"), "utf-8");
const searchBarSrc = readFileSync(join(__dirname, "../components/SearchBar.tsx"), "utf-8");
const insightChatSrc = readFileSync(join(__dirname, "../components/InsightChat.tsx"), "utf-8");

describe("Placeholder text contrast — WCAG 1.4.3", () => {
  it("decks/[deckId]/page.tsx should not use placeholder:text-stone-400 (2.4:1 on white, fails 4.5:1)", () => {
    expect(decksDetailSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("AnnotationToolbar.tsx should not use placeholder:text-stone-400", () => {
    expect(annotationToolbarSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("SearchBar.tsx should not use placeholder:text-stone-400", () => {
    expect(searchBarSrc).not.toMatch(/placeholder:text-stone-400/);
  });

  it("InsightChat.tsx should not use placeholder:text-gray-400 (2.3:1 on bg-gray-50, fails 4.5:1)", () => {
    expect(insightChatSrc).not.toMatch(/placeholder:text-gray-400/);
  });
});
