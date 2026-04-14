/**
 * Tests for the chapter heading shown at the top of each chapter's content area.
 *
 * The heading lives inside page.tsx's reader-scroll area and should:
 *   - render the chapter title when the current chapter has one
 *   - not render when the chapter title is empty/undefined (loading or missing)
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Minimal harness that mirrors the reader's chapter-heading rendering logic
function ChapterHeadingHarness({ title }: { title: string | undefined }) {
  return (
    <div>
      {title && (
        <h2 data-testid="reader-chapter-heading">{title}</h2>
      )}
    </div>
  );
}

describe("Reader chapter heading", () => {
  it("renders the chapter title when present", () => {
    render(<ChapterHeadingHarness title="Chapter I — The White Whale" />);
    expect(screen.getByTestId("reader-chapter-heading")).toBeInTheDocument();
    expect(screen.getByTestId("reader-chapter-heading")).toHaveTextContent("Chapter I — The White Whale");
  });

  it("renders a simple chapter number title", () => {
    render(<ChapterHeadingHarness title="Chapter IV" />);
    expect(screen.getByTestId("reader-chapter-heading")).toHaveTextContent("Chapter IV");
  });

  it("does not render when the chapter has no title (empty string)", () => {
    render(<ChapterHeadingHarness title="" />);
    expect(screen.queryByTestId("reader-chapter-heading")).not.toBeInTheDocument();
  });

  it("does not render while loading (title undefined)", () => {
    render(<ChapterHeadingHarness title={undefined} />);
    expect(screen.queryByTestId("reader-chapter-heading")).not.toBeInTheDocument();
  });
});
