/**
 * Regression test for #2342: the import page "Done" status message must use
 * the always-present live region pattern (WCAG 4.1.3) so screen readers
 * announce the completion message when isDone becomes true.
 *
 * Broken pattern: {isDone && <p role="status">Done…</p>}
 * Fixed pattern: always-present <p role="status"> with ternary content
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/import/[bookId]/page.tsx"),
  "utf8",
);

describe("Import page isDone live region — WCAG 4.1.3 (closes #2342)", () => {
  it("done status message is not conditionally mounted on isDone", () => {
    // Broken pattern: {isDone && (<p role="status"...)}
    expect(src).not.toMatch(
      /\{isDone\s*&&\s*\(?\s*\n?\s*<p\s[^>]*role="status"/,
    );
  });

  it("always-present live region exists near the isDone usage", () => {
    // The always-present container should be near the comment
    const idx = src.indexOf("always-present so AT announces the done message");
    expect(idx).toBeGreaterThan(-1);
    const section = src.slice(idx, idx + 300);
    expect(section).toMatch(/role="status"/);
    expect(section).toMatch(/aria-live="polite"/);
  });

  it("done message content uses ternary, not conditional mount", () => {
    const idx = src.indexOf("always-present so AT announces the done message");
    const section = src.slice(idx, idx + 300);
    expect(section).toMatch(/isDone\s*\?/);
  });
});
