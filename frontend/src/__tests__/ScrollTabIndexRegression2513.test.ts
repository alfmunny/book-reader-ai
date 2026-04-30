/**
 * Regression tests for #2513:
 * Display-only scrollable containers in QueueTab (activity log),
 * SeedPopularButton (recent events log), and VocabWordTooltip (definition body)
 * must have tabIndex={0} so keyboard users can focus and scroll them.
 * (WCAG 2.1.1 Keyboard, Level A)
 *
 * Static source-code analysis: cheaper than a full render and pinpoints
 * the exact pattern that must not regress.
 */
import fs from "fs";
import path from "path";

const queueTabSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/QueueTab.tsx"),
  "utf-8",
);

const seedButtonSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/SeedPopularButton.tsx"),
  "utf-8",
);

const vocabTooltipSrc = fs.readFileSync(
  path.resolve(__dirname, "../components/VocabWordTooltip.tsx"),
  "utf-8",
);

describe("Scrollable display-only containers — WCAG 2.1.1 (closes #2513)", () => {
  it("QueueTab activity-log ul has tabIndex={0}", () => {
    const regex =
      /max-h-60[^>]*overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*max-h-60[^>]*overflow-y-auto/;
    expect(queueTabSrc).toMatch(regex);
  });

  it("SeedPopularButton recent-events ul has tabIndex={0}", () => {
    const regex =
      /max-h-40[^>]*overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*max-h-40[^>]*overflow-y-auto/;
    expect(seedButtonSrc).toMatch(regex);
  });

  it("VocabWordTooltip definition body div has tabIndex={0}", () => {
    const regex =
      /max-h-40[^>]*overflow-y-auto[^>]*tabIndex=\{0\}|tabIndex=\{0\}[^>]*max-h-40[^>]*overflow-y-auto/;
    expect(vocabTooltipSrc).toMatch(regex);
  });
});
