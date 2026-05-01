/**
 * Regression: handleEnqueueAll must not use alert() for feedback.
 * Inline toast state replaces blocking browser dialog.
 * Closes #2617
 */
import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("Reader enqueue-all alert → toast (#2617)", () => {
  const src = read("src/app/reader/[bookId]/page.tsx");

  it("handleTranslateWholeBook does not call alert()", () => {
    const fnStart = src.indexOf("async function handleTranslateWholeBook");
    expect(fnStart).toBeGreaterThan(-1);
    // Find the end of the function by locating the next top-level async function after it
    const nextFn = src.indexOf("\n  async function ", fnStart + 1);
    const fnBody = src.slice(fnStart, nextFn > 0 ? nextFn : fnStart + 3000);
    expect(fnBody).not.toMatch(/\balert\s*\(/);
  });

  it("declares an enqueueToast state variable for feedback", () => {
    expect(src).toMatch(/enqueueToast/);
  });

  it("enqueueToast banner uses role=status or role=alert for AT", () => {
    const match = src.match(
      /enqueueToast[\s\S]{0,300}?role=["'](status|alert)["']|role=["'](status|alert)["'][\s\S]{0,300}?enqueueToast/,
    );
    expect(match).not.toBeNull();
  });
});
