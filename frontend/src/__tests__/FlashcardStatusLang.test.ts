/**
 * Regression for #2273 — flashcard status counter must wrap the foreign word
 * in a lang-attributed span (WCAG 3.1.2 Language of Parts, Level AA).
 *
 * The status counter is aria-live="polite" so screen readers announce the word.
 * Without a lang attribute the pronunciation engine defaults to English.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf-8"
);

describe("Flashcard status counter lang attribute (closes #2273)", () => {
  it("status counter uses JSX span with lang for the word, not a template literal", () => {
    // Anchor: the unique aria-live status paragraph
    const anchor = src.indexOf('role="status" aria-live="polite" aria-atomic="true"');
    expect(anchor).toBeGreaterThan(-1);
    // Look forward 300 chars to capture the counter content
    const block = src.slice(anchor, anchor + 300);
    // Must NOT have the bare template literal form
    expect(block).not.toMatch(/`:\s*\$\{currentCard\.word\}`/);
    // Must have a span with lang wrapping the word
    expect(block).toMatch(/lang=\{currentCard\.language/);
  });
});
