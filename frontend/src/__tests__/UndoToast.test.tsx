import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UndoToast from "@/components/UndoToast";

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe("UndoToast", () => {
  it("renders the message and Undo button", () => {
    render(<UndoToast message="Highlight deleted" onUndo={jest.fn()} onDone={jest.fn()} />);
    expect(screen.getByText("Highlight deleted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("calls onUndo and onDone when Undo is clicked", async () => {
    const onUndo = jest.fn();
    const onDone = jest.fn();
    render(<UndoToast message="Highlight deleted" onUndo={onUndo} onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1), { timeout: 500 });
  });

  it("auto-dismisses after 3 seconds by calling onDone", async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    render(<UndoToast message="Highlight deleted" onUndo={jest.fn()} onDone={onDone} />);

    await act(async () => {
      jest.advanceTimersByTime(3300);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onUndo when auto-dismissed", async () => {
    jest.useFakeTimers();
    const onUndo = jest.fn();
    const onDone = jest.fn();
    render(<UndoToast message="Highlight deleted" onUndo={onUndo} onDone={onDone} />);

    await act(async () => {
      jest.advanceTimersByTime(3300);
    });

    expect(onUndo).not.toHaveBeenCalled();
  });
});
