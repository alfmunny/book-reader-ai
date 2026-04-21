/**
 * Tests for components/VocabularyToast.tsx
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import VocabularyToast from "@/components/VocabularyToast";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("renders word text", () => {
  render(<VocabularyToast word="serendipity" onDone={jest.fn()} />);
  expect(screen.getByText("serendipity")).toBeInTheDocument();
  expect(screen.getByText(/saved to vocabulary/i)).toBeInTheDocument();
});

test("calls onDone after the timer fires", () => {
  const onDone = jest.fn();
  render(<VocabularyToast word="serendipity" onDone={onDone} />);

  // onDone not called before timers fire
  expect(onDone).not.toHaveBeenCalled();

  // Advance past the 2000ms visibility timer
  act(() => {
    jest.advanceTimersByTime(2000);
  });

  // Still not called — there is a 300ms fade-out delay after the first timer
  expect(onDone).not.toHaveBeenCalled();

  // Advance past the 300ms fade-out timer
  act(() => {
    jest.advanceTimersByTime(300);
  });

  expect(onDone).toHaveBeenCalledTimes(1);
});

test("onDone is not called when component unmounts before timer fires", () => {
  const onDone = jest.fn();
  const { unmount } = render(<VocabularyToast word="ephemeral" onDone={onDone} />);

  // Advance partway — not past the 2000ms threshold
  act(() => {
    jest.advanceTimersByTime(500);
  });

  unmount();

  // Let the rest of the timers run
  act(() => {
    jest.runAllTimers();
  });

  expect(onDone).not.toHaveBeenCalled();
});
