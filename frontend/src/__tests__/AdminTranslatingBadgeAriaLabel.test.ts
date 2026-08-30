/**
 * Regression test for #2146 — admin books page "translating" badge
 * must not produce aria-label="Translating to null" when active_language is null.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/books/page.tsx"),
  "utf8",
);

describe("Admin books translating badge aria-label null-safety (closes #2146)", () => {
  it("aria-label uses null-guard so active_language=null never produces 'Translating to null'", () => {
    // Must use a ternary or ?? to guard against null active_language
    const nullGuardPattern =
      /aria-label=\{.*active_language.*\?.*Translating to.*:.*Translating/s;
    expect(src).toMatch(nullGuardPattern);
  });

  it("visible text uses null-guard so active_language=null is not rendered literally", () => {
    // The visible "translating → {b.active_language}" must also be guarded
    // Pattern: active_language should be conditional in the visible text node too
    const rawNullRisk = /translating → \{b\.active_language\}/;
    expect(src).not.toMatch(rawNullRisk);
  });
});
