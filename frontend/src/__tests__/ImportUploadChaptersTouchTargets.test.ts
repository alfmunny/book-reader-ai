import * as fs from "fs";
import * as path from "path";

const importPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/import/[bookId]/page.tsx"),
  "utf8"
);
const chaptersPage = ["../app/(shell)/upload/[bookId]/chapters/page.tsx", "../components/ChapterAuditPanel.tsx"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");

function checkBefore(src: string, anchor: string, before = 300): void {
  const idx = src.indexOf(anchor);
  expect(idx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, idx - before), idx + 20);
  expect(window).toContain("min-h-[44px]");
}

const panelSrc = fs.readFileSync(
  path.join(__dirname, "../components/ChapterAuditPanel.tsx"),
  "utf8"
);

describe("Import and upload-chapters flow touch targets (closes #838)", () => {
  it("Start import button has min-h-[44px]", () => {
    checkBefore(importPage, "Start import");
  });

  it("Skip button has min-h-[44px]", () => {
    checkBefore(importPage, "Skip\n");
  });

  it("Start reading now button has min-h-[44px]", () => {
    checkBefore(importPage, "Start reading now");
  });

  it("Cancel button has min-h-[44px]", () => {
    checkBefore(importPage, "Cancel\n");
  });

  it("Upload chapters Bookshelf link has min-h-[44px]", () => {
    checkBefore(chaptersPage, "Bookshelf\n");
  });

  it("Add-to-shelf button has min-h-[44px]", () => {
    // The finish control lives in the shared panel now.
    checkBefore(panelSrc, "{busy ? \"Working…\"", 600);
  });

  it("Try another file button has min-h-[44px]", () => {
    checkBefore(chaptersPage, "Try another file");
  });
});
