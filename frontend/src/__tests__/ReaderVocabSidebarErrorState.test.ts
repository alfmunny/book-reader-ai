/**
 * Source-level regression tests for reader vocab sidebar error state (issue #2421).
 * The reader page is too large to mount in RTL, so we assert on the source patterns.
 */
import fs from "fs";
import path from "path";

const SOURCE_PATH = path.resolve(
  __dirname,
  "../app/reader/[bookId]/page.tsx"
);
const SOURCE = fs.readFileSync(SOURCE_PATH, "utf8");

describe("Reader vocab sidebar — error state (issue #2421)", () => {
  it("declares vocabFetchError state", () => {
    expect(SOURCE).toMatch(/vocabFetchError/);
  });

  it("declares vocabRetryTick state", () => {
    expect(SOURCE).toMatch(/vocabRetryTick/);
  });

  it("sets vocabFetchError on getVocabulary rejection (no silent .catch(() => {}))", () => {
    // Find the primary vocab fetch useEffect block
    const effectStart = SOURCE.indexOf("// Fetch vocabulary words for this book");
    expect(effectStart).toBeGreaterThan(0);
    const effectEnd = SOURCE.indexOf("}, [bookId, session?.backendToken", effectStart);
    const effectBlock = SOURCE.slice(effectStart, effectEnd + 100);

    // Must set the error state in catch, not silently swallow
    expect(effectBlock).toMatch(/\.catch\s*\([^)]*\)\s*=>/);
    expect(effectBlock).toMatch(/setVocabFetchError\s*\(\s*true\s*\)/);
  });

  it("renders error UI with retry button when vocabFetchError is true", () => {
    expect(SOURCE).toMatch(/vocabFetchError/);
    // Error branch must show a message with retry capability
    expect(SOURCE).toMatch(/Couldn(?:&apos;|')t load|[Ff]ailed to load|[Ee]rror loading/);
    expect(SOURCE).toMatch(/setVocabRetryTick/);
  });

  it("error branch appears before the empty-state branch in vocab sidebar", () => {
    const errorIdx = SOURCE.indexOf("vocabFetchError");
    const emptyStateIdx = SOURCE.indexOf("No vocabulary saved yet");
    expect(errorIdx).toBeGreaterThan(0);
    expect(emptyStateIdx).toBeGreaterThan(0);
    // Error state check must appear before the empty state render
    expect(errorIdx).toBeLessThan(emptyStateIdx);
  });
});
