/**
 * Tests for components/SentenceActionPopup.tsx
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SentenceActionPopup from "@/components/SentenceActionPopup";

const BASE_PROPS = {
  sentenceText: "It is a truth universally acknowledged.",
  position: { x: 200, y: 300 },
  onRead: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("renders Read button always", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  expect(screen.getByRole("button", { name: /read/i })).toBeInTheDocument();
});

test("does not render Note button when onNote is not provided", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  expect(screen.queryByRole("button", { name: /note/i })).not.toBeInTheDocument();
});

test("does not render Chat button when onChat is not provided", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  expect(screen.queryByRole("button", { name: /chat/i })).not.toBeInTheDocument();
});

test("renders Note button when onNote is provided", () => {
  render(<SentenceActionPopup {...BASE_PROPS} onNote={jest.fn()} />);
  expect(screen.getByRole("button", { name: /note/i })).toBeInTheDocument();
});

test("renders Chat button when onChat is provided", () => {
  render(<SentenceActionPopup {...BASE_PROPS} onChat={jest.fn()} />);
  expect(screen.getByRole("button", { name: /chat/i })).toBeInTheDocument();
});

test("clicking Read calls onRead and onClose", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  fireEvent.click(screen.getByRole("button", { name: /read/i }));
  expect(BASE_PROPS.onRead).toHaveBeenCalledTimes(1);
  expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("clicking Note calls onNote and onClose", () => {
  const onNote = jest.fn();
  render(<SentenceActionPopup {...BASE_PROPS} onNote={onNote} />);
  fireEvent.click(screen.getByRole("button", { name: /note/i }));
  expect(onNote).toHaveBeenCalledTimes(1);
  expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("clicking Chat calls onChat and onClose", () => {
  const onChat = jest.fn();
  render(<SentenceActionPopup {...BASE_PROPS} onChat={onChat} />);
  fireEvent.click(screen.getByRole("button", { name: /chat/i }));
  expect(onChat).toHaveBeenCalledTimes(1);
  expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("Escape key calls onClose", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("mousedown outside popup calls onClose after 100ms setTimeout", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);

  // Before the 100ms delay, mousedown outside should NOT call onClose
  fireEvent.mouseDown(document.body);
  expect(BASE_PROPS.onClose).not.toHaveBeenCalled();

  // Advance past the 100ms delay so the listener is registered
  act(() => {
    jest.advanceTimersByTime(100);
  });

  // Now a mousedown outside the popup should close it
  fireEvent.mouseDown(document.body);
  expect(BASE_PROPS.onClose).toHaveBeenCalledTimes(1);
});

test("non-Escape keydown does NOT call onClose", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);
  fireEvent.keyDown(document, { key: "Enter" });
  expect(BASE_PROPS.onClose).not.toHaveBeenCalled();
});

test("left-clamp: position near left edge pushes popup to x=8", () => {
  // x=5 → left = 5 - 90 = -85, which triggers left < 8 branch
  const { container } = render(
    <SentenceActionPopup {...BASE_PROPS} position={{ x: 5, y: 300 }} />
  );
  const popup = container.firstChild as HTMLElement;
  expect(popup.style.left).toBe("8px");
});

test("top-clamp: position near top edge flips popup below click point", () => {
  // y=5 → top = 5 - 44 - 12 = -51 < 8, triggers top < 8 branch → top = y + 16
  const { container } = render(
    <SentenceActionPopup {...BASE_PROPS} position={{ x: 200, y: 5 }} />
  );
  const popup = container.firstChild as HTMLElement;
  expect(popup.style.top).toBe("21px"); // 5 + 16
});

test("right-clamp: position near right edge keeps popup in viewport", () => {
  // window.innerWidth defaults to 1024 in JSDOM
  // x=1000 → left = 1000 - 90 = 910, 910+180=1090 > 1024-8=1016 → clamp
  Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });
  const { container } = render(
    <SentenceActionPopup {...BASE_PROPS} position={{ x: 1000, y: 300 }} />
  );
  const popup = container.firstChild as HTMLElement;
  expect(parseInt(popup.style.left)).toBeLessThanOrEqual(1024 - 180 - 8);
});

test("mousedown inside popup does NOT call onClose", () => {
  render(<SentenceActionPopup {...BASE_PROPS} />);

  act(() => {
    jest.advanceTimersByTime(100);
  });

  // Click on the Read button (inside the popup ref)
  fireEvent.mouseDown(screen.getByRole("button", { name: /read/i }));
  expect(BASE_PROPS.onClose).not.toHaveBeenCalled();
});
