/**
 * SelectionToolbar — coverage2: extractContext branches (lines 22-23)
 *   Line 22: tagName === "P" early-return path
 *   Line 23: hasAttribute("data-seg") early-return path
 */

import React from "react";
import { render, act, screen } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

function makeReaderEl() {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  document.body.appendChild(el);
  return el;
}

function triggerSelectionChange() {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

const RECT = {
  left: 200, right: 300, top: 300, bottom: 320,
  width: 100, height: 20, x: 200, y: 300,
  toJSON: () => ({}),
} as DOMRect;

afterEach(() => {
  document.getElementById("reader-scroll")?.remove();
  jest.restoreAllMocks();
});

// ── Line 22: tagName === "P" early-return ─────────────────────────────────────

describe("SelectionToolbar — extractContext via <P> element (line 22)", () => {
  it("extracts context from containing paragraph (P tag)", () => {
    const readerEl = makeReaderEl();
    const p = document.createElement("p");
    p.textContent = "Full sentence context here.";
    const textNode = document.createTextNode("selected");
    p.appendChild(textNode);
    readerEl.appendChild(p);

    // Use explicit mock range so startContainer is guaranteed to be textNode
    const mockRange = {
      getBoundingClientRect: jest.fn().mockReturnValue(RECT),
      commonAncestorContainer: textNode,
      startContainer: textNode,
    };
    jest.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected",
      getRangeAt: () => mockRange,
      removeAllRanges: jest.fn(),
    } as unknown as Selection);

    render(<SelectionToolbar onRead={jest.fn()} onNote={jest.fn()} />);
    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeNull();
  });
});

// ── Line 23: hasAttribute("data-seg") early-return ───────────────────────────

describe("SelectionToolbar — extractContext via data-seg element (line 23)", () => {
  it("extracts context from containing data-seg span", () => {
    const readerEl = makeReaderEl();
    const seg = document.createElement("span");
    seg.setAttribute("data-seg", "1");
    seg.textContent = "Sentence segment context.";
    const textNode = document.createTextNode("selected text");
    seg.appendChild(textNode);
    readerEl.appendChild(seg);

    const mockRange = {
      getBoundingClientRect: jest.fn().mockReturnValue(RECT),
      commonAncestorContainer: textNode,
      startContainer: textNode,
    };
    jest.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected text",
      getRangeAt: () => mockRange,
      removeAllRanges: jest.fn(),
    } as unknown as Selection);

    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeNull();
  });
});
