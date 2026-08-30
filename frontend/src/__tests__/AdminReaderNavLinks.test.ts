/**
 * Regression tests for issue #2449 — admin layout "Library" back button and
 * reader "Library" back button / vocab "View all" button must be Link elements
 * not buttons with router.push, so Ctrl+Click / middle-click works and screen
 * readers announce them as links.
 */
import fs from "fs";
import path from "path";

const ADMIN_LAYOUT = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/admin/layout.tsx"),
  "utf8"
);

const READER = fs.readFileSync(
  path.resolve(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

describe("Admin layout — Library back button must be a Link (issue #2449)", () => {
  it("does not use router.push('/') for the Library back navigation", () => {
    // The programmatic router.push('/') in useEffect redirect is acceptable;
    // the interactive header button must NOT use router.push.
    // We check that there is no button with router.push("/") in the JSX header area.
    // The header button pattern was: <button onClick={() => router.push("/")} ...>Library
    expect(ADMIN_LAYOUT).not.toMatch(/<button[^>]*onClick[^>]*router\.push\(["'`]\/["'`]\)/);
  });

});

describe("Reader page — Library back button must be a Link (issue #2449)", () => {
  it("reader toolbar Library button uses Link href=/, not button+router.push", () => {
    // Find the aria-label="Library" button context in the toolbar
    const idx = READER.indexOf('aria-label="Library"');
    expect(idx).toBeGreaterThan(-1);
    // Within 200 chars before the aria-label, there should be no button element
    // (because it's now a Link), and there should be href="/"
    const before = READER.slice(Math.max(0, idx - 200), idx + 50);
    expect(before).not.toMatch(/onClick.*router\.push/);
    expect(before).toMatch(/href=["'`]\/["'`]/);
  });
});

describe("Reader page — vocab 'View all' must be a Link (issue #2449)", () => {
  it("vocab sidebar 'View all' uses Link href=/vocabulary, not button+router.push", () => {
    const idx = READER.indexOf("View all");
    expect(idx).toBeGreaterThan(-1);
    const context = READER.slice(Math.max(0, idx - 300), idx + 50);
    expect(context).not.toMatch(/onClick.*router\.push/);
    expect(context).toMatch(/href=["'`]\/vocabulary["'`]/);
  });
});

describe("Reader page — vocab word lemma link must be a Link (issue #2449)", () => {
  it("vocab word lemma link uses Link with /vocabulary?word=, not button+router.push", () => {
    // Find the vocab lemma navigation
    const idx = READER.indexOf("/vocabulary?word=");
    expect(idx).toBeGreaterThan(-1);
    // The 200 chars before should not have button+onClick+router.push
    const before = READER.slice(Math.max(0, idx - 200), idx + 80);
    expect(before).not.toMatch(/onClick[^>]*router\.push/);
    expect(before).toMatch(/href/);
  });
});
