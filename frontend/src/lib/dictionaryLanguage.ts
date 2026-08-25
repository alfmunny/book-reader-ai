/**
 * The language definitions are looked up *in* — distinct from the language a word
 * is written in. A German reader may want "gehen" explained in Chinese (#2704).
 *
 * The choice is remembered locally so the tooltip opens in the same language next
 * time without a round-trip to the server.
 */
export const DICTIONARY_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

export const DEFAULT_DICTIONARY_LANGUAGE = "en";

const STORAGE_KEY = "dictionaryLanguage";

export function readDictionaryLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_DICTIONARY_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && DICTIONARY_LANGUAGES.some((l) => l.code === stored)) return stored;
  } catch {
    // Private mode or a disabled store — the default is a fine answer.
  }
  return DEFAULT_DICTIONARY_LANGUAGE;
}

export function writeDictionaryLanguage(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Nothing to do: the picker still works for the rest of the session.
  }
}

export function dictionaryLanguageLabel(code: string | null | undefined): string {
  return DICTIONARY_LANGUAGES.find((l) => l.code === code)?.label ?? (code ?? "");
}
