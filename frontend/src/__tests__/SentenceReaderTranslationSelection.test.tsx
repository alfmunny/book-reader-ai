/**
 * Owner report (2026-08-26): selecting across a paragraph in translation mode
 * (Faust, parallel layout) grabs the original text AND the adjacent
 * translation — the DOM interleaves them per paragraph.
 *
 * Selection is now origin-aware: a drag starting in the original text cannot
 * select translation blocks (select-none), and a drag starting inside a
 * translation cannot select the original. Default favors the original text,
 * so highlight/word/chat selections stay clean; clicking into a translation
 * first still allows copying it.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

const TEXT = "Die Sonne tönt, nach alter Weise.\n\nEs schäumt das Meer in breiten Flüssen.";
const TRANSLATIONS = ["The sun resounds in ancient fashion.", "The sea foams in broad rivers."];

function renderParallel(mode: "parallel" | "inline" = "parallel") {
  return render(
    <SentenceReader
      text={TEXT}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
      translations={TRANSLATIONS}
      translationDisplayMode={mode}
      translationLang="en"
    />,
  );
}

test("translation blocks are unselectable by default (parallel)", () => {
  const { container } = renderParallel();
  const translations = container.querySelectorAll('[data-translation="true"]');
  expect(translations.length).toBeGreaterThan(0);
  translations.forEach((t) => expect(t.className).toContain("select-none"));
});

test("translation blocks are unselectable by default (inline)", () => {
  const { container } = renderParallel("inline");
  const translations = container.querySelectorAll('[data-translation="true"]');
  expect(translations.length).toBeGreaterThan(0);
  translations.forEach((t) => expect(t.className).toContain("select-none"));
});

test("starting a drag inside a translation flips selectability", () => {
  const { container } = renderParallel();
  const translation = container.querySelector('[data-translation="true"]') as HTMLElement;
  fireEvent.pointerDown(translation);

  // Translations become selectable, originals become unselectable
  container.querySelectorAll('[data-translation="true"]').forEach((t) => {
    expect(t.className).not.toContain("select-none");
  });
  const originals = container.querySelectorAll('[data-original="true"]');
  expect(originals.length).toBeGreaterThan(0);
  originals.forEach((o) => expect(o.className).toContain("select-none"));
});

test("dragging back in the original restores the default", () => {
  const { container } = renderParallel();
  fireEvent.pointerDown(container.querySelector('[data-translation="true"]') as HTMLElement);
  fireEvent.pointerDown(container.querySelector("[data-seg]") as HTMLElement);

  container.querySelectorAll('[data-translation="true"]').forEach((t) => {
    expect(t.className).toContain("select-none");
  });
  container.querySelectorAll('[data-original="true"]').forEach((o) => {
    expect(o.className).not.toContain("select-none");
  });
});

test("without translations nothing is marked unselectable", () => {
  const { container } = render(
    <SentenceReader
      text={TEXT}
      duration={0}
      currentTime={0}
      isPlaying={false}
      onSegmentClick={noop}
    />,
  );
  expect(container.querySelector(".select-none")).toBeNull();
});
