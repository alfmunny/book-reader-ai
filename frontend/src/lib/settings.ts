export interface AppSettings {
  insightLang: string;
  translationLang: string;
}

const DEFAULTS: AppSettings = {
  insightLang: "en",
  translationLang: "en",
};

const KEY = "book-reader-settings";

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(updates: Partial<AppSettings>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...updates }));
}
