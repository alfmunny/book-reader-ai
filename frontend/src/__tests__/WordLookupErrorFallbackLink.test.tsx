/**
 * Regression test for #2482: WordLookup must show a Wiktionary fallback link
 * when the dictionary API returns no definition, so the popup is never a dead end.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import WordLookup from "@/components/WordLookup";

const DEFAULT_POSITION = { x: 200, y: 300 };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WordLookup — error fallback link (closes #2482)", () => {
  it("shows a Wiktionary link when the API returns 404", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: jest.fn() });

    render(
      <WordLookup
        word="xyzzy"
        position={DEFAULT_POSITION}
        language="en"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    const link = screen.getByRole("link", { name: /Search Wiktionary/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("wiktionary.org/wiki/xyzzy"));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("constructs Wiktionary URL using the word prop when fetch rejects", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

    render(
      <WordLookup
        word="serendipity"
        position={DEFAULT_POSITION}
        language="en"
        onClose={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    const link = screen.getByRole("link", { name: /Search Wiktionary/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("wiktionary.org/wiki/serendipity"));
  });
});
