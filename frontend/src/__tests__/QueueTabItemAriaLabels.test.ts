/**
 * Regression test for #1899: queue-item Retry/Del buttons and API-key Clear
 * button must have context-rich aria-labels (WCAG 2.4.6).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../components/QueueTab.tsx"),
  "utf8",
);

describe("QueueTab queue-item button accessible names (closes #1899)", () => {
  it("Retry button has aria-label referencing book_title and target_language", () => {
    // The Retry button's aria-label must include book context
    expect(src).toContain("it.book_title");
    // Find the section near the Retry button text
    const retryIdx = src.lastIndexOf(">\\n                      Retry");
    // Alternatively just check the aria-label template contains the right variables
    expect(src).toMatch(/aria-label=\{`Retry \$\{it\.book_title[\s\S]{1,200}target_language\}`\}/);
  });

  it("Del button has aria-label with 'Remove' and book context", () => {
    expect(src).toMatch(/aria-label=\{`Remove \$\{it\.book_title[\s\S]{1,200}target_language[\s\S]{1,30}queue`\}/);
  });

  it("API-key Clear button has descriptive aria-label", () => {
    expect(src).toContain('aria-label="Clear Gemini API key"');
  });
});
