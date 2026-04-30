/**
 * Regression test for issue #2419 — VocabWordTooltip must show an error state
 * with Retry on getWordDefinition failure instead of misleading "No definition found."
 */
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/lib/api", () => ({
  getWordDefinition: jest.fn(),
}));

jest.mock("@/lib/useFocusTrap", () => ({ useFocusTrap: jest.fn() }));

import * as api from "@/lib/api";
import VocabWordTooltip from "@/components/VocabWordTooltip";

const mockGetWordDefinition = api.getWordDefinition as jest.MockedFunction<typeof api.getWordDefinition>;

const RECT = {
  left: 100, top: 100, right: 200, bottom: 120,
  width: 100, height: 20, x: 100, y: 100, toJSON: () => {},
} as DOMRect;

const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

const defaultProps = {
  word: "ephemeral",
  lang: "en",
  rect: RECT,
  onClose: jest.fn(),
  onSave: jest.fn(),
};

describe("VocabWordTooltip — error state (issue #2419)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows error state with Retry when getWordDefinition rejects", async () => {
    mockGetWordDefinition.mockRejectedValue(new Error("Network error"));

    render(<VocabWordTooltip {...defaultProps} />);
    await act(async () => await flushPromises());

    expect(screen.getByText(/Couldn't load definition/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText(/No definition found/i)).not.toBeInTheDocument();
  });

  it("retries fetch when Retry is clicked", async () => {
    mockGetWordDefinition
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({
        lemma: "ephemeral",
        language: "en",
        definitions: [{ pos: "adj", text: "short-lived" }],
        url: "",
      });

    render(<VocabWordTooltip {...defaultProps} />);
    await act(async () => await flushPromises());

    const retryBtn = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(retryBtn);
    await act(async () => await flushPromises());

    await waitFor(() => expect(screen.getByText("short-lived")).toBeInTheDocument());
    expect(mockGetWordDefinition).toHaveBeenCalledTimes(2);
  });

  it("shows 'No definition found' (not error) when fetch succeeds with empty definitions", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "ephemeral",
      language: "en",
      definitions: [],
      url: "",
    });

    render(<VocabWordTooltip {...defaultProps} />);
    await act(async () => await flushPromises());

    expect(screen.getByText(/No definition found/i)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/i)).not.toBeInTheDocument();
  });

  it("shows definition content on successful fetch", async () => {
    mockGetWordDefinition.mockResolvedValue({
      lemma: "ephemeral",
      language: "en",
      definitions: [{ pos: "adj", text: "short-lived" }],
      url: "https://en.wiktionary.org/wiki/ephemeral",
    });

    render(<VocabWordTooltip {...defaultProps} />);
    await act(async () => await flushPromises());

    expect(screen.getByText("short-lived")).toBeInTheDocument();
    expect(screen.queryByText(/No definition found/i)).not.toBeInTheDocument();
  });
});
