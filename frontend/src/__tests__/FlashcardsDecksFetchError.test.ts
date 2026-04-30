/**
 * Source-level regression tests for flashcards page deck selector fetch-error state (issue #2439).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf8"
);

describe("Flashcards page — deck selector fetch-error state (issue #2439)", () => {
  it("declares decksFetchError state", () => {
    expect(SOURCE).toMatch(/decksFetchError/);
  });

  it("declares decksRetryTick state", () => {
    expect(SOURCE).toMatch(/decksRetryTick/);
  });

  it("sets decksFetchError true in listDecks catch block", () => {
    const fetchIdx = SOURCE.indexOf("listDecks()");
    expect(fetchIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(fetchIdx, fetchIdx + 600);
    expect(snippet).toMatch(/setDecksFetchError\(true\)/);
  });

  it("includes decksRetryTick in the useEffect dependency array", () => {
    expect(SOURCE).toMatch(/decksRetryTick\]/);
  });

  it("renders error UI with Retry button when deck fetch fails", () => {
    expect(SOURCE).toMatch(/decksFetchError.*Couldn.*t load/s);
  });
});
