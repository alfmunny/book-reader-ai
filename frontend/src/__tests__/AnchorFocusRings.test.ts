/**
 * Regression tests for #2200: focus-visible rings on inline anchor links.
 * Six <a> elements were missing keyboard focus indicators (WCAG 2.4.7).
 */
import * as fs from "fs";
import * as path from "path";

const readerSrc = fs.readFileSync(
  path.join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8"
);

const vocabSrc = fs.readFileSync(
  path.join(__dirname, "../app/vocabulary/page.tsx"),
  "utf8"
);

const chatSrc = fs.readFileSync(
  path.join(__dirname, "../components/InsightChat.tsx"),
  "utf8"
);

describe("Reader page anchor focus rings (closes #2200)", () => {
  it("Button-styled Sign in anchor has focus ring", () => {
    // className contains unique segment; focus-visible:ring-amber-400 is ~190 chars forward
    const idx = readerSrc.indexOf("shrink-0 ml-auto md:ml-0 px-3 py-1.5 rounded-lg border border-amber-300");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 260);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Banner Sign in inline anchor has focus ring", () => {
    // Anchor on the unique surrounding text; className comes after href
    const idx = readerSrc.indexOf("Translation requires an account.");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(idx, idx + 300);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Vocab panel Sign in inline anchor has focus ring", () => {
    // className comes before "Sign in</a> to translate" — look backward
    const idx = readerSrc.indexOf("Sign in</a> to translate this chapter.");
    expect(idx).toBeGreaterThan(-1);
    const window = readerSrc.slice(Math.max(0, idx - 150), idx + 10);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("Vocabulary page anchor focus ring (closes #2200)", () => {
  it("Obsidian export URL link has focus ring", () => {
    // className contains break-all; focus-visible is added after it
    const idx = vocabSrc.indexOf("text-amber-700 underline break-all");
    expect(idx).toBeGreaterThan(-1);
    const window = vocabSrc.slice(idx, idx + 150);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});

describe("InsightChat Gemini API key anchor focus rings (closes #2200)", () => {
  it("Gemini key notice anchor (first) has focus ring", () => {
    // First occurrence ends with Gemini API key</a>{" "}
    const idx = chatSrc.indexOf('Gemini API key</a>{" "}');
    expect(idx).toBeGreaterThan(-1);
    const window = chatSrc.slice(Math.max(0, idx - 150), idx + 10);
    expect(window).toContain("focus-visible:ring-amber-400");
  });

  it("Gemini key chat-panel anchor (second) has focus ring", () => {
    // Second occurrence ends with Gemini API key</a>.
    const idx = chatSrc.indexOf("Gemini API key</a>.");
    expect(idx).toBeGreaterThan(-1);
    const window = chatSrc.slice(Math.max(0, idx - 150), idx + 10);
    expect(window).toContain("focus-visible:ring-amber-400");
  });
});
