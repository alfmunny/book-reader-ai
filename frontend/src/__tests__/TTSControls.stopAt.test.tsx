/**
 * Tests for TTSControls stopAtTime / onStopAtReached behaviour.
 */

import React from "react";
import { render, screen, act } from "@testing-library/react";
import TTSControls from "@/components/TTSControls";

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

class MockAudio {
  src: string;
  preload = "auto";
  playbackRate = 1;
  currentTime = 0;
  duration = 5;
  private _listeners: Record<string, (() => void)[]> = {};

  constructor(src: string) { this.src = src; }

  addEventListener(ev: string, handler: () => void) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(handler);
    if (ev === "loadedmetadata") setTimeout(() => handler(), 0);
  }
  removeEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}

  emit(ev: string) {
    (this._listeners[ev] || []).forEach((h) => h());
  }
}

let audioInstances: MockAudio[] = [];

beforeEach(() => {
  audioInstances = [];
  // @ts-ignore
  global.Audio = jest.fn().mockImplementation((src: string) => {
    const inst = new MockAudio(src);
    audioInstances.push(inst);
    return inst;
  });
  global.URL.createObjectURL = jest.fn(() => "blob:test");
  global.URL.revokeObjectURL = jest.fn();
  window.speechSynthesis = { cancel: jest.fn() } as unknown as SpeechSynthesis;
});

afterEach(() => jest.clearAllMocks());

const DEFAULT_PROPS = {
  text: "Hello world.",
  language: "en",
  bookId: 1,
  chapterIndex: 0,
};

test("onStopAtReached fires when currentTime reaches stopAtTime", async () => {
  mockGetChunks.mockResolvedValue(["Hello world."]);
  mockSynthesize.mockResolvedValue({ url: "blob:audio", wordBoundaries: [] });

  const onStopAtReached = jest.fn();

  render(
    <TTSControls
      {...DEFAULT_PROPS}
      stopAtTime={3}
      onStopAtReached={onStopAtReached}
    />
  );

  // Start playback
  const playBtn = screen.getByText(/Read/i);
  await act(async () => { playBtn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

  // Simulate audio timeupdate past stopAtTime
  await act(async () => {
    const audio = audioInstances[0];
    if (audio) {
      audio.currentTime = 3.5; // past stopAtTime=3
      audio.emit("timeupdate");
    }
  });

  expect(onStopAtReached).toHaveBeenCalled();
});

test("does not auto-pause when stopAtTime is undefined", async () => {
  mockGetChunks.mockResolvedValue(["Hello world."]);
  mockSynthesize.mockResolvedValue({ url: "blob:audio", wordBoundaries: [] });

  const onStopAtReached = jest.fn();

  render(
    <TTSControls
      {...DEFAULT_PROPS}
      stopAtTime={undefined}
      onStopAtReached={onStopAtReached}
    />
  );

  const playBtn = screen.getByText(/Read/i);
  await act(async () => { playBtn.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

  await act(async () => {
    const audio = audioInstances[0];
    if (audio) {
      audio.currentTime = 10;
      audio.emit("timeupdate");
    }
  });

  expect(onStopAtReached).not.toHaveBeenCalled();
});
