/**
 * Regression test for #2655:
 * `selectionchange` fires continuously *during* a drag, so the toolbar used to
 * mount mid-gesture, sit over the text under the cursor, and swallow the pointer
 * events needed to keep extending the selection.
 *
 * The toolbar must stay hidden until the pointer gesture ends, then appear once
 * against the final selection. Keyboard selections (no pointer involved) must
 * keep showing the toolbar straight off `selectionchange`.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeReaderEl() {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  document.body.appendChild(el);
  return el;
}

function simulateSelection(text: string, container: HTMLElement) {
  const textNode = document.createTextNode(text);
  const span = document.createElement("span");
  span.appendChild(textNode);
  container.appendChild(span);

  const range = document.createRange();
  range.selectNodeContents(textNode);

  const mockRect = {
    left: 100, right: 200, top: 300, bottom: 320,
    width: 100, height: 20, x: 100, y: 300,
    toJSON: () => ({}),
  } as DOMRect;
  range.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

  const mockSel = {
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges: jest.fn(),
  } as unknown as Selection;
  jest.spyOn(window, "getSelection").mockReturnValue(mockSel);
}

/**
 * jsdom has no PointerEvent constructor — build a MouseEvent with the pointer
 * event's type, which is what the component's document-level listeners match on.
 * Same approach as SentenceReader.coverage.test.tsx.
 */
function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointerup" | "pointercancel",
  init: MouseEventInit = {},
) {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
}

function fireSelectionChange() {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SelectionToolbar drag deferral (closes #2655)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
    jest.spyOn(window, "getSelection").mockReturnValue(null);
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("stays hidden while a primary-button drag is still in progress", () => {
    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    simulateSelection("Hello world", readerEl);
    fireSelectionChange();

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("stays hidden across the many selectionchange events a drag emits", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    simulateSelection("Hab nun, ach!", readerEl);
    fireSelectionChange();
    simulateSelection("Hab nun, ach! Philosophie,", readerEl);
    fireSelectionChange();
    simulateSelection("Hab nun, ach! Philosophie, Juristerei und Medizin", readerEl);
    fireSelectionChange();

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("appears once the drag ends on pointerup", () => {
    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    simulateSelection("Hello world", readerEl);
    fireSelectionChange();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    dispatchPointerEvent(readerEl, "pointerup");

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
  });

  it("shows the final selection text, not the mid-drag text", () => {
    const onRead = jest.fn();
    render(<SelectionToolbar onRead={onRead} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    simulateSelection("Hab nun", readerEl);
    fireSelectionChange();
    simulateSelection("Hab nun, ach! Philosophie", readerEl);
    fireSelectionChange();
    dispatchPointerEvent(readerEl, "pointerup");

    screen.getByRole("button", { name: /Read/i }).click();
    expect(onRead).toHaveBeenCalledWith("Hab nun, ach! Philosophie");
  });

  it("hides an already-open toolbar as soon as a new drag starts", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);

    // Keyboard-style selection puts the toolbar on screen first.
    simulateSelection("first selection", readerEl);
    fireSelectionChange();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    // Starting a fresh drag must clear it immediately — a stale toolbar left
    // over the text is the same obstruction the issue reported.
    dispatchPointerEvent(readerEl, "pointerdown");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("does not re-show the toolbar when the drag ends on a collapsed selection", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);

    simulateSelection("first selection", readerEl);
    fireSelectionChange();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    dispatchPointerEvent(readerEl, "pointerdown");
    jest.spyOn(window, "getSelection").mockReturnValue(null);
    dispatchPointerEvent(readerEl, "pointerup");

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("keeps the keyboard-selection path working with no pointer events at all", () => {
    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />);

    simulateSelection("shift arrow selection", readerEl);
    fireSelectionChange();

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  it("releases the drag guard on pointercancel so later selections still show", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    // Gesture is taken over by a scroll — the browser cancels the pointer.
    dispatchPointerEvent(readerEl, "pointercancel");

    simulateSelection("selection after cancel", readerEl);
    fireSelectionChange();

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  it("ignores non-primary buttons so right-click does not clear the selection", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);

    simulateSelection("right click me", readerEl);
    fireSelectionChange();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    dispatchPointerEvent(readerEl, "pointerdown", { button: 2 });

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  it("does not steal focus after a long mouse drag (keyboard heuristic guard)", () => {
    // The keyboard heuristic auto-focuses the first button when the toolbar
    // appears >300ms after the last pointer event. A drag lasting longer than
    // that must NOT be misread as a keyboard selection.
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(realNow);

    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />);

    dispatchPointerEvent(readerEl, "pointerdown");
    // Two seconds of dragging across several lines.
    nowSpy.mockReturnValue(realNow + 2000);
    simulateSelection("a long multi-line drag", readerEl);
    fireSelectionChange();
    dispatchPointerEvent(readerEl, "pointerup");

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read/i })).not.toHaveFocus();
  });

  it("still auto-focuses the first button for a genuine keyboard selection", () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(realNow);

    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />);

    // Last pointer activity was long ago; the selection arrives with no drag.
    dispatchPointerEvent(readerEl, "pointerdown");
    dispatchPointerEvent(readerEl, "pointerup");
    nowSpy.mockReturnValue(realNow + 5000);

    simulateSelection("shift arrow selection", readerEl);
    fireSelectionChange();

    expect(screen.getByRole("button", { name: /Read/i })).toHaveFocus();
  });
});
