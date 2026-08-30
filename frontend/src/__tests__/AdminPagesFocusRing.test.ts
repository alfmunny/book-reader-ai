import * as fs from "fs";
import * as path from "path";

const booksPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/books/page.tsx"),
  "utf8"
);
const usersPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/users/page.tsx"),
  "utf8"
);
const uploadsPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/uploads/page.tsx"),
  "utf8"
);
const audioPage = fs.readFileSync(
  path.join(__dirname, "../app/(shell)/admin/audio/page.tsx"),
  "utf8"
);

describe("(shell)/admin/books focus rings (closes #2178)", () => {
  it("Import Book button has focus-visible ring (amber-700 bg)", () => {
    const idx = booksPage.indexOf("Import Book");
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
    expect(window).toContain("ring-offset-amber-700");
  });

  it("Confirm action button has focus-visible ring", () => {
    const first = booksPage.indexOf('aria-label="Confirm action"');
    const idx = booksPage.indexOf('aria-label="Confirm action"', first + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Cancel action button has focus-visible ring", () => {
    const idx = booksPage.indexOf('aria-label="Cancel action"');
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Dismiss error button has focus-visible ring", () => {
    const idx = booksPage.indexOf('aria-label="Dismiss error"');
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Delete book button has focus-visible ring (red)", () => {
    const idx = booksPage.indexOf("Delete ${b.title}");
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Open reader button has focus-visible ring", () => {
    const idx = booksPage.indexOf("Open reader for");
    expect(idx).toBeGreaterThan(-1);
    const window = booksPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("(shell)/admin/users focus rings (closes #2178)", () => {
  it("Retry button has focus-visible ring (amber-700 bg)", () => {
    // Skip "RetryIcon" import and JSX component usage; find standalone button text
    const lastIcon = usersPage.lastIndexOf("RetryIcon");
    const idx = usersPage.indexOf("Retry", lastIcon + 1);
    expect(idx).toBeGreaterThan(-1);
    const window = usersPage.slice(Math.max(0, idx - 300), idx + 20);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Dismiss error button has focus-visible ring (red)", () => {
    const idx = usersPage.indexOf('aria-label="Dismiss error"');
    expect(idx).toBeGreaterThan(-1);
    const window = usersPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Approve/Revoke button has focus-visible ring", () => {
    const idx = usersPage.indexOf("Revoke ${u.name}");
    expect(idx).toBeGreaterThan(-1);
    const window = usersPage.slice(idx, idx + 400);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Confirm delete button has focus-visible ring (red)", () => {
    const idx = usersPage.indexOf("Confirm delete");
    expect(idx).toBeGreaterThan(-1);
    const window = usersPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Delete user button has focus-visible ring (red)", () => {
    const idx = usersPage.indexOf("Delete ${u.name}");
    expect(idx).toBeGreaterThan(-1);
    const window = usersPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});

describe("(shell)/admin/uploads focus rings (closes #2178)", () => {
  it("Filter button has focus-visible ring", () => {
    const idx = uploadsPage.indexOf('aria-label="Filter uploads"');
    expect(idx).toBeGreaterThan(-1);
    const window = uploadsPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Open book button has focus-visible ring", () => {
    const idx = uploadsPage.indexOf("Open ${u.title}");
    expect(idx).toBeGreaterThan(-1);
    const window = uploadsPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("(shell)/admin/audio focus rings (closes #2178)", () => {
  it("Dismiss error button has focus-visible ring (red)", () => {
    const idx = audioPage.indexOf('aria-label="Dismiss error"');
    expect(idx).toBeGreaterThan(-1);
    const window = audioPage.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-red-400");
  });

  it("Delete audio button has focus-visible ring (red)", () => {
    const idx = audioPage.indexOf("Delete audio for Book");
    expect(idx).toBeGreaterThan(-1);
    const window = audioPage.slice(idx, idx + 350);
    expect(window).toContain("focus-visible:ring-red-400");
  });
});
