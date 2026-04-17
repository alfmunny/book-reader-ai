export interface ModelOption {
  value: string;
  label: string;
  note: string;
  rpm: number;
  rpd: number;
  maxOutputTokens: number;
  // `true` = acceptable for literary translation (preserves register,
  // handles metaphor/register). `false` = lite/preview models that drop
  // nuance — still selectable as a last-ditch fallback, but visually
  // de-emphasised in the chain picker.
  recommended: boolean;
}

// Used by QueueTab and BulkTranslateTab. Picking a model auto-applies the
// matching RPM/RPD to the queue settings so admins don't have to guess.
export const GEMINI_MODEL_OPTIONS: ModelOption[] = [
  {
    value: "gemini-3.1-pro-preview",
    label: "gemini-3.1-pro-preview",
    note: "Frontier quality (3.1 family). Low RPD — reserve for the most important books. Packs up to 60K output tokens per batch.",
    rpm: 25,
    rpd: 250,
    maxOutputTokens: 60000,
    recommended: true,
  },
  {
    value: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    note: "Near-frontier quality. Higher RPD than 3.1-pro — good secondary when 3.1-pro is exhausted.",
    rpm: 150,
    rpd: 1000,
    maxOutputTokens: 60000,
    recommended: true,
  },
  {
    value: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    note: "Strong literary quality, 10K daily requests. Sweet spot for bulk work that still needs nuance.",
    rpm: 1000,
    rpd: 10000,
    maxOutputTokens: 7500,
    recommended: true,
  },
  {
    value: "gemini-3.1-flash-lite-preview",
    label: "gemini-3.1-flash-lite-preview",
    note: "Newest lite model — 150K daily requests. Drops nuance on dialogue but very high capacity. Good capacity fallback.",
    rpm: 4000,
    rpd: 150000,
    maxOutputTokens: 7500,
    recommended: false,
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "gemini-2.5-flash-lite",
    note: "Fast & cheap, unlimited daily requests. Usable only as a last-ditch fallback for literature.",
    rpm: 4000,
    rpd: 999999,
    maxOutputTokens: 7500,
    recommended: false,
  },
  {
    value: "",
    label: "Default (gemini-3.1-flash-lite-preview)",
    note: "Server default — same model used for chat/insights. Not recommended for literary work; kept for backward compat.",
    rpm: 4000,
    rpd: 150000,
    maxOutputTokens: 7500,
    recommended: false,
  },
];

// Conservative fallback when a custom model is typed in — we don't know
// its quota, so we pick something safe.
export const CUSTOM_MODEL_RATE: { rpm: number; rpd: number; maxOutputTokens: number } = {
  rpm: 10,
  rpd: 500,
  maxOutputTokens: 7500,
};

export function rateForModel(model: string): {
  rpm: number;
  rpd: number;
  maxOutputTokens: number;
} {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit
    ? { rpm: hit.rpm, rpd: hit.rpd, maxOutputTokens: hit.maxOutputTokens }
    : CUSTOM_MODEL_RATE;
}

export function labelForModel(model: string): string {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit?.label || model || "default";
}

export function isRecommended(model: string): boolean {
  const hit = GEMINI_MODEL_OPTIONS.find((o) => o.value === model);
  return hit?.recommended ?? false;
}

// Suggested default chain — matches the "Balanced" preset. Strong literary
// quality with a capacity fallback. Admins who want Premium or Budget can
// one-click switch via the preset buttons in the Queue tab.
// Note: gemini-2.0-flash and gemini-2.0-flash-lite are deprecated for new
// accounts (Google returns 404 for those). Defaults now avoid them.
export const DEFAULT_CHAIN: string[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

// Named presets that map admin intent ("cheap drafts" / "quality without
// breaking the bank" / "best money can buy") to a concrete chain. Picking a
// preset populates the chain picker; admin still saves explicitly.
export interface ChainPreset {
  id: "budget" | "balanced" | "premium";
  label: string;
  tagline: string;
  description: string;
  chain: string[];
}

export const CHAIN_PRESETS: ChainPreset[] = [
  {
    id: "budget",
    label: "Budget",
    tagline: "Cheap, high capacity",
    description:
      "Flash-lite only. Good for first-pass drafts or non-literary target languages where nuance matters less. Very high daily request limits — drain a whole library in one run.",
    chain: ["gemini-2.5-flash-lite", "gemini-3.1-flash-lite-preview"],
  },
  {
    id: "balanced",
    label: "Balanced",
    tagline: "Strong prose, affordable",
    description:
      "2.5-flash leads for its near-pro literary quality; 2.5-flash-lite catches overflow. The sweet spot for most libraries — clearly better than lite-only, a fraction of the pro cost.",
    chain: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
  {
    id: "premium",
    label: "Premium",
    tagline: "Frontier top, graceful degradation",
    description:
      "Start with 3.1-pro for the most faithful literary rendering; cascade to 2.5-pro, 2.5-flash, then 2.5-flash-lite as daily quotas are spent. Expensive but produces the best output.",
    chain: [
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
];

export function presetMatchingChain(
  chain: readonly string[],
): ChainPreset["id"] | null {
  for (const p of CHAIN_PRESETS) {
    if (
      p.chain.length === chain.length &&
      p.chain.every((m, i) => m === chain[i])
    ) {
      return p.id;
    }
  }
  return null;
}
