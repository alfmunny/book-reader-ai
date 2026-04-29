/**
 * Static-analysis test: AnnotationToolbar must import and call useScrollLock
 * so body scroll is locked while the modal is open, consistent with all other
 * full-screen modal components (BookDetailModal, WordActionDrawer, etc.).
 */
import * as fs from "fs";
import * as path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../components/AnnotationToolbar.tsx"),
  "utf-8"
);

describe("AnnotationToolbar scroll lock", () => {
  it("imports useScrollLock", () => {
    expect(src).toContain("useScrollLock");
  });

  it("calls useScrollLock(true)", () => {
    expect(src).toContain("useScrollLock(true)");
  });
});
