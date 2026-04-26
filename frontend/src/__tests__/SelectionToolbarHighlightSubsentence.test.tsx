/**
 * Regression for #1410: Highlight button must save the selected text,
 * not the surrounding sentence context.
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

/**
 * Simulate a sub-sentence selection inside a real-world DOM:
 *   <p>It was a lonely glade beneath the oaks.</p>
 * Selecting only "lonely glade beneath" — the parent <p> sets `selection.context`
 * to the full sentence, but `selection.text` is the partial selection.
 */
function simulateSubsentenceSelection(reader: HTMLElement) {
  const p = document.createElement("p");
  const fullSentence = "It was a lonely glade beneath the oaks.";
  p.textContent = fullSentence;
  reader.appendChild(p);

  const phraseStart = fullSentence.indexOf("lonely glade beneath");
  const phraseEnd = phraseStart + "lonely glade beneath".length;
  const range = document.createRange();
  const textNode = p.firstChild as Text;
  range.setStart(textNode, phraseStart);
  range.setEnd(textNode, phraseEnd);

  range.getBoundingClientRect = jest.fn().mockReturnValue({
    left: 100, right: 200, top: 300, bottom: 320,
    width: 100, height: 20, x: 100, y: 300,
    toJSON: () => ({}),
  } as DOMRect);

  jest.spyOn(window, "getSelection").mockReturnValue({
    toString: () => "lonely glade beneath",
    getRangeAt: () => range,
    rangeCount: 1,
    removeAllRanges: jest.fn(),
  } as unknown as Selection);
}

describe("SelectionToolbar Highlight — sub-sentence selection (closes #1410)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
    jest.spyOn(window, "getSelection").mockReturnValue(null);
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("Highlight saves only the selected phrase, not the full sentence", () => {
    const onHighlight = jest.fn();
    render(<SelectionToolbar onHighlight={onHighlight} />);
    simulateSubsentenceSelection(readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    fireEvent.click(screen.getByRole("button", { name: /Highlight/i }));

    // Bug was: passed full sentence "It was a lonely glade beneath the oaks."
    // Fix: pass only the user's selection.
    expect(onHighlight).toHaveBeenCalledWith("lonely glade beneath");
    expect(onHighlight).not.toHaveBeenCalledWith(
      expect.stringContaining("It was a lonely glade beneath the oaks"),
    );
  });
});
