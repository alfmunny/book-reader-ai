/**
 * SelectionToolbar — branch coverage for remaining uncovered branches:
 *
 * Line 23:  sel?.toString().trim() ?? ""  — null getSelection() path
 * Line 29:  if (!range) return — getRangeAt returns null/undefined
 * Line 33:  if (!readerEl?.contains()) return — selection outside reader area
 * Line 57:  window.getSelection()?.toString().trim() ?? "" — null in timer callback
 * Line 84:  if (left < 8) — toolbar positioned too far left
 * Line 85:  if (left + toolbarWidth > window.innerWidth - 8) — too far right
 * Line 92:  if (!fn || !selection) return — handleAction called without fn or selection
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function simulateSelectionInReader(
  text: string,
  readerEl: HTMLElement,
  rectOverride?: Partial<DOMRect>
) {
  const textNode = document.createTextNode(text);
  const span = document.createElement("span");
  span.appendChild(textNode);
  readerEl.appendChild(span);

  const range = document.createRange();
  range.selectNodeContents(textNode);

  const defaultRect = {
    left: 200, right: 300, top: 300, bottom: 320,
    width: 100, height: 20, x: 200, y: 300,
    toJSON: () => ({}),
  } as DOMRect;
  range.getBoundingClientRect = jest.fn().mockReturnValue({ ...defaultRect, ...rectOverride });

  const mockSel = {
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges: jest.fn(),
  } as unknown as Selection;
  jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

  return { range, mockSel };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SelectionToolbar — null getSelection() (line 23)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("does not crash and shows nothing when window.getSelection() returns null", () => {
    jest.spyOn(window, "getSelection").mockReturnValue(null);
    render(<SelectionToolbar onRead={jest.fn()} />);

    triggerSelectionChange();

    // No toolbar shown — null selection → "" → length < 2 → setSelection(null)
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});

describe("SelectionToolbar — getRangeAt returns falsy (line 29)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("does not show toolbar when selection has no range (getRangeAt returns null)", () => {
    // Mock: text is long enough but range is null
    const mockSel = {
      toString: () => "valid text selection",
      getRangeAt: () => null,
      removeAllRanges: jest.fn(),
    } as unknown as Selection;
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    // range is null → early return → no toolbar
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});

describe("SelectionToolbar — selection outside reader area (line 33)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("does not show toolbar when commonAncestorContainer is outside #reader-scroll", () => {
    // Create a container OUTSIDE the reader element
    const outsideDiv = document.createElement("div");
    document.body.appendChild(outsideDiv);
    const textNode = document.createTextNode("text outside reader");
    outsideDiv.appendChild(textNode);

    const range = document.createRange();
    range.selectNodeContents(textNode);
    range.getBoundingClientRect = jest.fn().mockReturnValue({
      left: 100, right: 200, top: 300, bottom: 320,
      width: 100, height: 20, x: 100, y: 300,
      toJSON: () => ({}),
    } as DOMRect);

    const mockSel = {
      toString: () => "text outside reader",
      getRangeAt: () => range,
      removeAllRanges: jest.fn(),
    } as unknown as Selection;
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    // commonAncestorContainer is in outsideDiv, not in readerEl → early return
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();

    outsideDiv.remove();
  });
});

describe("SelectionToolbar — handleAction early return (line 92)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("does not render button for undefined callback (fn is falsy branch)", () => {
    // When onRead is undefined, no Read button is rendered
    // So handleAction never gets called with fn=undefined
    // But we can verify the button doesn't show (implicit coverage)
    render(<SelectionToolbar onHighlight={jest.fn()} />);
    simulateSelectionInReader("test text here", readerEl);
    triggerSelectionChange();

    // onRead not provided → no Read button → handleAction(undefined) never called
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Highlight/i })).toBeInTheDocument();
  });

  it("clicking action button clears selection and hides toolbar", () => {
    const onRead = jest.fn();
    render(<SelectionToolbar onRead={onRead} />);
    const { mockSel } = simulateSelectionInReader("action test text", readerEl);
    triggerSelectionChange();

    const btn = screen.getByRole("button", { name: /Read/i });

    // After action, removeAllRanges is called and toolbar disappears
    fireEvent.click(btn);

    expect(onRead).toHaveBeenCalledWith("action test text");
    expect(mockSel.removeAllRanges).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});

describe("SelectionToolbar — toolbar left boundary clamping (line 84)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("clamps toolbar to left=8 when selection is at far left edge", () => {
    // toolbarWidth = 220; left = rect.left + rect.width/2 - 220/2
    // For left < 8: need rect.left + rect.width/2 < 8 + 110 = 118
    // Use rect.left=0, rect.width=10 → left = 0 + 5 - 110 = -105 → clamped to 8
    simulateSelectionInReader("left edge text here", readerEl, {
      left: 0, right: 10, top: 200, bottom: 220,
      width: 10, height: 20,
    });
    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    const btn = screen.getByRole("button", { name: /Read/i });
    const toolbar = btn.closest("div[style]") as HTMLElement;
    expect(toolbar).toBeTruthy();

    // The left style should be "8px" (clamped)
    const leftStyle = parseFloat(toolbar.style.left);
    expect(leftStyle).toBe(8);
  });
});

describe("SelectionToolbar — toolbar right boundary clamping (line 85)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("clamps toolbar when selection is at far right edge", () => {
    // toolbarWidth = 220; window.innerWidth in jsdom = 1024
    // For left + 220 > 1024 - 8 = 1016: need left > 796
    // Use rect.left = 950, rect.width = 50 → left = 950 + 25 - 110 = 865 > 796
    // Clamped to: 1024 - 220 - 8 = 796
    const origInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });

    simulateSelectionInReader("right edge text here", readerEl, {
      left: 950, right: 1000, top: 200, bottom: 220,
      width: 50, height: 20,
    });
    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    const btn = screen.getByRole("button", { name: /Read/i });
    const toolbar = btn.closest("div[style]") as HTMLElement;
    expect(toolbar).toBeTruthy();

    // left should be clamped: window.innerWidth - toolbarWidth - 8 = 1024 - 220 - 8 = 796
    const leftStyle = parseFloat(toolbar.style.left);
    expect(leftStyle).toBe(796);

    Object.defineProperty(window, "innerWidth", { value: origInnerWidth, configurable: true });
  });
});

describe("SelectionToolbar — null getSelection in setTimeout callback (line 57)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    readerEl = makeReaderEl();
  });

  afterEach(() => {
    readerEl.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("handles null getSelection() inside mousedown timeout callback", () => {
    const { mockSel } = simulateSelectionInReader("timeout null test", readerEl);
    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();

    // Make getSelection return null during the timeout callback
    jest.spyOn(window, "getSelection").mockReturnValue(null);

    // Click outside toolbar
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    // Advance past the 100ms delay — getSelection() returns null → ?? "" → length < 2
    act(() => { jest.advanceTimersByTime(150); });

    // Toolbar should be gone (null ?? "" = "" → length < 2 → setSelection(null))
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});
