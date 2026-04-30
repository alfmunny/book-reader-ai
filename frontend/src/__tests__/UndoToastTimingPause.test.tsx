/**
 * Regression test for #2509:
 * UndoToast must pause its auto-dismiss timer when the toast receives keyboard
 * focus or mouse hover so keyboard users have enough time to click "Undo"
 * (WCAG 2.2.1 Timing Adjustable, Level A).
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UndoToast from "@/components/UndoToast";

describe("UndoToast timing — closes #2509", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("calls onDone after the base duration when not interacted with", () => {
    const onDone = jest.fn();
    const onUndo = jest.fn();
    render(<UndoToast message="Word removed" onUndo={onUndo} onDone={onDone} />);

    // Should NOT be called yet
    act(() => { jest.advanceTimersByTime(4999); });
    expect(onDone).not.toHaveBeenCalled();

    // Should be called after full 5 s + 300 ms fade
    act(() => { jest.advanceTimersByTime(1 + 300); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("pauses auto-dismiss while the toast has keyboard focus", async () => {
    const onDone = jest.fn();
    render(<UndoToast message="Word removed" onUndo={jest.fn()} onDone={onDone} />);

    // Focus the Undo button — timer should freeze
    const undoBtn = screen.getByRole("button", { name: /undo/i });
    act(() => { undoBtn.focus(); });

    // Advance well past the base duration — onDone must NOT fire
    act(() => { jest.advanceTimersByTime(10000); });
    expect(onDone).not.toHaveBeenCalled();

    // Blur — timer should restart and onDone fires after base duration + fade
    act(() => { undoBtn.blur(); });
    act(() => { jest.advanceTimersByTime(5000 + 300); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("pauses auto-dismiss while the mouse is over the toast", async () => {
    const onDone = jest.fn();
    render(<UndoToast message="Word removed" onUndo={jest.fn()} onDone={onDone} />);

    const toast = screen.getByRole("status");

    // Simulate mouseenter via React synthetic event
    act(() => { fireEvent.mouseEnter(toast); });
    act(() => { jest.advanceTimersByTime(10000); });
    expect(onDone).not.toHaveBeenCalled();

    // Simulate mouseleave — timer restarts
    act(() => { fireEvent.mouseLeave(toast); });
    act(() => { jest.advanceTimersByTime(5000 + 300); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("calls onUndo immediately when Undo button is clicked", async () => {
    const onUndo = jest.fn();
    const onDone = jest.fn();
    render(<UndoToast message="Word removed" onUndo={onUndo} onDone={onDone} />);

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /undo/i }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
