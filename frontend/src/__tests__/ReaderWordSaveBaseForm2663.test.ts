/**
 * Regression test for #2663 — reader → vocabulary save wiring.
 *
 * The tooltip resolves the base form and hands it to `handleWordSave`, which
 * forwards it as `lemma` so the backend skips a redundant lookup. Save paths that
 * have no definition in hand (e.g. the mobile word drawer) must NOT send `lemma`
 * at all — sending the surface word there would suppress the backend's own
 * lookup and silently file the inflected form.
 *
 * Static source analysis: handleWordSave is a closure inside a page component
 * whose full render needs the whole reader stack (auth, TTS, chapters).
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/reader/[bookId]/page.tsx"),
  "utf8",
);

const handler = src.slice(
  src.indexOf("async function handleWordSave"),
  src.indexOf("async function handleWordSave") + 1600,
);

describe("reader vocabulary save passes the base form (#2663)", () => {
  it("handleWordSave takes an optional base form", () => {
    expect(handler).toMatch(/handleWordSave\(\s*word: string,\s*sentenceText: string,\s*baseForm\?: string/);
  });

  it("also takes the definition the tooltip already fetched (#2704)", () => {
    expect(handler).toMatch(/definition\?: WordDefinition \| null/);
  });

  it("only sends the stored meaning when there is one", () => {
    // An empty definitions array must not overwrite a meaning already stored.
    expect(handler).toMatch(/definition\?\.definitions\?\.length/);
  });

  it("only sends `lemma` when a base form was actually resolved", () => {
    // A bare `lemma: word` / `lemma: saved` would defeat the backend fallback.
    expect(handler).toMatch(/\.\.\.\(\s*resolved\s*\?\s*\{\s*lemma:\s*resolved\s*\}\s*:\s*\{\}\s*\)/);
    expect(handler).not.toMatch(/lemma:\s*word\b/);
  });

  it("trims the incoming base form before deciding whether it is present", () => {
    expect(handler).toMatch(/baseForm\?\.trim\(\)/);
  });

  it("the toast announces the word that was actually saved", () => {
    expect(handler).toMatch(/setVocabToastWord\(resolved \|\| word\)/);
  });

  it("the tooltip hands its resolved word and definition to the save handler", () => {
    expect(src).toMatch(/onSave=\{\(wordToSave, definition\) =>/);
    expect(src).toMatch(
      /handleWordSave\(vocabTooltip\.word, vocabTooltip\.context, wordToSave, definition\)/,
    );
  });
});
