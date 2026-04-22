/**
 * SelectionToolbar — handleVocabAction coverage (lines 107-110):
 * onVocab called with (word, context, rect); selection cleared; toolbar hidden.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

function makeReaderEl() {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  document.body.appendChild(el);
  return el;
}

function simulateSelectionInReader(text: string, readerEl: HTMLElement, contextParent?: "p" | "data-seg") {
  const textNode = document.createTextNode(text);
  const container = document.createElement(contextParent === "p" ? "p" : "span");
  if (contextParent === "data-seg") container.setAttribute("data-seg", "true");
  container.appendChild(textNode);
  readerEl.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(textNode);
  range.getBoundingClientRect = jest.fn().mockReturnValue({
    left: 200, right: 300, top: 300, bottom: 320,
    width: 100, height: 20, x: 200, y: 300,
    toJSON: () => ({}),
  } as DOMRect);

  const mockSel = {
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges: jest.fn(),
  } as unknown as Selection;
  jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

  return { range, mockSel };
}

function triggerSelectionChange() {
  act(() => { document.dispatchEvent(new Event("selectionchange")); });
}

describe("SelectionToolbar — handleVocabAction (lines 107-110)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("calls onVocab with (word, context, rect) when Word button is clicked", () => {
    const onVocab = jest.fn();
    const { mockSel } = simulateSelectionInReader("leviathan", readerEl, "p");
    render(<SelectionToolbar onVocab={onVocab} />);
    triggerSelectionChange();

    expect(screen.getByRole("button", { name: /Word/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Word/i }));

    expect(onVocab).toHaveBeenCalledTimes(1);
    const [word, context, rect] = onVocab.mock.calls[0];
    expect(word).toBe("leviathan");
    expect(typeof context).toBe("string");
    expect(rect).toBeTruthy();

    expect(mockSel.removeAllRanges).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Word/i })).not.toBeInTheDocument();
  });

  it("falls back to selection.text as context when extractContext returns empty", () => {
    const onVocab = jest.fn();
    // No <p> or data-seg wrapper — extractContext returns ""
    simulateSelectionInReader("orphan", readerEl);
    render(<SelectionToolbar onVocab={onVocab} />);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: /Word/i }));

    const [word, context] = onVocab.mock.calls[0];
    expect(word).toBe("orphan");
    // context should fall back to the text itself when extractContext returns ""
    expect(context).toBe("orphan");
  });

  it("Word button not rendered when onVocab prop is absent", () => {
    simulateSelectionInReader("hello world", readerEl, "p");
    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: /Word/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
  });
});
