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
  it("vocab lemma header button has min-h-[44px]", () => {
    // Find the lemma header button that navigates to /vocabulary
    const idx = readerSrc.indexOf('router.push(`/vocabulary?word=');
    expect(idx).toBeGreaterThan(-1);
    // className comes after onClick in the JSX
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});

describe("reader profile avatar button touch target (closes #944)", () => {
  it("reader header profile avatar button has min-w-[44px]", () => {
    const idx = readerSrc.indexOf('router.push("/profile")');
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-w-[44px]");
  });

  it("reader header profile avatar button has min-h-[44px]", () => {
    const idx = readerSrc.indexOf('router.push("/profile")');
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});

describe("homepage profile avatar button touch target (closes #944)", () => {
  it("homepage header profile avatar button has min-w-[44px]", () => {
    // Find the profile button that navigates to /profile
    const idx = homeSrc.indexOf('router.push("/profile")');
    expect(idx).toBeGreaterThan(-1);
    const window = homeSrc.slice(idx, idx + 300);
    expect(window).toContain("min-w-[44px]");
  });

  it("homepage header profile avatar button has min-h-[44px]", () => {
    const idx = homeSrc.indexOf('router.push("/profile")');
    expect(idx).toBeGreaterThan(-1);
    const window = homeSrc.slice(idx, idx + 300);
    expect(window).toContain("min-h-[44px]");
  });
});
