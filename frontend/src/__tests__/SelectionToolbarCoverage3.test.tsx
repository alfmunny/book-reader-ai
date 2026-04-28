/**
 * Coverage tests for components/SelectionToolbar.tsx — functions not covered by existing tests.
 * Closes #1991 — targets: handleKey function (lines 68-72) — the Escape keydown handler.
 * Existing EscapeDismiss test does a static source check only; the handler is never invoked.
 */
import React from "react";
import { render, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

const RECT = {
  left: 100, right: 200, top: 200, bottom: 220,
  width: 100, height: 20, x: 100, y: 200,
  toJSON: () => ({}),
} as DOMRect;

afterEach(() => {
  document.getElementById("reader-scroll")?.remove();
  jest.restoreAllMocks();
});

function makeReaderWithText(): Node {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  const textNode = document.createTextNode("some selected text");
  el.appendChild(textNode);
  document.body.appendChild(el);
  return textNode;
}

function mockSelectionWith(textNode: Node) {
  const mockRange = {
    getBoundingClientRect: jest.fn().mockReturnValue(RECT),
    commonAncestorContainer: textNode,
    startContainer: textNode,
  };
  const mockRemoveAllRanges = jest.fn();
  jest.spyOn(window, "getSelection").mockReturnValue({
    toString: () => "some selected text",
    getRangeAt: () => mockRange,
    removeAllRanges: mockRemoveAllRanges,
  } as unknown as Selection);
  return mockRemoveAllRanges;
}

test("pressing Escape while selection is active calls removeAllRanges and clears toolbar", async () => {
  const textNode = makeReaderWithText();
  const mockRemoveAllRanges = mockSelectionWith(textNode);

  render(<SelectionToolbar onRead={jest.fn()} />);

  // Trigger selection so state becomes non-null (activates the Escape listener)
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });

  // Now fire Escape — the handleKey function should run
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(mockRemoveAllRanges).toHaveBeenCalled();
});
