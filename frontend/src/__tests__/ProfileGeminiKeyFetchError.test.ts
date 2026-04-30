/**
 * Source-level regression tests for profile page Gemini key fetch-error state (issue #2435).
 */
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../app/profile/page.tsx"),
  "utf8"
);

describe("Profile page — Gemini key fetch-error state (issue #2435)", () => {
  it("declares geminiKeyFetchError state", () => {
    expect(SOURCE).toMatch(/geminiKeyFetchError/);
  });

  it("declares geminiKeyRetryTick state", () => {
    expect(SOURCE).toMatch(/geminiKeyRetryTick/);
  });

  it("sets geminiKeyFetchError true in getMe catch block", () => {
    const fetchIdx = SOURCE.indexOf("getMe()");
    expect(fetchIdx).toBeGreaterThan(-1);
    const snippet = SOURCE.slice(fetchIdx, fetchIdx + 300);
    expect(snippet).toMatch(/setGeminiKeyFetchError\(true\)/);
  });

  it("clears geminiKeyFetchError before the fetch attempt", () => {
    const fetchIdx = SOURCE.indexOf("getMe()");
    const snippet = SOURCE.slice(Math.max(0, fetchIdx - 100), fetchIdx + 300);
    expect(snippet).toMatch(/setGeminiKeyFetchError\(false\)/);
  });

  it("includes geminiKeyRetryTick in the useEffect dependency array", () => {
    expect(SOURCE).toMatch(/geminiKeyRetryTick\]/);
  });

  it("renders error UI with Retry button when key fetch fails", () => {
    expect(SOURCE).toMatch(/geminiKeyFetchError.*Couldn.*t load/s);
  });
});
