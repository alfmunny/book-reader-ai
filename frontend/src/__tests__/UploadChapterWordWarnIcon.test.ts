/**
 * Regression test for #2503:
 * The word-count warning pill must include a non-color indicator (AlertCircleIcon)
 * when a chapter's word count is outside the expected range (< 100 or > 8000).
 * Color alone is insufficient per WCAG 1.4.1 (Use of Color).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8",
);

describe("Upload chapter word-count warning pill has non-color indicator (closes #2503)", () => {
  it("renders an AlertCircleIcon inside the word-count pill when wordWarn is true", () => {
    // The fix must conditionally render AlertCircleIcon when wordWarn is true
    expect(src).toMatch(/wordWarn.*AlertCircleIcon|AlertCircleIcon.*wordWarn/s);
  });

  it("applies inline-flex and gap classes to the pill span for icon alignment", () => {
    // The span must use inline-flex so the icon and text align properly
    expect(src).toMatch(/inline-flex.*items-center.*gap|gap.*items-center.*inline-flex/);
  });

  it("adds aria-hidden to the warning icon so it is decorative", () => {
    // The icon is purely visual; the amber color + text still convey the warning
    const iconSection = src.match(/wordWarn[\s\S]{0,200}AlertCircleIcon[\s\S]{0,100}/);
    expect(iconSection).not.toBeNull();
    expect(iconSection![0]).toMatch(/aria-hidden/);
  });
});
