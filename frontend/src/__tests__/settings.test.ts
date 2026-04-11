/**
 * Tests for lib/settings.ts
 */

import { getSettings, saveSettings } from "@/lib/settings";

beforeEach(() => localStorage.clear());

test("getSettings returns defaults when nothing is saved", () => {
  const s = getSettings();
  expect(s.insightLang).toBe("en");
  expect(s.translationLang).toBe("en");
  expect(s.audiobookEnabled).toBe(true);
  expect(s.ttsProvider).toBe("auto");
});

test("ttsProvider can be saved and read back", () => {
  saveSettings({ ttsProvider: "google" });
  expect(getSettings().ttsProvider).toBe("google");
});

test("missing ttsProvider in stored settings falls back to default", () => {
  // Stored object lacks ttsProvider (e.g. saved by an older app version)
  localStorage.setItem(
    "book-reader-settings",
    JSON.stringify({ insightLang: "de", translationLang: "fr", audiobookEnabled: false })
  );
  const s = getSettings();
  expect(s.ttsProvider).toBe("auto");        // default applied
  expect(s.insightLang).toBe("de");          // existing values preserved
  expect(s.audiobookEnabled).toBe(false);
});

test("saveSettings persists a value", () => {
  saveSettings({ insightLang: "de" });
  expect(getSettings().insightLang).toBe("de");
});

test("saveSettings merges with existing settings", () => {
  saveSettings({ insightLang: "fr" });
  saveSettings({ translationLang: "es" });
  const s = getSettings();
  expect(s.insightLang).toBe("fr");
  expect(s.translationLang).toBe("es");
});

test("saveSettings partial update does not wipe other fields", () => {
  saveSettings({ audiobookEnabled: false });
  const s = getSettings();
  expect(s.audiobookEnabled).toBe(false);
  expect(s.insightLang).toBe("en"); // default preserved
});

test("getSettings returns defaults when localStorage contains invalid JSON", () => {
  localStorage.setItem("book-reader-settings", "bad-json");
  const s = getSettings();
  expect(s.insightLang).toBe("en");
});

test("unknown keys in storage are ignored gracefully", () => {
  localStorage.setItem("book-reader-settings", JSON.stringify({ unknownKey: "value" }));
  const s = getSettings();
  expect(s.insightLang).toBe("en");
});
