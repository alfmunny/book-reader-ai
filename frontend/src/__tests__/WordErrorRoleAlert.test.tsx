/**
 * Regression tests for #1234 and #1236: error displays in WordActionDrawer,
 * WordLookup, and TTSControls must have role="alert".
 */
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

beforeEach(() => {
  global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));
  // @ts-ignore
  global.Audio = jest.fn().mockImplementation(() => ({
    src: "",
    preload: "auto",
    playbackRate: 1,
    currentTime: 0,
    duration: 10,
    addEventListener: (event: string, handler: () => void) => {
      if (event === "loadedmetadata") setTimeout(handler, 0);
    },
    removeEventListener: jest.fn(),
    play: () => Promise.resolve(),
    pause: jest.fn(),
  }));
  global.URL.createObjectURL = jest.fn(() => "blob:test-url");
  global.URL.revokeObjectURL = jest.fn();
  window.speechSynthesis = { cancel: jest.fn() } as unknown as SpeechSynthesis;
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

// --- TTSControls ---
jest.mock("@/lib/api", () => ({
  synthesizeSpeech: jest.fn().mockRejectedValue(new Error("TTS failed")),
  getTtsChunks: jest.fn().mockResolvedValue(["Hello world."]),
}));
jest.mock("@/lib/settings", () => ({
  getSettings: jest.fn(() => ({ ttsGender: "female" })),
  saveSettings: jest.fn(),
}));
jest.mock("@/lib/audio", () => ({
  getAudioPosition: jest.fn(() => 0),
  saveAudioPosition: jest.fn(),
  clearAudioPosition: jest.fn(),
}));

import TTSControls from "@/components/TTSControls";

const TTS_PROPS = {
  text: "Hello world.",
  language: "en",
  bookId: 1,
  chapterIndex: 0,
};

test("TTSControls error has role=alert when synthesis fails", async () => {
  jest.useFakeTimers();
  render(<TTSControls {...TTS_PROPS} />);

  const buttons = screen.getAllByRole("button");
  await act(async () => {
    fireEvent.click(buttons[0]);
    await jest.runAllTimersAsync();
  });
  jest.useRealTimers();

  await waitFor(() => {
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
