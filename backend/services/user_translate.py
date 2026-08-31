"""Per-user BYOK paragraph translation for translation sessions.

Design: docs/design/user-translations.md (user-approved 2026-08-26).
The user's own key, the user's chosen provider, the user's style prompt —
no server key, no cross-provider fallback (never bill a user's key on a
model they didn't pick; same rule as the insight chat).
"""

import anthropic
import httpx

from services.claude import SYSTEM_TRANSLATOR
from services.deepseek import DEEPSEEK_API_URL, DEEPSEEK_MODEL

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
    """Name the languages and state the target twice.

    This read "Translate from en to zh:" — the target appeared once, as a bare
    code, and it was the only thing telling the model what to produce. Given a
    Japanese paragraph under a wrong source code, models answered in English
    (owner, 2026-08-31).
    """
    from services.wiktionary import _LANG_NAMES

    src = _LANG_NAMES.get(source_language, source_language)
    dst = _LANG_NAMES.get(target_language, target_language)
    return (
        f"Translate the following {src} text into {dst}.\n"
        f"Write your answer in {dst} only — do not answer in {src} or any other language.\n\n"
        f"{text}"
    )


async def _deepseek_call(api_key: str, system: str, prompt: str, max_tokens: int) -> str:
    """Dedicated HTTP call (not the chat helper): translation paragraphs plus
    reasoning can exceed the chat helper's 60s timeout, so use a longer one."""
    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(
            DEEPSEEK_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": max_tokens,
                # v4-flash reasons by default; for translation the thinking
                # adds 30-120s latency and can consume the WHOLE token budget,
                # returning empty content (verified live, 2026-08-27).
                "thinking": {"type": "disabled"},
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"].get("content") or ""


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
            max_tokens=5000,
            output_config={"effort": "low"},
            system=_system(style_prompt),
            messages=[{"role": "user", "content": _prompt(text, source_language, target_language)}],
        )
        if message.stop_reason == "refusal":
            raise RuntimeError("Claude declined to translate this passage")
        result = next((b.text for b in message.content if b.type == "text"), "")
        if not result.strip():
            raise RuntimeError("Claude returned an empty translation")
        return result, CLAUDE_MODEL

    if provider == "deepseek":
        # deepseek-v4-flash is a REASONING model: hidden thinking counts
        # against max_tokens, and when it eats the whole budget the API
        # returns 200 with EMPTY content (owner report, 2026-08-27 — blank
        # paragraphs stored). Budget generously, retry once bigger, and
        # never accept an empty translation.
        system = _system(style_prompt)
        prompt = _prompt(text, source_language, target_language)
        result = await _deepseek_call(api_key, system, prompt, 4000)
        if not result.strip():
            result = await _deepseek_call(api_key, system, prompt, 8000)
        if not result.strip():
            raise RuntimeError(
                "DeepSeek returned an empty translation (its reasoning consumed the token budget)"
            )
        return result, DEEPSEEK_MODEL

    raise ValueError(f"Unknown translation provider: {provider}")
