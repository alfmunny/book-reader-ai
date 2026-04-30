/**
 * Regression tests for #2515:
 * VocabularyToast must auto-dismiss after 4 s (not 2 s) and pause
 * the timer while hovered or focused (WCAG 2.2.1, Level A).
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import VocabularyToast from "@/components/VocabularyToast";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("VocabularyToast timing — closes #2515", () => {
  it("calls onDone after 4 s when not interacted with", () => {
    const onDone = jest.fn();
    render(<VocabularyToast word="hallo" onDone={onDone} />);

    act(() => { jest.advanceTimersByTime(3999); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(4000 + 300 + 100); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-dismiss while the mouse is over the toast", () => {
    const onDone = jest.fn();
    render(<VocabularyToast word="hallo" onDone={onDone} />);
    const toast = screen.getByRole("status");

    act(() => { fireEvent.mouseEnter(toast); });
    act(() => { jest.advanceTimersByTime(20000); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { fireEvent.mouseLeave(toast); });
    act(() => { jest.advanceTimersByTime(4000 + 300 + 100); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-dismiss while the toast has keyboard focus", () => {
    const onDone = jest.fn();
    render(<VocabularyToast word="hallo" onDone={onDone} />);
    const toast = screen.getByRole("status");

    act(() => { fireEvent.focus(toast); });
    act(() => { jest.advanceTimersByTime(20000); });
    expect(onDone).not.toHaveBeenCalled();

    act(() => { fireEvent.blur(toast); });
    act(() => { jest.advanceTimersByTime(4000 + 300 + 100); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows the saved word and a confirmation message", () => {
    render(<VocabularyToast word="bonjour" onDone={jest.fn()} />);
    expect(screen.getByText(/bonjour/)).toBeInTheDocument();
    expect(screen.getByText(/saved to vocabulary/)).toBeInTheDocument();
  });
});
