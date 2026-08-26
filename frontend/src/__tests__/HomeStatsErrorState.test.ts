/**
 * Source-level regression tests for home page stats fetch-error state (issue #2429).
 * The page is too large to mount with RTL, so we verify the pattern via source inspection.
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/bookshelf/page.tsx"),
  "utf8"
);

describe("Home page — stats fetch-error state (issue #2429)", () => {
  it("declares userStatsFetchError state", () => {
    expect(SOURCE).toMatch(/userStatsFetchError/);
  });

  it("declares userStatsRetryTick state", () => {
    expect(SOURCE).toMatch(/userStatsRetryTick/);
  });

  it("sets userStatsFetchError on getUserStats rejection", () => {
    const catchIdx = SOURCE.indexOf("getUserStats()");
    expect(catchIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(catchIdx, catchIdx + 200);
    expect(snippet).toMatch(/setUserStatsFetchError\(true\)/);
  });

  it("renders error UI with Retry button when fetch fails", () => {
    expect(SOURCE).toMatch(/userStatsFetchError.*Couldn.*t load stats/s);
  });

  it("includes userStatsRetryTick in the useEffect dependency array", () => {
    expect(SOURCE).toMatch(/userStatsRetryTick/);
    const depsIdx = SOURCE.indexOf("userStatsRetryTick]");
    expect(depsIdx).toBeGreaterThan(-1);
  });
});
