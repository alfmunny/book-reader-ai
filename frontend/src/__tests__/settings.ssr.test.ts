/**
 * @jest-environment node
 *
 * Covers the two SSR-guard branches in lib/settings.ts (lines 43 and 53):
 *   if (typeof window === "undefined") return { ...DEFAULTS };
 *   if (typeof window === "undefined") return;
 *
 * These can only be hit in a node environment where window is not defined.
 * Closes #2015.
 */
import { getSettings, saveSettings } from "@/lib/settings";

test("getSettings returns defaults in SSR (window undefined)", () => {
  const s = getSettings();
  expect(s.insightLang).toBe("en");
  expect(s.ttsGender).toBe("female");
  expect(s.translationEnabled).toBe(false);
});

test("saveSettings is a no-op in SSR (window undefined, does not throw)", () => {
  expect(() => saveSettings({ insightLang: "de" })).not.toThrow();
});
