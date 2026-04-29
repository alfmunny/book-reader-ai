/**
 * Regression for #2258 — flashcard review page must add lang attribute on
 * foreign-language vocabulary words and context sentences so screen readers
 * pronounce them correctly (WCAG 3.1.2 Language of Parts, Level AA).
 */
import { readFileSync } from "fs";
import { join } from "path";

const page = readFileSync(
  join(__dirname, "../app/vocabulary/flashcards/page.tsx"),
  "utf-8"
);

const api = readFileSync(
  join(__dirname, "../lib/api.ts"),
  "utf-8"
);

describe("Flashcard review page lang attribute (closes #2258)", () => {
  it("Flashcard interface includes language field", () => {
    // The Flashcard interface must have a language field for the lang attribute
    const idx = api.indexOf("export interface Flashcard");
    expect(idx).toBeGreaterThan(-1);
    const block = api.slice(idx, idx + 300);
    expect(block).toMatch(/language\??\s*:/);
  });

  it("flashcard word span has lang attribute", () => {
    // The word is rendered in a font-serif text-3xl span
    const idx = page.indexOf('"font-serif text-3xl text-ink font-bold text-center"');
    expect(idx).toBeGreaterThan(-1);
    const window = page.slice(idx, idx + 80);
    expect(window).toMatch(/lang=\{currentCard\.language/);
  });

  it("flashcard context paragraph has lang attribute", () => {
    // The context is rendered in a font-serif text-base paragraph; lang is before className
    const idx = page.indexOf('"font-serif text-base text-ink leading-relaxed"');
    expect(idx).toBeGreaterThan(-1);
    const before = page.slice(Math.max(0, idx - 60), idx);
    expect(before).toMatch(/lang=\{currentCard\.language/);
  });
});
