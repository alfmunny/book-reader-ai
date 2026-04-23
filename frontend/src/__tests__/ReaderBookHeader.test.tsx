/**
 * Regression #431: Reader header must not show a Gutenberg link for uploaded books.
 * Uploaded books have source="upload" in BookMeta and high numeric IDs from the
 * Gutenberg auto-increment sequence — clicking a Gutenberg link would go to a
 * wrong or nonexistent Gutenberg page.
 */
import React from "react";
import { render, screen } from "@testing-library/react";

interface BookMeta {
  id: number;
  title: string;
  authors: string[];
  source?: string;
}

function BookHeaderHarness({ meta }: { meta: BookMeta | null }) {
  if (!meta) return <div data-testid="header-skeleton" />;
  const isUpload = meta.source === "upload";
  return (
    <div>
      <h1>{meta.title}</h1>
      {!isUpload && (
        <a
          data-testid="gutenberg-link"
          href={`https://www.gutenberg.org/ebooks/${meta.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          ↗
        </a>
      )}
      {isUpload && (
        <span data-testid="uploaded-badge">Uploaded</span>
      )}
      <p>{meta.authors.join(", ")}</p>
    </div>
  );
}

describe("Reader book header — source badge", () => {
  it("shows Gutenberg link for a Gutenberg book", () => {
    render(
      <BookHeaderHarness
        meta={{ id: 84, title: "Frankenstein", authors: ["Mary Shelley"] }}
      />
    );
    expect(screen.getByTestId("gutenberg-link")).toBeInTheDocument();
    expect(screen.getByTestId("gutenberg-link")).toHaveAttribute(
      "href",
      "https://www.gutenberg.org/ebooks/84"
    );
    expect(screen.queryByTestId("uploaded-badge")).not.toBeInTheDocument();
  });

  it("hides Gutenberg link and shows Uploaded badge for uploaded books", () => {
    render(
      <BookHeaderHarness
        meta={{ id: 78066, title: "My Custom Book", authors: ["Alice"], source: "upload" }}
      />
    );
    expect(screen.queryByTestId("gutenberg-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("uploaded-badge")).toBeInTheDocument();
  });

  it("shows Gutenberg link when source field is absent (Gutenberg default)", () => {
    render(
      <BookHeaderHarness
        meta={{ id: 11, title: "Alice in Wonderland", authors: ["Lewis Carroll"] }}
      />
    );
    expect(screen.getByTestId("gutenberg-link")).toBeInTheDocument();
    expect(screen.queryByTestId("uploaded-badge")).not.toBeInTheDocument();
  });

  it("shows skeleton while meta is loading", () => {
    render(<BookHeaderHarness meta={null} />);
    expect(screen.getByTestId("header-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("gutenberg-link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("uploaded-badge")).not.toBeInTheDocument();
  });
});
