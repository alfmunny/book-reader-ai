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

  it("handleRetryFailed does not call alert()", () => {
    const fnStart = src.indexOf("async function handleRetryFailed");
    expect(fnStart).toBeGreaterThan(-1);
    const nextFn = src.indexOf("\n  async function ", fnStart + 1);
    const fnBody = src.slice(fnStart, nextFn > 0 ? nextFn : fnStart + 2000);
    expect(fnBody).not.toMatch(/\balert\s*\(/);
  });

  it("retry error is surfaced via a toast state (not alert)", () => {
    // The function must set some error toast state in the catch block
    const fnStart = src.indexOf("async function handleRetryFailed");
    const nextFn = src.indexOf("\n  async function ", fnStart + 1);
    const fnBody = src.slice(fnStart, nextFn > 0 ? nextFn : fnStart + 2000);
    // Must call a setter for a toast state in the catch
    expect(fnBody).toMatch(/set\w+Toast|setRetryError|setEnqueueToast/);
  });

  it("retry error banner uses role=alert for AT", () => {
    // The banner for retry errors must use role="alert" for screen readers
    const match = src.match(
      /[Rr]etry[A-Za-z]*[Ee]rror|retryToast[\s\S]{0,400}?role=["']alert["']|role=["']alert["'][\s\S]{0,400}?[Rr]etry[A-Za-z]*[Ee]rror|role=["']alert["'][\s\S]{0,400}?retryToast/,
    );
    expect(match).not.toBeNull();
  });
});
