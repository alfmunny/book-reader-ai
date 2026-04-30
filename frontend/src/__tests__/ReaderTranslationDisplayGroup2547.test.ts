/**
 * Regression tests for #2547:
 * The "Display" mode toggle group in the reader translation sidebar
 * must use role="group" + aria-labelledby rather than an orphan <label>
 * without htmlFor (WCAG 1.3.1).
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "..", "app/reader/[bookId]/page.tsx"),
  "utf-8"
);

describe("Reader translation Display group has group role and label (closes #2547)", () => {
  it("Display toggle buttons are wrapped in role=group", () => {
    expect(src).toMatch(/role="group"[^>]*aria-labelledby="reader-trans-display-label"|aria-labelledby="reader-trans-display-label"[^>]*role="group"/);
  });

  it("Group label element has the correct id", () => {
    expect(src).toContain('id="reader-trans-display-label"');
  });

  it("No orphan <label> without htmlFor containing just 'Display'", () => {
    // The old pattern: <label ...>Display</label> with no htmlFor
    expect(src).not.toMatch(/<label(?![^>]*htmlFor)[^>]*>\s*Display\s*<\/label>/);
  });
});
