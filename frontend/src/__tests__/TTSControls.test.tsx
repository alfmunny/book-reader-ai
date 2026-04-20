/**
 * Tests for TTSControls component.
 *
 * Mocks synthesizeSpeech and getTtsChunks from @/lib/api, and the audio
 * position helpers, so no real network or audio calls are made.
 */

import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import TTSControls from "@/components/TTSControls";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/lib/api", () => ({
  synthesizeSpeech: jest.fn(),
  getTtsChunks: jest.fn(),
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

import { synthesizeSpeech, getTtsChunks } from "@/lib/api";

const mockSynthesize = synthesizeSpeech as jest.Mock;
const mockGetChunks = getTtsChunks as jest.Mock;

// ── HTMLAudioElement mock ─────────────────────────────────────────────────────

class MockAudio {
  src: string;
  preload: string;
  playbackRate: number;
  currentTime: number;
  duration: number;
  private _listeners: Record<string, Array<() => void>> = {};

  constructor(src: string) {
    this.src = src;
    this.preload = "auto";
    this.playbackRate = 1;
    this.currentTime = 0;
    this.duration = 10;
  }

  addEventListener(event: string, handler: () => void, options?: unknown) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    // Immediately fire loadedmetadata so tests don't hang
    if (event === "loadedmetadata") {
      setTimeout(() => handler(), 0);
    }
  }

  removeEventListener() {}

  play() {
    return Promise.resolve();
  }

  pause() {}

  emit(event: string) {
    (this._listeners[event] || []).forEach((h) => h());
  }
}

// Store all created MockAudio instances so tests can inspect them
let audioInstances: MockAudio[] = [];

