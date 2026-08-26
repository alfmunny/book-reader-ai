"""Per-user BYOK paragraph translation for translation sessions.

Design: docs/design/user-translations.md (user-approved 2026-08-26).
The user's own key, the user's chosen provider, the user's style prompt —
no server key, no cross-provider fallback (never bill a user's key on a
model they didn't pick; same rule as the insight chat).
"""

import anthropic

from services.claude import SYSTEM_TRANSLATOR
from services.deepseek import DEEPSEEK_MODEL, _chat as _deepseek_chat

CLAUDE_MODEL = "claude-sonnet-5"

PROVIDER_MODELS = {
    "claude": CLAUDE_MODEL,
    "deepseek": DEEPSEEK_MODEL,
}


def _system(style_prompt: str | None) -> str:
    """The editorial translator rules plus the reader's own requirements."""
    if style_prompt and style_prompt.strip():
        return f"{SYSTEM_TRANSLATOR}\n\nReader's requirements:\n{style_prompt.strip()}"
    return SYSTEM_TRANSLATOR


def _prompt(text: str, source_language: str, target_language: str) -> str:
    return f"Translate from {source_language} to {target_language}:\n\n{text}"


async def translate_paragraph(
    provider: str,
    api_key: str,
    text: str,
    source_language: str,
    target_language: str,
    style_prompt: str | None = None,
) -> tuple[str, str]:
    """Translate one paragraph; returns (translation, model tag).

    The model tag is stored on the paragraph row — the visible provenance
    chip in the reader.
    """
    if provider == "claude":
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=3000,
            output_config={"effort": "low"},
            system=_system(style_prompt),
            messages=[{"role": "user", "content": _prompt(text, source_language, target_language)}],
        )
        if message.stop_reason == "refusal":
            raise RuntimeError("Claude declined to translate this passage")
        return next(b.text for b in message.content if b.type == "text"), CLAUDE_MODEL

    if provider == "deepseek":
        result = await _deepseek_chat(
            api_key,
            _system(style_prompt),
            _prompt(text, source_language, target_language),
            max_tokens=3000,
        )
        return result, DEEPSEEK_MODEL

    raise ValueError(f"Unknown translation provider: {provider}")
