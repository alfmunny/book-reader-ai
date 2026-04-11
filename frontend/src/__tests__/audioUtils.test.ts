/**
 * Tests for lib/audioUtils.ts
 *
 * The heavy Web Audio path is mocked; we focus on caching behaviour
 * and graceful fallback when the browser API is unavailable.
 */

import { detectContentStart } from "@/lib/audioUtils";

const TEST_URL = "https://audio.example.com/track.mp3";

beforeEach(() => {
  localStorage.clear();
  // Remove AudioContext so the default fallback path is taken
  Object.defineProperty(window, "AudioContext", { value: undefined, writable: true, configurable: true });
});

// ── Cache ─────────────────────────────────────────────────────────────────────

test("returns cached value from localStorage without fetching", async () => {
  localStorage.setItem(`audio-start:${TEST_URL}`, "12.5");
  global.fetch = jest.fn();
  const result = await detectContentStart(TEST_URL);
  expect(result).toBe(12.5);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("cached value of 0 is returned (not treated as missing)", async () => {
  localStorage.setItem(`audio-start:${TEST_URL}`, "0");
  global.fetch = jest.fn();
  const result = await detectContentStart(TEST_URL);
  expect(result).toBe(0);
  expect(global.fetch).not.toHaveBeenCalled();
});

// ── No AudioContext fallback ──────────────────────────────────────────────────

test("returns 0 when window.AudioContext is not available", async () => {
  const result = await detectContentStart(TEST_URL);
  expect(result).toBe(0);
});

// ── Fetch error fallback ──────────────────────────────────────────────────────

test("returns 0 when fetch throws", async () => {
  Object.defineProperty(window, "AudioContext", {
    value: class {
      decodeAudioData = jest.fn();
      close = jest.fn().mockResolvedValue(undefined);
    },
    writable: true,
    configurable: true,
  });
  global.fetch = jest.fn().mockRejectedValue(new Error("network error"));
  const result = await detectContentStart(TEST_URL);
  expect(result).toBe(0);
});

// ── decodeAudioData error fallback ────────────────────────────────────────────

test("returns 0 when decodeAudioData fails", async () => {
  const mockClose = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, "AudioContext", {
    value: class {
      decodeAudioData = jest.fn().mockRejectedValue(new Error("decode error"));
      close = mockClose;
    },
    writable: true,
    configurable: true,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  });
  const result = await detectContentStart(TEST_URL);
  expect(result).toBe(0);
  expect(mockClose).toHaveBeenCalled();
});

// ── Full path: speech gap detected ────────────────────────────────────────────

test("returns speech-resume offset when a gap is detected after 8s", async () => {
  const sampleRate = 100; // 100 Hz → 1 sample = 10ms, 1 window = 5 samples (50ms)
  // 8s = 800 samples minimum before gap, then silence, then speech
  // Construct: 1000 samples of noise, 50 samples silence, 50 samples noise
  const totalSamples = 1100;
  const data = new Float32Array(totalSamples);
  // Loud speech: 0..999
  for (let i = 0; i < 1000; i++) data[i] = 0.8;
  // Silence: 1000..1049
  for (let i = 1000; i < 1050; i++) data[i] = 0.0;
  // Speech resumes: 1050..1099
  for (let i = 1050; i < 1100; i++) data[i] = 0.8;

  const mockBuf = {
    getChannelData: jest.fn().mockReturnValue(data),
    sampleRate,
    duration: totalSamples / sampleRate,
  };

  Object.defineProperty(window, "AudioContext", {
    value: class {
      decodeAudioData = jest.fn().mockResolvedValue(mockBuf);
      close = jest.fn().mockResolvedValue(undefined);
    },
    writable: true,
    configurable: true,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  });

  const result = await detectContentStart(TEST_URL);
  // Should detect the gap and return a positive offset
  expect(result).toBeGreaterThan(0);
});

test("caches the detected value in localStorage", async () => {
  const sampleRate = 100;
  const data = new Float32Array(1100);
  for (let i = 0; i < 1000; i++) data[i] = 0.8;
  for (let i = 1050; i < 1100; i++) data[i] = 0.8;

  const mockBuf = { getChannelData: jest.fn().mockReturnValue(data), sampleRate };
  Object.defineProperty(window, "AudioContext", {
    value: class {
      decodeAudioData = jest.fn().mockResolvedValue(mockBuf);
      close = jest.fn().mockResolvedValue(undefined);
    },
    writable: true,
    configurable: true,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
  });

  await detectContentStart(TEST_URL);
  expect(localStorage.getItem(`audio-start:${TEST_URL}`)).not.toBeNull();
});
