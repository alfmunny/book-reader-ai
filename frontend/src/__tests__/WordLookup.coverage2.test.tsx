/**
 * WordLookup — coverage2: uncovered branches
 *   Line 43: entry.phonetic || entry.phonetics[0].text fallback
 *   Line 44: entry.meanings ?? [] null fallback
 *   Line 68: non-Escape keydown (false branch)
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WordLookup from "@/components/WordLookup";

const POS = { x: 200, y: 300 };

beforeEach(() => jest.clearAllMocks());

// ── Line 43: phonetics[0].text fallback ──────────────────────────────────────

test("shows phonetic from phonetics array when entry.phonetic is absent", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([{
      word: "run",
      // phonetic is absent/undefined — falls to phonetics[0].text
      phonetics: [{ text: "/rʌn/" }],
      meanings: [{ partOfSpeech: "verb", definitions: [{ definition: "to move fast" }] }],
    }]),
  });

  render(<WordLookup word="run" position={POS} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("/rʌn/")).toBeInTheDocument());
});

// ── Line 44: entry.meanings ?? [] when meanings is null ───────────────────────

test("renders without definitions when entry.meanings is null", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([{
      word: "zzz",
      phonetic: "/z/",
      meanings: null,  // ?? [] kicks in → empty array
    }]),
  });

  render(<WordLookup word="zzz" position={POS} onClose={jest.fn()} />);
  await waitFor(() => expect(screen.getByText("zzz")).toBeInTheDocument());
  // No part-of-speech sections since meanings is empty
  expect(screen.queryByText("noun")).not.toBeInTheDocument();
});

// ── Line 68: non-Escape key does NOT close the popup ─────────────────────────

test("does not call onClose when a non-Escape key is pressed", () => {
  const onClose = jest.fn();
  global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));

  render(<WordLookup word="test" position={POS} onClose={onClose} />);

  fireEvent.keyDown(document, { key: "Enter" });
  expect(onClose).not.toHaveBeenCalled();

  fireEvent.keyDown(document, { key: "ArrowDown" });
  expect(onClose).not.toHaveBeenCalled();
});
