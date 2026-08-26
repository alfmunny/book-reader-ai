/**
 * UndoToast defers the destructive action to `onDone`, so every call site's
 * server-side delete depends on that callback actually firing — exactly once,
 * and never after the user pressed Undo.
 */
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import UndoToast from "@/components/UndoToast";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test("commits the pending action when the toast unmounts before the timer fires", () => {
  const onDone = jest.fn();
  const { unmount } = render(<UndoToast message="removed" onUndo={jest.fn()} onDone={onDone} />);

  act(() => { jest.advanceTimersByTime(1000); });
  unmount();

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("commits only once when the timer fires and the toast then unmounts", () => {
  const onDone = jest.fn();
  const { unmount } = render(<UndoToast message="removed" onUndo={jest.fn()} onDone={onDone} />);

  act(() => { jest.advanceTimersByTime(5300); });
  expect(onDone).toHaveBeenCalledTimes(1);

  unmount();
  expect(onDone).toHaveBeenCalledTimes(1);
});

test("Undo cancels the pending commit — the destructive action never runs", () => {
  const onUndo = jest.fn();
  const onDone = jest.fn();
  const { unmount } = render(<UndoToast message="removed" onUndo={onUndo} onDone={onDone} />);

  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(onUndo).toHaveBeenCalledTimes(1);

  act(() => { jest.advanceTimersByTime(5300); });
  unmount();

  expect(onDone).not.toHaveBeenCalled();
});

test("a parent re-render does not postpone the commit", () => {
  const onDone = jest.fn();
  const view = render(<UndoToast message="removed" onUndo={jest.fn()} onDone={() => onDone()} />);

  act(() => { jest.advanceTimersByTime(3000); });
  // Call sites build onUndo/onDone inline, so every parent render hands the
  // toast fresh closures; that must not restart the countdown.
  view.rerender(<UndoToast message="removed" onUndo={jest.fn()} onDone={() => onDone()} />);
  act(() => { jest.advanceTimersByTime(2300); });

  expect(onDone).toHaveBeenCalledTimes(1);
});
