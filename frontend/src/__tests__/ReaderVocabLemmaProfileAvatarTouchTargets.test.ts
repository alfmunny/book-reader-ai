import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);
const homeSrc = fs.readFileSync(
  path.join(__dirname, "../app/page.tsx"),
  "utf8"
);

describe("reader vocab lemma header button touch target (closes #944)", () => {
  it("vocab lemma header link has min-h-[44px]", () => {
    // Find the lemma header Link that navigates to /vocabulary?word=
    const idx = readerSrc.indexOf('/vocabulary?word=');
    expect(idx).toBeGreaterThan(-1);
    // className is nearby
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});

describe("reader profile avatar link touch target (closes #944)", () => {
  it("reader header profile avatar link has min-w-[44px]", () => {
    // Profile avatar Link is identified by its dynamic title prop (unique — the Gemini banner lacks it)
    const idx = readerSrc.indexOf('title={session.backendUser');
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-w-[44px]");
  });

  it("reader header profile avatar link has min-h-[44px]", () => {
    const idx = readerSrc.indexOf('title={session.backendUser');
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});

describe("homepage profile avatar link touch target (closes #944)", () => {
  it("homepage header profile avatar link has min-w-[44px]", () => {
    // Profile avatar is now a <Link href="/profile"> — anchor on href="/profile"
    const idx = homeSrc.indexOf('href="/profile"');
    expect(idx).toBeGreaterThan(-1);
    const window = homeSrc.slice(idx, idx + 300);
    expect(window).toContain("min-w-[44px]");
  });

  it("homepage header profile avatar link has min-h-[44px]", () => {
    const idx = homeSrc.indexOf('href="/profile"');
    expect(idx).toBeGreaterThan(-1);
    const window = homeSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});
