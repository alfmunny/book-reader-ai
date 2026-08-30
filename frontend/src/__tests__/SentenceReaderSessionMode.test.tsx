/**
 * Session-mode translation rendering (design: docs/design/user-translations.md,
 * #2740): translated paragraphs carry provenance chips + actions; gaps render
 * an explicit placeholder — never editorial fallback.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SentenceReader from "@/components/SentenceReader";

const noop = () => {};

const TEXT = "Die Sonne tönt, nach alter Weise.\n\nEs schäumt das Meer in breiten Flüssen.";

function renderSession(overrides: Partial<React.ComponentProps<typeof SentenceReader>> = {}) {
  const props: React.ComponentProps<typeof SentenceReader> = {
    text: TEXT,
    duration: 0,
    currentTime: 0,
    isPlaying: false,
    onSegmentClick: noop,
    translations: ["太阳依着古老的方式轰鸣。", undefined] as unknown as string[],
    translationDisplayMode: "parallel",
    translationLang: "zh",
    sessionMode: true,
    translationMeta: { 0: { model: "deepseek-v4-flash", edited: false } },
    onTranslateParagraph: jest.fn(),
    ...overrides,
  };
  return { ...render(<SentenceReader {...props} />), props };
}

test("translated paragraphs show the model chip and action row", () => {
  renderSession();
  const meta = screen.getByTestId("session-meta-0");
  expect(meta).toHaveTextContent("deepseek-v4-flash");
  expect(meta).not.toHaveTextContent("edited");
});

test("an edited paragraph shows the edited chip", () => {
  renderSession({ translationMeta: { 0: { model: "claude-sonnet-5", edited: true } } });
  expect(screen.getByTestId("session-meta-0")).toHaveTextContent("edited");
});

test("untranslated paragraphs show the explicit placeholder with Translate", () => {
  const { props } = renderSession();
  const gap = screen.getByTestId("session-gap-1");
  expect(gap).toHaveTextContent("Not translated yet");
  fireEvent.click(gap.querySelector("button") as HTMLElement);
  expect(props.onTranslateParagraph).toHaveBeenCalledWith(1);
});

test("the row keeps only Retranslate — Edit/Share/Delete live in the dialog", () => {
  const { props } = renderSession();
  fireEvent.click(screen.getByRole("button", { name: "Retranslate paragraph 1" }));
  expect(props.onTranslateParagraph).toHaveBeenCalledWith(0);
  expect(screen.queryByRole("button", { name: /Edit translation/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Delete translation/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Share/ })).toBeNull();
});

test("a translating paragraph shows progress instead of the button", () => {
  renderSession({ translatingParagraphs: new Set([1]) });
  const gap = screen.getByTestId("session-gap-1");
  expect(gap).toHaveTextContent("Translating…");
  expect(gap.querySelector("button")).toBeNull();
});

test("actionsDisabled locks every per-paragraph action during a chapter run", () => {
  const { props } = renderSession({ actionsDisabled: true });
  // Gap shows the running notice, no Translate button
  expect(screen.getByTestId("session-gap-1")).toHaveTextContent("Chapter translation running…");
  expect(screen.getByTestId("session-gap-1").querySelector("button")).toBeNull();
  // Existing paragraph's actions disabled
  expect(screen.getByRole("button", { name: "Retranslate paragraph 1" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Retranslate paragraph 1" }));
  expect(props.onTranslateParagraph).not.toHaveBeenCalled();
});

test("without sessionMode nothing session-related renders (editorial unchanged)", () => {
  renderSession({ sessionMode: false, translationMeta: undefined });
  expect(screen.queryByTestId("session-meta-0")).toBeNull();
  expect(screen.queryByTestId("session-gap-1")).toBeNull();
});
