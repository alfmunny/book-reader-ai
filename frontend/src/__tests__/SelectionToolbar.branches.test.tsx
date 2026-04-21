/**
 * SelectionToolbar — branch coverage for previously-uncovered lines:
 *
 * Lines 54-58: handleClick (mousedown outside toolbar)
 *   - click INSIDE toolbar ref → does NOT close
 *   - click OUTSIDE toolbar ref → 100ms timeout fires, rechecks selection:
 *       • selection still >= 2 chars → toolbar stays open
 *       • selection now < 2 chars   → toolbar closes
 *
 * Line 87: position fallback when scrollEl?.getBoundingClientRect() returns
 *   undefined (no #reader-scroll element) → `top < (undefined ?? 60)` branch.
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

/**
 * Set up a text selection that appears to live inside `container`.
 * Returns the mock DOMRect used for the range.
 */
function simulateSelection(
  text: string,
  container: HTMLElement,
  rectOverride?: Partial<DOMRect>
) {
  const textNode = document.createTextNode(text);
  const span = document.createElement("span");
  span.appendChild(textNode);
  container.appendChild(span);

  const range = document.createRange();
  range.selectNodeContents(textNode);

  const defaultRect = {
    left: 100, right: 200, top: 300, bottom: 320,
    width: 100, height: 20, x: 100, y: 300,
    toJSON: () => ({}),
  } as DOMRect;
  const mockRect = { ...defaultRect, ...rectOverride } as DOMRect;
  range.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

  const mockSel = {
    toString: () => text,
    getRangeAt: () => range,
    removeAllRanges: jest.fn(),
  } as unknown as Selection;
  jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

  return { range, mockRect, mockSel };
}

/** Fire selectionchange so the component picks up the mock selection. */
function triggerSelectionChange() {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SelectionToolbar — close handler (lines 54-58)", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    readerEl = makeReaderEl();
    jest.spyOn(window, "getSelection").mockReturnValue(null);
  });

  afterEach(() => {
    readerEl.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does NOT close when mousedown happens inside the toolbar", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("Hello world", readerEl);
    triggerSelectionChange();

    // Fire mousedown directly on the Read button — it IS inside the toolbar ref.
    // Since the event bubbles, the document handler will see it with
    // e.target === the button, and toolbarRef.current.contains(button) === true.
    const readBtn = screen.getByRole("button", { name: /Read/i });
    act(() => {
      fireEvent.mouseDown(readBtn);
    });

    // Advance past the 100ms delay
    act(() => { jest.advanceTimersByTime(150); });

    // Toolbar should still be visible
    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
  });

  it("stays open when mousedown is outside but selection still >= 2 chars", () => {
    const { mockSel } = simulateSelection("Hello world", readerEl);

    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    // Verify toolbar is up
    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();

    // getSelection still returns long text → toolbar should stay
    (mockSel.toString as jest.Mock) = jest.fn().mockReturnValue("Hello world");
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true })
      );
    });

    act(() => { jest.advanceTimersByTime(150); });

    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
  });

  it("closes when mousedown is outside and selection drops to < 2 chars after 100ms", () => {
    const { mockSel } = simulateSelection("Hello world", readerEl);

    render(<SelectionToolbar onRead={jest.fn()} />);
    triggerSelectionChange();

    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();

    // After 100ms the selection will be cleared (e.g. user released mouse)
    jest.spyOn(window, "getSelection").mockReturnValue({
      ...mockSel,
      toString: () => "",   // < 2 chars
    } as unknown as Selection);

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    act(() => { jest.advanceTimersByTime(150); });

    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});

describe("SelectionToolbar — position fallback (line 87, no reader-scroll)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up any stray reader-scroll elements
    document.getElementById("reader-scroll")?.remove();
  });

  it("falls back to top=60 threshold when no #reader-scroll element exists", () => {
    // Make sure there is NO reader-scroll in the DOM
    document.getElementById("reader-scroll")?.remove();

    // We need a selection that appears inside the reader even without the
    // element — so we craft a range whose commonAncestorContainer is body,
    // and patch getElementById to return a fake readerEl only for the
    // selectionchange containment check, then null for the position check.
    //
    // Simpler approach: create a temporary reader-scroll element for the
    // selection event, remove it before render re-runs positioning, then
    // let the component run through the `scrollRect?.top ?? 60` path.
    //
    // Actually the toolbar position is computed during render (not in an
    // effect), so we just need the element to exist when selectionchange
    // fires, then remove it before the assertion.  But the toolbar renders
    // synchronously in the same render cycle.
    //
    // Instead: keep the reader-scroll element but mock its getBoundingClientRect
    // to return undefined-like values, and place the selection rect so that
    // `top` is below 60 — the "show above" path — to confirm no crash and
    // the fallback `?? 60` branch is exercised when scrollRect is undefined.

    // Create reader-scroll but mock getElementById to return null for it
    // during the render positioning pass only.
    const readerEl = document.createElement("div");
    readerEl.id = "reader-scroll";
    document.body.appendChild(readerEl);

    const textNode = document.createTextNode("selected text here");
    const span = document.createElement("span");
    span.appendChild(textNode);
    readerEl.appendChild(span);

    const range = document.createRange();
    range.selectNodeContents(textNode);

    // rect.top = 30 → 30 < (scrollRect?.top ?? 60) when scrollRect is undefined
    // so it will take the "show below" branch: top = rect.bottom + 8
    const mockRect = {
      left: 200, right: 300, top: 30, bottom: 50,
      width: 100, height: 20, x: 200, y: 30,
      toJSON: () => ({}),
    } as DOMRect;
    range.getBoundingClientRect = jest.fn().mockReturnValue(mockRect);

    const mockSel = {
      toString: () => "selected text here",
      getRangeAt: () => range,
      removeAllRanges: jest.fn(),
    } as unknown as Selection;
    jest.spyOn(window, "getSelection").mockReturnValue(mockSel);

    // Now override getElementById so getBoundingClientRect on reader-scroll
    // returns undefined (simulating a detached / invisible element).
    const origGetById = document.getElementById.bind(document);
    jest.spyOn(document, "getElementById").mockImplementation((id: string) => {
      if (id === "reader-scroll") {
        // Return the real element for containment checks but override its rect
        const el = origGetById(id);
        if (el) {
          jest.spyOn(el, "getBoundingClientRect").mockReturnValue(undefined as unknown as DOMRect);
        }
        return el;
      }
      return origGetById(id);
    });

    render(<SelectionToolbar onRead={jest.fn()} />);

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    // The toolbar renders without crashing, meaning the `?? 60` fallback worked.
    const btn = screen.getByRole("button", { name: /Read/i });
    expect(btn).toBeInTheDocument();

    // The computed top should be rect.bottom + 8 = 58 (since 30 < 60)
    const toolbarDiv = btn.closest("div[style]") as HTMLElement;
    expect(toolbarDiv).toBeTruthy();
    const topStyle = toolbarDiv.style.top;
    expect(Number(topStyle.replace("px", ""))).toBe(58);

    readerEl.remove();
  });
});
