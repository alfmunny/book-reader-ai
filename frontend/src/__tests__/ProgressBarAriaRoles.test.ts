/**
 * Regression tests for #1251: progress bars must have role="progressbar"
 * and ARIA value attributes so screen readers can announce progress.
 */
import * as fs from "fs";
import * as path from "path";

function read(rel: string) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("Import page chapter translation progress bar (closes #1251)", () => {
  const src = read("../app/import/[bookId]/page.tsx");

  it("has role=progressbar", () => {
    const idx = src.indexOf("STAGE_LABELS[stage]} progress`}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 300), idx + 50);
    expect(window).toContain('role="progressbar"');
  });

  it("has aria-valuenow", () => {
    const idx = src.indexOf("STAGE_LABELS[stage]} progress`}");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 150), idx + 50);
    expect(window).toContain("aria-valuenow");
  });
});

describe("Flashcards study progress bar (closes #1251)", () => {
  const src = read("../app/vocabulary/flashcards/page.tsx");

  it("has role=progressbar", () => {
    const idx = src.indexOf("Study progress");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain('role="progressbar"');
  });

  it("has aria-valuenow", () => {
    const idx = src.indexOf("Study progress");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(window).toContain("aria-valuenow");
  });
});

describe("Upload quota progress bar (closes #1251)", () => {
  const src = read("../app/upload/page.tsx");

  it("has role=progressbar", () => {
    const idx = src.indexOf("Upload quota");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 250), idx + 50);
    expect(window).toContain('role="progressbar"');
  });

  it("has aria-label referencing quota", () => {
    expect(src).toContain("Upload quota");
  });
});

describe("Reader page reading progress bar (closes #1251)", () => {
  const src = read("../app/reader/[bookId]/page.tsx");

  it("has role=progressbar", () => {
    const idx = src.indexOf("Reading progress");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 200);
    expect(window).toContain('role="progressbar"');
  });

  it("has aria-valuenow", () => {
    const idx = src.indexOf("Reading progress");
    expect(idx).toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, idx - 50), idx + 300);
    expect(window).toContain("aria-valuenow");
  });
});

describe("SeedPopularButton seeding progress bar (closes #1251)", () => {
  const src = read("../components/SeedPopularButton.tsx");

  it("has role=progressbar", () => {
    const idx = src.indexOf("Seeding progress");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 200), idx + 50);
    expect(region).toContain('role="progressbar"');
  });

  it("has aria-valuenow", () => {
    const idx = src.indexOf("Seeding progress");
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 100), idx + 50);
    expect(region).toContain("aria-valuenow");
  });
});
