/**
 * Static assertions: TranslationView skeleton loaders have role=status with aria-label.
 * Closes #1109
 */
import fs from "fs";
import path from "path";

const view = fs.readFileSync(
  path.join(process.cwd(), "src/components/TranslationView.tsx"),
  "utf8",
);

describe("TranslationView skeleton loaders", () => {
  it("contains role=status with aria-label for translation loading", () => {
    expect(view).toMatch(/role="status"[^>]*aria-label="Loading translation"|aria-label="Loading translation"[^>]*role="status"/);
  });

  it("has at least 2 role=status occurrences (parallel + inline mode)", () => {
    const matches = view.match(/role="status"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
