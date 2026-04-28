/**
 * @jest-environment node
 *
 * Covers the SSR-guard branches in lib/audio.ts (lines 18, 34, 44):
 *   if (typeof window === "undefined") return 0;
 *   if (typeof window === "undefined") return;
 *
 * These fire only in server-side rendering where window is not defined.
 * Requires the jest.setup.js window guard from PR #2022.
 * Closes #2025.
 */
import { getAudioPosition, saveAudioPosition, clearAudioPosition } from "@/lib/audio";

test("getAudioPosition returns 0 in SSR (window undefined)", () => {
  expect(getAudioPosition(1, 0)).toBe(0);
});

test("saveAudioPosition is a no-op in SSR (window undefined, does not throw)", () => {
  expect(() => saveAudioPosition(1, 0, 42)).not.toThrow();
});

test("clearAudioPosition is a no-op in SSR (window undefined, does not throw)", () => {
  expect(() => clearAudioPosition(1, 0)).not.toThrow();
});
