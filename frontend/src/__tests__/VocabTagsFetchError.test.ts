/**
 * Source-level regression tests for vocabulary page tag filter fetch-error state (issue #2431).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/(shell)/vocabulary/page.tsx"),
  "utf8"
);

describe("Vocabulary page — tag filter fetch-error state (issue #2431)", () => {
  it("declares tagsFetchError state", () => {
    expect(SOURCE).toMatch(/tagsFetchError/);
  });

  it("declares tagsRetryTick state", () => {
    expect(SOURCE).toMatch(/tagsRetryTick/);
  });

  it("sets tagsFetchError on listVocabularyTags rejection", () => {
    const fetchIdx = SOURCE.indexOf("listVocabularyTags()");
    expect(fetchIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(fetchIdx, fetchIdx + 200);
    expect(snippet).toMatch(/setTagsFetchError\(true\)/);
  });

  it("renders error UI with Retry button when fetch fails", () => {
    expect(SOURCE).toMatch(/tagsFetchError.*Couldn.*t load tags/s);
  });

  it("includes tagsRetryTick in the useEffect dependency array", () => {
    const depsIdx = SOURCE.indexOf("tagsRetryTick]");
    expect(depsIdx).toBeGreaterThan(-1);
  });
});
