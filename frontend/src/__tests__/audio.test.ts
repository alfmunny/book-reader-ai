/**
 * Tests for lib/audio.ts — persistent playback positions per (book, chapter).
 */

import {
  getAudioPosition,
  saveAudioPosition,
  clearAudioPosition,
} from "@/lib/audio";

beforeEach(() => localStorage.clear());

test("getAudioPosition returns 0 for an unknown chapter", () => {
  expect(getAudioPosition(1342, 0)).toBe(0);
});

test("saveAudioPosition then getAudioPosition round-trips", () => {
  saveAudioPosition(1342, 0, 42.5);
  expect(getAudioPosition(1342, 0)).toBe(42.5);
});

test("positions are independent per chapter", () => {
  saveAudioPosition(1342, 0, 10);
  saveAudioPosition(1342, 1, 20);
  expect(getAudioPosition(1342, 0)).toBe(10);
  expect(getAudioPosition(1342, 1)).toBe(20);
});

test("positions are independent per book", () => {
  saveAudioPosition(1342, 0, 10);
  saveAudioPosition(2229, 0, 30);
  expect(getAudioPosition(1342, 0)).toBe(10);
  expect(getAudioPosition(2229, 0)).toBe(30);
});

test("clearAudioPosition removes a saved position", () => {
  saveAudioPosition(1342, 0, 10);
  clearAudioPosition(1342, 0);
  expect(getAudioPosition(1342, 0)).toBe(0);
});

test("clearAudioPosition does not throw for an unknown chapter", () => {
  expect(() => clearAudioPosition(9999, 99)).not.toThrow();
});

test("getAudioPosition ignores invalid stored values", () => {
  localStorage.setItem("audio_position:1342:0", "not-a-number");
  expect(getAudioPosition(1342, 0)).toBe(0);
});

test("getAudioPosition ignores negative stored values", () => {
  localStorage.setItem("audio_position:1342:0", "-5");
  expect(getAudioPosition(1342, 0)).toBe(0);
});

test("saveAudioPosition silently ignores invalid input", () => {
  saveAudioPosition(1342, 0, NaN);
  saveAudioPosition(1342, 0, -1);
  expect(getAudioPosition(1342, 0)).toBe(0);
});
