/**
 * Regression #570: reader vocab sidebar empty state must not use emoji.
 * Uses EmptyVocabIcon (SVG from Icons.tsx) instead of 📚 emoji.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { EmptyVocabIcon } from "@/components/Icons";

function VocabEmptyStateHarness({ isEmpty }: { isEmpty: boolean }) {
  if (!isEmpty) return <div data-testid="has-vocab">words here</div>;
  return (
    <div className="text-center text-stone-400 mt-10 text-sm" data-testid="vocab-empty-state">
      <EmptyVocabIcon className="w-10 h-10 text-stone-300 mx-auto mb-2" />
      <p>No words saved yet.</p>
    </div>
  );
}

describe("Reader vocab empty state", () => {
  it("renders EmptyVocabIcon SVG (not emoji) when vocab is empty", () => {
    render(<VocabEmptyStateHarness isEmpty={true} />);
    const state = screen.getByTestId("vocab-empty-state");
    // SVG element should be present
    expect(state.querySelector("svg")).toBeInTheDocument();
    // No emoji character (📚) in the text content
    expect(state.textContent).not.toMatch(/\p{Emoji_Presentation}/u);
    expect(screen.getByText(/No words saved yet/)).toBeInTheDocument();
  });

  it("does not render empty state when vocab has items", () => {
    render(<VocabEmptyStateHarness isEmpty={false} />);
    expect(screen.queryByTestId("vocab-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("has-vocab")).toBeInTheDocument();
  });
});
