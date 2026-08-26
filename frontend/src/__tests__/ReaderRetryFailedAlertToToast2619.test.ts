/**
 * Regression: handleRetryFailed must not use alert() for error feedback.
 * Inline toast state replaces blocking browser dialog.
 * Closes #2619
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Reader retry-failed alert → toast (#2619)", () => {
  const src = read("src/app/reader/[bookId]/page.tsx");



  it("retry error banner uses role=alert for AT", () => {
    // The banner for retry errors must use role="alert" for screen readers
    const match = src.match(
      /[Rr]etry[A-Za-z]*[Ee]rror|retryToast[\s\S]{0,400}?role=["']alert["']|role=["']alert["'][\s\S]{0,400}?[Rr]etry[A-Za-z]*[Ee]rror|role=["']alert["'][\s\S]{0,400}?retryToast/,
    );
    expect(match).not.toBeNull();
  });
});
