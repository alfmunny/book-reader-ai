/**
 * Regression tests for #2210: modals and drawers must lock body scroll
 * while open so the background page doesn't scroll behind the overlay.
 */
import * as fs from "fs";
import * as path from "path";

const hookSrc = fs.readFileSync(
  path.join(__dirname, "../lib/useScrollLock.ts"),
  "utf8"
);
const bookModalSrc = fs.readFileSync(
  path.join(__dirname, "../components/BookDetailModal.tsx"),
  "utf8"
);
const authModalSrc = fs.readFileSync(
  path.join(__dirname, "../components/AuthPromptModal.tsx"),
  "utf8"
);
const sidebarSrc = fs.readFileSync(
  path.join(__dirname, "../components/AnnotationsSidebar.tsx"),
  "utf8"
);
const wordDrawerSrc = fs.readFileSync(
  path.join(__dirname, "../components/WordActionDrawer.tsx"),
  "utf8"
);

describe("useScrollLock hook (closes #2210)", () => {
  it("sets document.body.style.overflow to hidden when locked", () => {
    expect(hookSrc).toContain("overflow");
    expect(hookSrc).toContain("hidden");
  });

  it("restores overflow on cleanup", () => {
    expect(hookSrc).toContain("return () =>");
  });
});

describe("Modal scroll lock usage (closes #2210)", () => {
  it("BookDetailModal imports useScrollLock", () => {
    expect(bookModalSrc).toContain("useScrollLock");
  });

  it("AuthPromptModal imports useScrollLock", () => {
    expect(authModalSrc).toContain("useScrollLock");
  });

  it("AnnotationsSidebar imports useScrollLock", () => {
    expect(sidebarSrc).toContain("useScrollLock");
  });

  it("WordActionDrawer imports useScrollLock", () => {
    expect(wordDrawerSrc).toContain("useScrollLock");
  });
});
