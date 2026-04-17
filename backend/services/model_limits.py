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


MODEL_LIMITS: dict[str, _Limits] = {
    # "" = server-side default (currently gemini-3.1-flash-lite-preview).
    "": {"rpm": 12, "rpd": 1400, "max_output_tokens": 7500},
    "gemini-2.5-pro": {"rpm": 2, "rpd": 50, "max_output_tokens": 60000},
    "gemini-2.5-flash": {"rpm": 10, "rpd": 250, "max_output_tokens": 7500},
    "gemini-2.5-flash-lite": {"rpm": 15, "rpd": 1000, "max_output_tokens": 7500},
    "gemini-2.0-flash": {"rpm": 15, "rpd": 1500, "max_output_tokens": 7500},
    "gemini-2.0-flash-lite": {"rpm": 30, "rpd": 1500, "max_output_tokens": 7500},
}

# Conservative fallback for unknown (custom) models we have no quota
# knowledge of. Better to under-utilise than to blow through the cap.
CUSTOM_LIMITS: _Limits = {"rpm": 10, "rpd": 500, "max_output_tokens": 7500}


def limits_for(model: str) -> _Limits:
    return MODEL_LIMITS.get(model, CUSTOM_LIMITS)
