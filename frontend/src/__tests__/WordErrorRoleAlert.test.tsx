/**
 * Regression test for #1234: error displays in WordActionDrawer and WordLookup
 * must have role="alert" so screen readers announce them.
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

beforeEach(() => {
  global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
});

afterEach(() => {
  jest.restoreAllMocks();
});

// --- WordActionDrawer ---
import WordActionDrawer from "@/components/WordActionDrawer";

const ACTION = {
  word: "ephemeral",
  sentenceText: "It was an ephemeral moment.",
  segmentStartTime: 0,
  chapterIndex: 0,
};

test("WordActionDrawer error has role=alert when lookup fails", async () => {
  render(
    <WordActionDrawer
      action={ACTION}
      onClose={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

// --- WordLookup ---
import WordLookup from "@/components/WordLookup";

test("WordLookup error has role=alert when lookup fails", async () => {
  render(
    <WordLookup
      word="ephemeral"
      position={{ x: 100, y: 100 }}
      onClose={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
