import * as fs from "fs";
import * as path from "path";

const importPage = fs.readFileSync(
  path.join(__dirname, "../app/import/[bookId]/page.tsx"),
  "utf8"
);
const chaptersPage = fs.readFileSync(
  path.join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf8"
);

function checkBefore(src: string, anchor: string, before = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - before), idx + 20);
  expect(window).toContain("min-h-[44px]");
}

describe("Import and upload-chapters flow touch targets (closes #838)", () => {
  it("Start import button has min-h-[44px]", () => {
    checkBefore(importPage, "Start import");
  });

  it("Skip button has min-h-[44px]", () => {
    checkBefore(importPage, "Skip\n");
  });

  it("Translate in background button has min-h-[44px]", () => {
    checkBefore(importPage, "Translate in background");
  });

  it("Skip for now button has min-h-[44px]", () => {
    checkBefore(importPage, "Skip for now");
  });

  it("Start reading now button has min-h-[44px]", () => {
    checkBefore(importPage, "Start reading now");
  });

  it("Cancel button has min-h-[44px]", () => {
    checkBefore(importPage, "Cancel\n");
  });

  it("Upload chapters Back button has min-h-[44px]", () => {
    checkBefore(chaptersPage, "Back\n");
  });

  it("Confirm & Start Reading button has min-h-[44px]", () => {
    checkBefore(chaptersPage, "Confirm & Start Reading", 400);
  });

  it("Try another file button has min-h-[44px]", () => {
    checkBefore(chaptersPage, "Try another file");
  });
});
