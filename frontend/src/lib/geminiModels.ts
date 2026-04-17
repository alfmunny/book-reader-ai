export interface ModelOption {
  value: string;
  label: string;
  note: string;
  // Conservative free-tier rate limits. Google's published tiers shift
  // around, so these are rounded down to a safe floor. Admins on a paid
  // tier can bump them via the (advanced) API, but for the common free-key
  // case these keep us inside the quota without constant 429s.
  rpm: number;
  rpd: number;
  // Per-request output token budget. 2.5-pro can emit ~64K in one call, so
  // it pays to pack many chapters per batch; flash models cap at 8K and
  // need tighter batches. The worker uses this to size greedy batches so
  // we neither waste context (too few chapters) nor truncate (too many).
  maxOutputTokens: number;
}

// Used by QueueTab and BulkTranslateTab. Picking a model auto-applies the
// matching RPM/RPD to the queue settings so admins don't have to guess.
export const GEMINI_MODEL_OPTIONS: ModelOption[] = [
  {
    value: "",
    label: "Default (gemini-3.1-flash-lite-preview)",
    note: "Same model used for chat and insights — known to work with your key. Fast and cheap; fine for most translations.",
    rpm: 12,
    rpd: 1400,
    maxOutputTokens: 7500,
  },
  {
    value: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    note: "Highest quality, 64K output tokens — packs many chapters per batch, offsetting the tiny free-tier RPM. Best for overnight runs.",
    rpm: 2,
    rpd: 50,
    maxOutputTokens: 60000,
  },
  {
    value: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    note: "Strong literary quality, 8K output tokens. Moderate free-tier limits — good balance of quality and throughput.",
    rpm: 10,
    rpd: 250,
    maxOutputTokens: 7500,
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "gemini-2.5-flash-lite",
    note: "Cheapest and fastest in the 2.5 line. Lower quality — fine for quick drafts or less demanding target languages.",
    rpm: 15,
    rpd: 1000,
    maxOutputTokens: 7500,
  },
  {
    value: "gemini-2.0-flash",
    label: "gemini-2.0-flash",
    note: "Previous generation — widely available, stable quality, generous free-tier limits.",
    rpm: 15,
    rpd: 1500,
    maxOutputTokens: 7500,
  },
  {
    value: "gemini-2.0-flash-lite",
    label: "gemini-2.0-flash-lite",
    note: "Lightest model in the 2.0 line. Highest free-tier RPM — use if you're hitting 429 with heavier models.",
    rpm: 30,
    rpd: 1500,
    maxOutputTokens: 7500,
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
