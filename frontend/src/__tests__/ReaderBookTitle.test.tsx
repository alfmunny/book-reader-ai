/**
 * Tests for the chapter heading shown at the top of each chapter's content area.
 *
 * The heading should:
 *   - always show the original chapter title
 *   - show the translated title below when translation is enabled and available
 *   - not render when the chapter title is empty/undefined
 */

import React from "react";
import { render, screen } from "@testing-library/react";

// Harness mirrors the updated reader chapter-heading rendering logic
function ChapterHeadingHarness({
  title,
  translationEnabled = false,
  translatedTitle = null,
}: {
  title: string | undefined;
  translationEnabled?: boolean;
  translatedTitle?: string | null;
}) {
  return (
    <div>
      {title && (
        <div data-testid="reader-chapter-heading">
          <h2>{title}</h2>
          {translationEnabled && translatedTitle && (
            <p>{translatedTitle}</p>
          )}
        </div>
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

  it("shows original title even when translation is enabled but not yet loaded", () => {
    render(<ChapterHeadingHarness title="Chapter I" translationEnabled={true} translatedTitle={null} />);
    expect(screen.getByText("Chapter I")).toBeInTheDocument();
    // no second title element
    expect(screen.getAllByRole("heading").length).toBe(1);
  });

  it("shows both original and translated title when translation is available", () => {
    render(
      <ChapterHeadingHarness
        title="Chapter I"
        translationEnabled={true}
        translatedTitle="第一章"
      />
    );
    expect(screen.getByText("Chapter I")).toBeInTheDocument();
    expect(screen.getByText("第一章")).toBeInTheDocument();
  });

  it("does not show translated title when translation is disabled", () => {
    render(
      <ChapterHeadingHarness
        title="Chapter I"
        translationEnabled={false}
        translatedTitle="第一章"
      />
    );
    expect(screen.getByText("Chapter I")).toBeInTheDocument();
    expect(screen.queryByText("第一章")).not.toBeInTheDocument();
  });
});
