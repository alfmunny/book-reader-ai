/**
 * Regression test for #2461: SelectionToolbar role="toolbar" must implement
 * roving tabindex and arrow-key navigation per ARIA APG toolbar pattern.
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SelectionToolbar from "@/components/SelectionToolbar";

// ── DOM helper ────────────────────────────────────────────────────────────────

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

let readerEl: HTMLElement;

beforeEach(() => {
  readerEl = makeReaderEl();
  jest.spyOn(window, "getSelection").mockReturnValue(null);
});

afterEach(() => {
  readerEl.remove();
  jest.restoreAllMocks();
});

function triggerSelection(text: string) {
  simulateSelection(text, readerEl);
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
}

describe("SelectionToolbar toolbar — roving tabindex (closes #2461)", () => {
  const handlers = {
    onRead: jest.fn(),
    onHighlight: jest.fn(),
    onNote: jest.fn(),
    onChat: jest.fn(),
    onVocab: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("only the first button (Read) has tabIndex=0 initially", () => {
    render(<SelectionToolbar {...handlers} />);
    triggerSelection("hello world");

    const toolbar = screen.getByRole("toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons[0]).toHaveAttribute("tabindex", "0");
    buttons.slice(1).forEach((btn) => {
      expect(btn).toHaveAttribute("tabindex", "-1");
    });
  });

  it("ArrowRight moves focus from first to second button", async () => {
    const user = userEvent.setup();
    render(<SelectionToolbar {...handlers} />);
    triggerSelection("hello world");

    const toolbar = screen.getByRole("toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    buttons[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
  });

  it("ArrowRight wraps from last button to first", async () => {
    const user = userEvent.setup();
    render(<SelectionToolbar {...handlers} />);
    triggerSelection("hello world");

    const toolbar = screen.getByRole("toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    const lastBtn = buttons[buttons.length - 1];
    lastBtn.focus();
    await user.keyboard("{ArrowRight}");
    expect(buttons[0]).toHaveFocus();
  });

  it("ArrowLeft moves focus from second to first button", async () => {
    const user = userEvent.setup();
    render(<SelectionToolbar {...handlers} />);
    triggerSelection("hello world");

    const toolbar = screen.getByRole("toolbar");
    const buttons = Array.from(toolbar.querySelectorAll("button"));
    buttons[1].focus();
    await user.keyboard("{ArrowLeft}");
    expect(buttons[0]).toHaveFocus();
  });

  it("announcement text says 'arrow keys' not 'Tab'", () => {
    render(<SelectionToolbar {...handlers} />);
    triggerSelection("hello world");
    const announcement = document.querySelector("[aria-live]");
    expect(announcement?.textContent).toMatch(/arrow keys/i);
  });
});
