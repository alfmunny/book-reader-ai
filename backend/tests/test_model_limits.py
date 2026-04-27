"""Tests for services.model_limits."""

from services.model_limits import (
    MODEL_LIMITS,
    DEFAULT_CHAIN,
    CUSTOM_LIMITS,
    limits_for,
)


def test_model_limits_has_no_empty_string_key():
    """Regression #1783: the empty-string key was a stale alias for the old
    server default (gemini-3.1-flash-lite-preview). Removed in cleanup —
    callers always pass real model names from the chain. Lock in absence."""
    assert "" not in MODEL_LIMITS, (
        "MODEL_LIMITS must not contain an empty-string key — that entry was "
        "a stale alias for an old default model and is no longer needed."
    )


def test_default_chain_models_all_have_limits():
    """Every model in DEFAULT_CHAIN must have a corresponding MODEL_LIMITS
    entry — otherwise the queue worker would fall back to CUSTOM_LIMITS for
    well-known curated-default models."""
    for model in DEFAULT_CHAIN:
        assert model in MODEL_LIMITS, (
            f"DEFAULT_CHAIN model '{model}' has no entry in MODEL_LIMITS — "
            f"add an entry or remove from DEFAULT_CHAIN."
        )


def test_limits_for_unknown_model_falls_back_to_custom():
    """Unknown models must use the conservative CUSTOM_LIMITS fallback."""
    assert limits_for("definitely-not-a-real-model") == CUSTOM_LIMITS
    assert limits_for("") == CUSTOM_LIMITS  # post-#1783 cleanup
