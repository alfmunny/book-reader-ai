import fs from "fs";
import path from "path";

const errorPage = fs.readFileSync(
  path.resolve(__dirname, "../app/error.tsx"), "utf8");
const pendingPage = fs.readFileSync(
  path.resolve(__dirname, "../app/pending/page.tsx"), "utf8");
const uploadPage = fs.readFileSync(
  path.resolve(__dirname, "../app/upload/page.tsx"), "utf8");
const chaptersPage = fs.readFileSync(
  path.resolve(__dirname, "../app/upload/[bookId]/chapters/page.tsx"), "utf8");
const importPage = fs.readFileSync(
  path.resolve(__dirname, "../app/import/[bookId]/page.tsx"), "utf8");

describe("error.tsx button focus rings (closes #2185)", () => {
  it("Try again button (amber-700 bg) has focus ring with offset", () => {
    const idx = errorPage.indexOf("reset()");
    expect(idx).toBeGreaterThan(-1);
    const window = errorPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });
});

describe("pending/page.tsx button focus rings (closes #2185)", () => {
  it("Sign out button has red focus ring", () => {
    const idx = pendingPage.indexOf("Sign out");
    expect(idx).toBeGreaterThan(-1);
    const window = pendingPage.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});

describe("upload/page.tsx button focus rings (closes #2185)", () => {
  it("Sign in button (amber-700 bg) has focus ring with offset", () => {
    // Skip the isAuthenticated check branch, find the sign-in button
    const idx = uploadPage.indexOf('router.push("/login")');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Back button has focus ring", () => {
    const idx = uploadPage.indexOf('router.push("/")');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("upload/[bookId]/chapters/page.tsx button focus rings (closes #2185)", () => {
  it("error retry button (amber-700 bg) has focus ring with offset", () => {
    // Skip function definition and useEffect — find onClick={loadChapters}
    const def1 = chaptersPage.indexOf("loadChapters");
    const def2 = chaptersPage.indexOf("loadChapters", def1 + 1);
    const idx = chaptersPage.indexOf("loadChapters", def2 + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = chaptersPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Back button in header has focus ring", () => {
    const idx = chaptersPage.indexOf("ArrowLeftIcon");
    // Skip import — find usage in JSX
    const usageIdx = chaptersPage.indexOf("ArrowLeftIcon", idx + 1);
    expect(usageIdx).toBeGreaterThan(-1);
    const window = chaptersPage.slice(Math.max(0, usageIdx - 300), usageIdx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Save/Import button (amber-700 bg) has focus ring with offset", () => {
    // Skip function definition — find onClick={handleConfirm}
    const defIdx = chaptersPage.indexOf("handleConfirm");
    const idx = chaptersPage.indexOf("handleConfirm", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = chaptersPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });
});

describe("import/[bookId]/page.tsx button focus rings (closes #2185)", () => {
  it("Start import button (amber-700 bg) has focus ring with offset", () => {
    // Skip function definition — find onClick={startImport}
    const defIdx = importPage.indexOf("startImport");
    const idx = importPage.indexOf("startImport", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = importPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Skip button has focus ring", () => {
    // Skip = router.push(nextUrl) in the Skip button, find the JSX button text
    const idx = importPage.indexOf("Skip");
    expect(idx).toBeGreaterThan(-1);
    const window = importPage.slice(Math.max(0, idx - 400), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Start reading now button (amber-700 bg) has focus ring with offset", () => {
    // Skip function definition — find onClick={skipToReading}
    const defIdx = importPage.indexOf("skipToReading");
    const idx = importPage.indexOf("skipToReading", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = importPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Cancel button has focus ring", () => {
    // Skip function definition — find onClick={cancel}
    const defIdx = importPage.indexOf("cancel");
    const idx = importPage.indexOf("cancel", defIdx + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = importPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
