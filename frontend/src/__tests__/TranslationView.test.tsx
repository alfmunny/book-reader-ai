/**
 * Tests for components/TranslationView.tsx
 *
 * Covers:
 *  - Parallel mode: each paragraph paired with its translation in the same row
 *  - Inline mode: translation appears beneath each paragraph
 *  - Loading skeleton shown while translations are pending
 *  - Graceful handling of mismatched paragraph/translation counts
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import TranslationView from "@/components/TranslationView";

const PARAGRAPHS = ["First paragraph.", "Second paragraph.", "Third paragraph."];
const TRANSLATIONS = ["Erster Absatz.", "Zweiter Absatz.", "Dritter Absatz."];

// ── Parallel mode ─────────────────────────────────────────────────────────────

describe("parallel mode", () => {
  it("renders all original paragraphs", () => {
    render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="parallel"
        loading={false}
      />
    );
    PARAGRAPHS.forEach((p) => expect(screen.getByText(p)).toBeInTheDocument());
  });

  it("renders all translations", () => {
    render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="parallel"
        loading={false}
      />
    );
    TRANSLATIONS.forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  });

  it("renders original and translation in the same row (shared grid cell)", () => {
    const { container } = render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="parallel"
        loading={false}
      />
    );
    // Each row is a grid div containing both original and translation
    const rows = container.querySelectorAll(".grid");
    expect(rows.length).toBe(PARAGRAPHS.length);
    rows.forEach((row, i) => {
      expect(row.textContent).toContain(PARAGRAPHS[i]);
      expect(row.textContent).toContain(TRANSLATIONS[i]);
    });
  });

  it("shows loading skeleton when loading and no translations yet", () => {
    const { container } = render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={[]}
        displayMode="parallel"
        loading={true}
      />
    );
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("handles fewer translations than paragraphs without crashing", () => {
    expect(() =>
      render(
        <TranslationView
          paragraphs={PARAGRAPHS}
          translations={["Only one translation"]}
          displayMode="parallel"
          loading={false}
        />
      )
    ).not.toThrow();
    expect(screen.getByText("Only one translation")).toBeInTheDocument();
  });
});

// ── Inline mode ───────────────────────────────────────────────────────────────

describe("inline mode", () => {
  it("renders original paragraphs", () => {
    render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="inline"
        loading={false}
      />
    );
    PARAGRAPHS.forEach((p) => expect(screen.getByText(p)).toBeInTheDocument());
  });

  it("renders translation beneath each paragraph", () => {
    render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="inline"
        loading={false}
      />
    );
    TRANSLATIONS.forEach((t) => expect(screen.getByText(t)).toBeInTheDocument());
  });

  it("shows loading skeleton for the first paragraph when loading", () => {
    const { container } = render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={[]}
        displayMode="inline"
        loading={true}
      />
    );
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("does not show skeleton when translations are already loaded", () => {
    const { container } = render(
      <TranslationView
        paragraphs={PARAGRAPHS}
        translations={TRANSLATIONS}
        displayMode="inline"
        loading={false}
      />
    );
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });
});

// ── Verse / prose rendering ─────────────────────────────────────────────────
//
// Faust's dramatic verse (lines ≤ 60 chars, each ending a metrical unit)
// was being glued by the old `unwrap` that replaced `\n` between verse
// lines with a space. Regression tests for both the verse path and the
// prose path live here.

describe("source text rendering", () => {
  const VERSE = [
    "FAUST.",
    "O Liebe, leihe mir den schnellsten deiner Flügel,",
    "Und führe mich in ihr Gefild!",
  ].join("\n");

  // Matches Gutenberg's 72–80 char plain-text wrap. Multiple lines
  // exceed the 60-char verse threshold, so this paragraph is classified
  // as prose and its mid-sentence breaks are joined.
  const PROSE_HARDWRAPPED = [
    "Call me Ishmael. Some years ago—never mind how long precisely—having",
    "little or no money in my purse, and nothing particular to interest me",
    "on shore, I thought I would sail about a little and see the watery",
    "part of the world.",
  ].join("\n");

  it("preserves verse line breaks on the source side", () => {
    const { container } = render(
      <TranslationView
        paragraphs={[VERSE]}
        translations={["stub"]}
        displayMode="parallel"
        loading={false}
      />,
    );
    const sourceP = container.querySelector("p.whitespace-pre-wrap");
    expect(sourceP).not.toBeNull();
    // The \n's must survive into the rendered text so CSS pre-wrap
    // turns them into line breaks.
    expect(sourceP!.textContent).toContain("FAUST.\nO Liebe");
    expect(sourceP!.textContent).toContain("Flügel,\nUnd führe");
  });

  it("joins prose hard-wraps into flowing text", () => {
    const { container } = render(
      <TranslationView
        paragraphs={[PROSE_HARDWRAPPED]}
        translations={["stub"]}
        displayMode="parallel"
        loading={false}
      />,
    );
    const sourceP = container.querySelector("p.whitespace-pre-wrap");
    expect(sourceP).not.toBeNull();
    // Every mid-sentence \n (not right after a sentence-ending char)
    // should have been collapsed to a space.
    expect(sourceP!.textContent).not.toContain("\n");
    expect(sourceP!.textContent).toContain("how long precisely");
  });
});