beforeEach(() => {
  audioInstances = [];
  // @ts-ignore
  global.Audio = jest.fn().mockImplementation((src: string) => {
    const inst = new MockAudio(src);
    audioInstances.push(inst);
    return inst;
  });
  global.URL.createObjectURL = jest.fn(() => "blob:test-url");
  global.URL.revokeObjectURL = jest.fn();
  window.speechSynthesis = { cancel: jest.fn() } as unknown as SpeechSynthesis;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Default props helper ──────────────────────────────────────────────────────

const DEFAULT_PROPS = {
  text: "Chapter one. This is some text to read aloud.",
  language: "en",
  bookId: 1,
  chapterIndex: 0,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

test("renders idle state with play button when text is empty", () => {
  render(<TTSControls {...DEFAULT_PROPS} text="" />);
  // No play/pause button shown (idle)
  expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
});

test("renders paused state play button when text is present", () => {
  render(<TTSControls {...DEFAULT_PROPS} />);
  // Should show a play button (▶ or similar)
  const buttons = screen.getAllByRole("button");
  expect(buttons.length).toBeGreaterThan(0);
});

test("clicking play triggers getTtsChunks and synthesizeSpeech", async () => {
  mockGetChunks.mockResolvedValue(["Chunk one.", "Chunk two."]);
  mockSynthesize.mockResolvedValue({ url: "blob:audio", wordBoundaries: [] });

  render(<TTSControls {...DEFAULT_PROPS} />);

  // Find the play button (▶) — it's not a text button, look by title or aria
  const buttons = screen.getAllByRole("button");
  const playBtn = buttons.find((b) => b.title?.includes("Play") || b.getAttribute("title")?.includes("▶") || b.textContent?.includes("▶")) ?? buttons[0];

  await act(async () => {
    fireEvent.click(playBtn);
  });

  await waitFor(() => {
    expect(mockGetChunks).toHaveBeenCalledWith(DEFAULT_PROPS.text);
  });
});

test("calls onPlaybackUpdate when status changes", async () => {
  const onPlaybackUpdate = jest.fn();
  render(<TTSControls {...DEFAULT_PROPS} onPlaybackUpdate={onPlaybackUpdate} />);
  // onPlaybackUpdate is called on status changes via useEffect
  await waitFor(() => {
    expect(onPlaybackUpdate).toHaveBeenCalled();
  });
});

test("calls onLoadingChange with true when loading starts", async () => {
  const onLoadingChange = jest.fn();
  mockGetChunks.mockResolvedValue(["Text"]);
  // Keep synthesize pending so we stay in loading state
  mockSynthesize.mockReturnValue(new Promise(() => {}));

  render(<TTSControls {...DEFAULT_PROPS} onLoadingChange={onLoadingChange} />);

  const buttons = screen.getAllByRole("button");
  await act(async () => {
    fireEvent.click(buttons[0]);
  });

  await waitFor(() => {
    expect(onLoadingChange).toHaveBeenCalledWith(true);
  });
});

test("calls onChunksUpdate when chunks are loaded", async () => {
  const onChunksUpdate = jest.fn();
  mockGetChunks.mockResolvedValue(["First chunk."]);
  mockSynthesize.mockResolvedValue({ url: "blob:audio1", wordBoundaries: [{ offset_ms: 0, text: "First" }] });

  render(<TTSControls {...DEFAULT_PROPS} onChunksUpdate={onChunksUpdate} />);

  const buttons = screen.getAllByRole("button");
  await act(async () => {
    fireEvent.click(buttons[0]);
    await new Promise((r) => setTimeout(r, 50));
  });

  await waitFor(() => {
    expect(onChunksUpdate).toHaveBeenCalled();
  });
});

test("shows error message when synthesis fails", async () => {
  jest.useFakeTimers();
  mockGetChunks.mockResolvedValue(["Chunk."]);
  mockSynthesize.mockRejectedValue(new Error("TTS API down"));

  render(<TTSControls {...DEFAULT_PROPS} />);

  const buttons = screen.getAllByRole("button");
  await act(async () => {
    fireEvent.click(buttons[0]);
    await jest.runAllTimersAsync();
  });

  jest.useRealTimers();
  expect(screen.getByText(/TTS API down/i)).toBeInTheDocument();
});

test("shows error message when no chunks returned", async () => {
  mockGetChunks.mockResolvedValue([]);

  render(<TTSControls {...DEFAULT_PROPS} />);

  const buttons = screen.getAllByRole("button");
  await act(async () => {
    fireEvent.click(buttons[0]);
    await new Promise((r) => setTimeout(r, 20));
  });

  await waitFor(() => {
    expect(screen.getByText(/No text to read/i)).toBeInTheDocument();
  });
});

test("rate selector renders available speed options", () => {
  render(<TTSControls {...DEFAULT_PROPS} />);
  // Speed control is a range input
  const rangeInputs = document.querySelectorAll("input[type='range']");
  expect(rangeInputs.length).toBeGreaterThan(0);
});

test("gender toggle button is present", () => {
  render(<TTSControls {...DEFAULT_PROPS} />);
  const buttons = screen.getAllByRole("button");
  // One of the buttons is for gender (♀/♂ or female/male label)
  const hasGenderButton = buttons.some((b) =>
    b.textContent?.includes("♀") ||
    b.textContent?.includes("♂") ||
    b.title?.toLowerCase().includes("voice") ||
    b.getAttribute("title")?.toLowerCase().includes("voice")
  );
  expect(hasGenderButton).toBe(true);
});

test("registers seek function via onSeekRegister", async () => {
  const onSeekRegister = jest.fn();
  render(<TTSControls {...DEFAULT_PROPS} onSeekRegister={onSeekRegister} />);

  await waitFor(() => {
    expect(onSeekRegister).toHaveBeenCalledWith(expect.any(Function));
  });
});

test("chapter change resets state", async () => {
  const { rerender } = render(<TTSControls {...DEFAULT_PROPS} chapterIndex={0} />);
  rerender(<TTSControls {...DEFAULT_PROPS} chapterIndex={1} />);
  // After chapter change, getTtsChunks should not have been called (reset to idle/paused)
  expect(mockGetChunks).not.toHaveBeenCalled();
});
