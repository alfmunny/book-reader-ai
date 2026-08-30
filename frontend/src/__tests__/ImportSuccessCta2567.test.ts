/**
 * Regression test for #2567:
 * "Start reading now" button must remain visible after isDone=true so the
 * user has a manual escape hatch if the auto-redirect is slow or fails.
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/import/[bookId]/page.tsx"),
  "utf8",
);

describe("Import success page keeps 'Start reading' button after done (closes #2567)", () => {
  it("Start reading button is NOT guarded by !isDone", () => {
    // The old broken condition was: started && !isDone && canStartReading
    expect(src).not.toContain("started && !isDone");
  });

  it("Start reading now button is inside a {started &&} block", () => {
    const startReadingIdx = src.indexOf("Start reading now");
    expect(startReadingIdx).not.toBe(-1);
    const context = src.slice(Math.max(0, startReadingIdx - 600), startReadingIdx + 50);
    expect(context).toContain("started &&");
    expect(context).not.toContain("started && !isDone");
  });

  it("Cancel button is hidden when isDone", () => {
    // After done, Cancel (which goes to home) should not show
    expect(src).toContain("!isDone");
    // !isDone should guard at minimum the Cancel button
    const cancelIdx = src.indexOf("Cancel");
    expect(cancelIdx).not.toBe(-1);
    const context = src.slice(Math.max(0, cancelIdx - 500), cancelIdx + 50);
    expect(context).toContain("!isDone");
  });
});
