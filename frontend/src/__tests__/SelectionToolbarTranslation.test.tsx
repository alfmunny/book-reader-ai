/**
 * Selecting inside a translation offers its own two actions (owner,
 * 2026-08-30): Read (in the translation's language) and Note, which opens
 * the paragraph dialog. Clicking the paragraph does nothing anymore.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

function mockSelectionInside(el: Element, text: string) {
  const range = {
    commonAncestorContainer: el,
    startContainer: el,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 80, height: 20, bottom: 220, right: 180 }),
  };
  (window as unknown as { getSelection: () => unknown }).getSelection = () => ({
    toString: () => text,
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges: () => {},
  });
  act(() => { document.dispatchEvent(new Event("selectionchange")); });
}

function setupReader(html: string) {
  const host = document.createElement("div");
  host.id = "reader-scroll";
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

afterEach(() => { document.getElementById("reader-scroll")?.remove(); });

test("translation selection shows only Read + Note, and Note reports the paragraph", () => {
  const host = setupReader('<div data-translation="true"><p data-translation-para="3">译文</p></div>');
  const onTranslationNote = jest.fn();
  const onRead = jest.fn();
  render(
    <SelectionToolbar
      onRead={onRead}
      onHighlight={jest.fn()}
      onNote={jest.fn()}
      onChat={jest.fn()}
      onTranslationNote={onTranslationNote}
      translationLang="zh"
    />,
  );
  mockSelectionInside(host.querySelector("p")!, "太阳依着古老的方式");

  expect(screen.getByRole("button", { name: "Read aloud" })).toBeInTheDocument();
  expect(screen.getByTestId("translation-note-action")).toBeInTheDocument();
  // The original-text actions stay out of the translation toolbar
  expect(screen.queryByRole("button", { name: "Highlight" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();

  fireEvent.click(screen.getByTestId("translation-note-action"));
  expect(onTranslationNote).toHaveBeenCalledWith(3, expect.anything());
});

test("Read on a translation selection uses the translation language", () => {
  const host = setupReader('<div data-translation="true"><p data-translation-para="0">译文</p></div>');
  const onRead = jest.fn();
  render(<SelectionToolbar onRead={onRead} onTranslationNote={jest.fn()} translationLang="zh" />);
  mockSelectionInside(host.querySelector("p")!, "大海在翻腾");
  fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
  expect(onRead).toHaveBeenCalledWith("大海在翻腾", "zh");
});

test("without a translation-note handler the toolbar stays suppressed there", () => {
  const host = setupReader('<div data-translation="true"><p data-translation-para="0">译文</p></div>');
  render(<SelectionToolbar onRead={jest.fn()} onNote={jest.fn()} />);
  mockSelectionInside(host.querySelector("p")!, "译文选择");
  expect(screen.queryByRole("toolbar")).toBeNull();
});

test("selections in the original text keep the full action set", () => {
  const host = setupReader('<p data-seg="0">Die Sonne tönt.</p>');
  render(
    <SelectionToolbar
      onRead={jest.fn()} onHighlight={jest.fn()} onNote={jest.fn()} onChat={jest.fn()}
      onTranslationNote={jest.fn()}
    />,
  );
  mockSelectionInside(host.querySelector("p")!, "Die Sonne");
  expect(screen.getByRole("button", { name: "Highlight" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ask AI" })).toBeInTheDocument();
  expect(screen.queryByTestId("translation-note-action")).toBeNull();
});
