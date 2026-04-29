/**
 * Static assertions: WordActionDrawer error state has a retry button — closes #2293
 */
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/components/WordActionDrawer.tsx"),
  "utf8",
);

describe("WordActionDrawerRetry", () => {
  it("WordActionDrawer has a lookup callback (useCallback)", () => {
    expect(src).toMatch(/useCallback/);
  });

  it("error state contains a retry button", () => {
    const anchor = src.indexOf("{error &&");
    expect(anchor).toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 600);
    expect(block).toMatch(/<button/);
  });

  it("retry button has aria-label for dictionary lookup", () => {
    const anchor = src.indexOf("{error &&");
    const block = src.slice(anchor, anchor + 600);
    expect(block).toMatch(/aria-label.*[Rr]etry/);
  });

  it("retry button renders RetryIcon", () => {
    const anchor = src.indexOf("{error &&");
    const block = src.slice(anchor, anchor + 600);
    expect(block).toMatch(/RetryIcon/);
  });
});
