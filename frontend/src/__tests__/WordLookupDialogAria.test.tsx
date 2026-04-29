import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import WordLookup from "@/components/WordLookup";

const DEFAULT_POSITION = { x: 200, y: 300 };

beforeEach(() => {
  global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
});

describe("WordLookup — dialog ARIA", () => {
  it("has role=dialog on the popup container", () => {
    render(
      <WordLookup word="test" position={DEFAULT_POSITION} onClose={jest.fn()} />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("aria-label on the dialog includes the word", () => {
    render(
      <WordLookup word="ephemeral" position={DEFAULT_POSITION} onClose={jest.fn()} />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", expect.stringContaining("ephemeral"));
  });

  it("has a visible close button with aria-label", () => {
    render(
      <WordLookup word="test" position={DEFAULT_POSITION} onClose={jest.fn()} />
    );
    const closeBtn = screen.getByRole("button", { name: /close definition/i });
    expect(closeBtn).toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = jest.fn();
    render(
      <WordLookup word="test" position={DEFAULT_POSITION} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /close definition/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
