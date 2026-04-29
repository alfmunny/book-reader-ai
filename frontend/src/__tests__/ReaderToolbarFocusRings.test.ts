import * as fs from "fs";
import * as path from "path";

const readerPage = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Reader desktop header toolbar focus rings (closes #2187)", () => {
  it("Previous chapter button (desktop header) has focus ring", () => {
    // First occurrence is in Focus HUD (also has ring); window of 500 covers both
    const idx = readerPage.indexOf("aria-label=\"Previous chapter\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Next chapter button (desktop header) has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Next chapter\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Theme cycle button has focus ring", () => {
    // Use onClick= anchor to target JSX usage, not function definition
    const idx = readerPage.indexOf("onClick={cycleTheme}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 450);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Insight sidebar toggle has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Insight sidebar\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Translate sidebar toggle has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Translate\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Chapter summary toggle has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Chapter summary\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Vocabulary sidebar toggle has focus ring", () => {
    // aria-label is dynamic; use title="Vocabulary" as a stable anchor
    const idx = readerPage.indexOf("title=\"Vocabulary\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Obsidian export button has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Export vocabulary to Obsidian\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Keyboard shortcuts button has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Keyboard shortcuts\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Reader error state buttons focus rings (closes #2187)", () => {
  it("Retry chapter button (amber-700 bg) has focus ring with offset", () => {
    // Use onClick= anchor to skip function definition
    const idx = readerPage.indexOf("onClick={retryChapterLoad}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Back to library button in error state has focus ring", () => {
    const idx = readerPage.indexOf("Back to library");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Bottom prev chapter link has focus ring", () => {
    const idx = readerPage.indexOf("data-testid=\"bottom-prev-chapter\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Bottom next chapter link has focus ring", () => {
    const idx = readerPage.indexOf("data-testid=\"bottom-next-chapter\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 500);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Reader mobile bottom toolbar focus rings (closes #2187)", () => {
  it("Translation toggle (mobile) has focus ring", () => {
    // className comes before aria-label in this button — look backward
    const idx = readerPage.indexOf("aria-label=\"Translation\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 400), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Read aloud button (mobile) has focus ring", () => {
    // className comes before aria-label — look backward from the aria-label
    const idx = readerPage.indexOf("aria-label={ttsIsPlaying ? \"Pause\" : \"Read aloud\"}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 400), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Notes toggle (mobile) has focus ring", () => {
    // className before aria-expanded — look backward
    const idx = readerPage.indexOf("aria-expanded={notesExpanded}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 400), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Insight chat button (mobile) has focus ring", () => {
    const idx = readerPage.indexOf("aria-label=\"Insight chat\"");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 400), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Reader translate panel focus rings (closes #2187)", () => {
  it("Translate this chapter button has focus ring with amber-700 offset", () => {
    // Use onClick= anchor to skip function definition
    const idx = readerPage.indexOf("onClick={handleTranslateThisChapter}");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Retry failed translation button has red focus ring", () => {
    const idx = readerPage.indexOf("Retry failed translation");
    expect(idx).toBeGreaterThan(-1);
    const window = readerPage.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});
