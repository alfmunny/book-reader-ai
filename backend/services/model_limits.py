"""Per-model rate limits + output token budgets (backend-side mirror).

Kept in sync with frontend/src/lib/geminiModels.ts. The backend needs its
own copy so the queue worker can decide per-model capacity without
round-tripping through the frontend — especially for the fallback-chain
logic where each model has its own rolling-window limiter.

If free-tier quotas change, update both this file and the frontend map.
"""

from typing import TypedDict


class _Limits(TypedDict):
    rpm: int
    rpd: int
    max_output_tokens: int
    # Tier 1 pay-as-you-go pricing, USD per 1M tokens (approximate — Google
    # updates pricing periodically; verify at ai.google.dev/pricing before
    # budgeting large runs). Used to surface cost estimates in the admin UI.
    input_usd_per_m: float
    output_usd_per_m: float


# Curated default chain for first-time admins: frontier quality first, then
# descending to highest-RPD model as a catch-all safety net. Overridable
# via the Queue settings UI.
DEFAULT_CHAIN: list[str] = [
    "gemini-3.1-pro-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]


# Tier 1 (paid / billing-enabled) limits, sourced from the admin's
# aistudio.google.com/rate-limit dashboard. "Unlimited" RPD is encoded as
# UNLIMITED_RPD so the rate limiter never blocks on daily cap.
#
# If Google changes quotas, update both this map and
# frontend/src/lib/geminiModels.ts — both are read by the UI.

UNLIMITED_RPD = 1_000_000  # treat as effectively unlimited

MODEL_LIMITS: dict[str, _Limits] = {
    # "" = server-side default (currently gemini-3.1-flash-lite-preview).
    # Same quota + pricing as gemini-3.1-flash-lite on Tier 1.
    "": {
        "rpm": 4000, "rpd": 150000, "max_output_tokens": 7500,
        "input_usd_per_m": 0.10, "output_usd_per_m": 0.40,
    },
    # Frontier 3.1 family
    "gemini-3.1-pro-preview": {
        "rpm": 25, "rpd": 250, "max_output_tokens": 60000,
        "input_usd_per_m": 1.25, "output_usd_per_m": 10.00,
    },
    "gemini-3.1-flash-lite-preview": {
        "rpm": 4000, "rpd": 150000, "max_output_tokens": 7500,
        "input_usd_per_m": 0.10, "output_usd_per_m": 0.40,
    },
    # 2.5 family
    "gemini-2.5-pro": {
        "rpm": 150, "rpd": 1000, "max_output_tokens": 60000,
        "input_usd_per_m": 1.25, "output_usd_per_m": 10.00,
    },
    "gemini-2.5-flash": {
        "rpm": 1000, "rpd": 10000, "max_output_tokens": 7500,
        "input_usd_per_m": 0.30, "output_usd_per_m": 2.50,
    },
    "gemini-2.5-flash-lite": {
        "rpm": 4000, "rpd": UNLIMITED_RPD, "max_output_tokens": 7500,
        "input_usd_per_m": 0.10, "output_usd_per_m": 0.40,
    },
    # 2.0 family
    "gemini-2.0-flash": {
        "rpm": 2000, "rpd": UNLIMITED_RPD, "max_output_tokens": 7500,
        "input_usd_per_m": 0.10, "output_usd_per_m": 0.40,
    },
    "gemini-2.0-flash-lite": {
        "rpm": 4000, "rpd": UNLIMITED_RPD, "max_output_tokens": 7500,
        "input_usd_per_m": 0.075, "output_usd_per_m": 0.30,
    },
}

# Conservative fallback for unknown (custom) models we have no quota
# knowledge of. Better to under-utilise than to blow through the cap.
CUSTOM_LIMITS: _Limits = {
    "rpm": 10, "rpd": 500, "max_output_tokens": 7500,
    "input_usd_per_m": 1.25, "output_usd_per_m": 10.00,
}


def limits_for(model: str) -> _Limits:
    return MODEL_LIMITS.get(model, CUSTOM_LIMITS)


# Token estimation heuristic: Gemini's tokenizer averages ~4 chars per token
# for English prose, ~2 chars/token for CJK text. We pick a middle-of-the-road
# 3 chars/token so the estimate works across source + target languages.
CHARS_PER_TOKEN = 3.0


def estimate_tokens_from_chars(char_count: int) -> int:
    return int(char_count / CHARS_PER_TOKEN)


def estimate_cost_usd(
    model: str, input_tokens: int, output_tokens: int,
) -> float:
    """Back-of-envelope cost for a call. Prices are per 1M tokens."""
    lim = limits_for(model)
    return (
        input_tokens / 1_000_000 * lim["input_usd_per_m"]
        + output_tokens / 1_000_000 * lim["output_usd_per_m"]
    )
