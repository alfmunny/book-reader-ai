/**
 * Tests for lib/settings.ts
 */

import { getSettings, saveSettings } from "@/lib/settings";

beforeEach(() => localStorage.clear());

test("getSettings returns defaults when nothing is saved", () => {
  const s = getSettings();
  expect(s.insightLang).toBe("en");
  expect(s.translationLang).toBe("en");
  expect(s.ttsGender).toBe("female");
});

test("ttsGender can be saved and read back", () => {
  saveSettings({ ttsGender: "male" });
  expect(getSettings().ttsGender).toBe("male");
});

test("missing ttsGender in stored settings falls back to default", () => {
  localStorage.setItem(
    "book-reader-settings",
    JSON.stringify({ insightLang: "de", translationLang: "fr" })
  );
  const s = getSettings();
  expect(s.ttsGender).toBe("female");
  expect(s.insightLang).toBe("de");
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
  saveSettings({ ttsGender: "male" });
  const s = getSettings();
  expect(s.ttsGender).toBe("male");
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
