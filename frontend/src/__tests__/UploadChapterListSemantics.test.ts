import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/upload/[bookId]/chapters/page.tsx"),
  "utf-8"
);

describe("upload/[bookId]/chapters/page.tsx chapter list semantics (WCAG 1.3.1)", () => {
  it("chapter list container uses <ul role=\"list\">", () => {
    expect(src).toMatch(/<ul role="list" aria-label="Chapters"/);
  });

  it("each chapter wrapped in <li>", () => {
    expect(src).toMatch(/<li key=\{ch\.original_index/);
  });

  it("chapters.map is inside <ul role=\"list\">", () => {
    const ulMatch = src.match(/<ul role="list"[^>]*>[\s\S]*?chapters\.map/);
    expect(ulMatch).not.toBeNull();
  });

  it("no bare <div> directly wraps chapters.map", () => {
    // The pattern <div ...> immediately containing chapters.map without a ul wrapper
    expect(src).not.toMatch(/<div[^>]*>\s*\{chapters\.map/);
  });
});
