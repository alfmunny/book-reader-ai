/**
 * SelectionToolbar — selection detection, data-translation filtering,
 * min-char threshold, toolbar visibility, and action callbacks.
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SelectionToolbar from "@/components/SelectionToolbar";

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeReaderEl() {
  const el = document.createElement("div");
  el.id = "reader-scroll";
  document.body.appendChild(el);
  return el;
}

function simulateSelection(text: string, container: Node, isTranslation = false) {
  // Build a minimal text node and range inside container
  const textNode = document.createTextNode(text);
  const span = document.createElement("span");
  if (isTranslation) span.setAttribute("data-translation", "true");
  span.appendChild(textNode);
  (container as HTMLElement).appendChild(span);

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

  return { range, mockRect };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SelectionToolbar", () => {
  let readerEl: HTMLElement;

  beforeEach(() => {
    readerEl = makeReaderEl();
    jest.spyOn(window, "getSelection").mockReturnValue(null);
  });

  afterEach(() => {
    readerEl.remove();
    jest.restoreAllMocks();
  });

  it("renders nothing when there is no selection", () => {
    const { container } = render(
      <SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} />
    );
    // Toolbar div not in document
    expect(container.firstChild).toBeNull();
  });

  it("shows toolbar when text >= 2 chars is selected inside reader", () => {
    render(<SelectionToolbar onRead={jest.fn()} onHighlight={jest.fn()} onNote={jest.fn()} onChat={jest.fn()} />);
    simulateSelection("Hello world", readerEl);

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
  });

  it("does not show toolbar when selected text is shorter than 2 chars", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("A", readerEl);

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });

  it("does not show toolbar for selections inside data-translation elements", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("translated text", readerEl, true /* isTranslation */);

    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });

  it("calls onRead with selected text and hides toolbar on click", () => {
    const onRead = jest.fn();
    render(<SelectionToolbar onRead={onRead} />);
    const { mockRect: rect } = simulateSelection("selected text", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    const btn = screen.getByRole("button", { name: /Read/i });
    fireEvent.click(btn);

    expect(onRead).toHaveBeenCalledWith("selected text");
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });

  it("calls onHighlight with selected text", () => {
    const onHighlight = jest.fn();
    render(<SelectionToolbar onHighlight={onHighlight} />);
    simulateSelection("highlighted", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    fireEvent.click(screen.getByRole("button", { name: /Highlight/i }));
    expect(onHighlight).toHaveBeenCalledWith("highlighted");
  });

  it("calls onNote with selected text", () => {
    const onNote = jest.fn();
    render(<SelectionToolbar onNote={onNote} />);
    simulateSelection("a note sentence", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    fireEvent.click(screen.getByRole("button", { name: /Note/i }));
    expect(onNote).toHaveBeenCalledWith("a note sentence");
  });

  it("calls onChat with selected text", () => {
    const onChat = jest.fn();
    render(<SelectionToolbar onChat={onChat} />);
    simulateSelection("chat this passage", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    fireEvent.click(screen.getByRole("button", { name: /Chat/i }));
    expect(onChat).toHaveBeenCalledWith("chat this passage");
  });

  it("only renders buttons for provided callbacks", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("test selection", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Highlight/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chat/i })).not.toBeInTheDocument();
  });

  it("toolbar buttons meet 44px minimum touch target height (regression #563)", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("tap target check", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });

    const btn = screen.getByRole("button", { name: /Read/i });
    const classList = btn.className;
    // min-h-[40px] is below 44px — must be min-h-[44px] or larger
    expect(classList).not.toMatch(/min-h-\[4[0-3]px\]/);
    expect(classList).toMatch(/min-h-\[44px\]/);
  });

  it("hides toolbar on reader scroll", () => {
    render(<SelectionToolbar onRead={jest.fn()} />);
    simulateSelection("scroll away", readerEl);
    act(() => { document.dispatchEvent(new Event("selectionchange")); });
    expect(screen.getByRole("button", { name: /Read/i })).toBeInTheDocument();

    act(() => {
      readerEl.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("button", { name: /Read/i })).not.toBeInTheDocument();
  });
});
