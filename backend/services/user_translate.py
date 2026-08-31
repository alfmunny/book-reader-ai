"""Per-user BYOK paragraph translation for translation sessions.

Design: docs/design/user-translations.md (user-approved 2026-08-26).
The user's own key, the user's chosen provider, the user's style prompt —
no server key, no cross-provider fallback (never bill a user's key on a
model they didn't pick; same rule as the insight chat).
"""

import re

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


# ── Batched translation ──────────────────────────────────────────────────────
# Each paragraph used to be its own API call, so every paragraph was translated
# as though it were the whole document: pronouns lost their referents, names and
# register drifted between neighbours, and a paragraph opening with "彼は" had
# nothing to say who "he" was. Translating consecutive paragraphs together gives
# the model the context a translator actually needs (owner, 2026-08-31).
#
# Alignment is the constraint: one translation must come back per paragraph, in
# order, because paragraph_index is what the reader, the notes and the posts all
# anchor to. Numbered markers make that checkable, and a batch that fails the
# check falls back to one call per paragraph rather than guessing.

MAX_BATCH_CHARS = 1800
MAX_BATCH_PARAGRAPHS = 8
_MARKER = re.compile(r"<<<\s*(\d+)\s*>>>")


def plan_batches(
    indices: list[int], paragraphs: list[str],
    max_chars: int = MAX_BATCH_CHARS, max_paragraphs: int = MAX_BATCH_PARAGRAPHS,
) -> list[list[int]]:
    """Group CONSECUTIVE paragraph indices into batches.

    Only consecutive ones: context is the point, and a gap means the paragraphs
    between were skipped (already translated, or edited by hand).
    """
    batches: list[list[int]] = []
    current: list[int] = []
    size = 0
    for i in indices:
        para_len = len(paragraphs[i])
        broken = bool(current) and i != current[-1] + 1
        too_big = current and (size + para_len > max_chars or len(current) >= max_paragraphs)
        if broken or too_big:
            batches.append(current)
            current, size = [], 0
        current.append(i)
        size += para_len
    if current:
        batches.append(current)
    return batches


def _batch_prompt(items: list[tuple[int, str]], source_language: str, target_language: str) -> str:
    from services.wiktionary import _LANG_NAMES

    src = _LANG_NAMES.get(source_language, source_language)
    dst = _LANG_NAMES.get(target_language, target_language)
    body = "\n".join(f"<<<{n}>>>\n{text}" for n, text in items)
    return (
        f"Translate the following {src} text into {dst}.\n"
        f"Write your answer in {dst} only — do not answer in {src} or any other language.\n"
        f"The text is split into numbered blocks. Reproduce every marker exactly as "
        f"given, in the same order, with that block's translation under it. Do not "
        f"merge blocks, do not split them, do not add or drop a marker.\n\n{body}"
    )


def parse_batch(raw: str, expected: list[int]) -> list[str] | None:
    """Split a batched answer back into one translation per marker.

    None when the answer does not line up — the caller then retranslates that
    batch one paragraph at a time rather than storing a guess.
    """
    parts = _MARKER.split(raw)
    if len(parts) < 3:
        return None
    found: dict[int, str] = {}
    # split() yields [before, n1, text1, n2, text2, ...]
    for marker, text in zip(parts[1::2], parts[2::2]):
        try:
            found[int(marker)] = text.strip()
        except ValueError:
            return None
    if sorted(found) != sorted(expected):
        return None
    if any(not found[n] for n in expected):
        return None
    return [found[n] for n in expected]


async def translate_batch(
    provider: str, api_key: str, items: list[tuple[int, str]],
    source_language: str, target_language: str, style_prompt: str | None = None,
) -> tuple[list[str], str]:
    """Translate consecutive paragraphs in one call. Raises if they do not
    come back aligned, so the caller can fall back."""
    prompt = _batch_prompt(items, source_language, target_language)
    system = _system(style_prompt)
    numbers = [n for n, _ in items]
    budget = min(20000, 800 + sum(len(t) for _, t in items) * 4)

    if provider == "claude":
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=CLAUDE_MODEL, max_tokens=budget,
            output_config={"effort": "low"},
            system=system, messages=[{"role": "user", "content": prompt}],
        )
        if message.stop_reason == "refusal":
            raise RuntimeError("Claude declined to translate this passage")
        raw = next((b.text for b in message.content if b.type == "text"), "")
        model = CLAUDE_MODEL
    else:
        raw = await _deepseek_call(api_key, system, prompt, budget)
        model = DEEPSEEK_MODEL

    parsed = parse_batch(raw or "", numbers)
    if parsed is None:
        raise ValueError("batched translation did not come back aligned")
    return parsed, model


# ── Single paragraph, with context ──────────────────────────────────────────
# "Translate this paragraph" is an intent about what to STORE, not about what
# the model should see. A lone paragraph — often one line of dialogue — gives
# a translator nothing: who is speaking, what register, what came before. The
# neighbours ride along as read-only context; only the target is translated,
# returned and stored (owner design discussion, 2026-08-31).

CONTEXT_BEFORE = 3
CONTEXT_AFTER = 1
MAX_CONTEXT_CHARS = 1200


def context_window(paragraphs: list[str], index: int) -> tuple[str, str]:
    """(text before, text after) around `index`, bounded so a huge neighbour
    cannot crowd out the paragraph being translated."""
    before = "\n\n".join(paragraphs[max(0, index - CONTEXT_BEFORE) : index])
    after = "\n\n".join(paragraphs[index + 1 : index + 1 + CONTEXT_AFTER])
    return before[-MAX_CONTEXT_CHARS:], after[:MAX_CONTEXT_CHARS]


async def translate_paragraph_in_context(
    provider: str, api_key: str, paragraphs: list[str], index: int,
    source_language: str, target_language: str, style_prompt: str | None = None,
) -> tuple[str, str]:
    """Translate paragraphs[index] with its neighbours visible as context."""
    before, after = context_window(paragraphs, index)
    if not before and not after:
        return await translate_paragraph(
            provider, api_key, paragraphs[index],
            source_language, target_language, style_prompt,
        )

    from services.wiktionary import _LANG_NAMES

    src = _LANG_NAMES.get(source_language, source_language)
    dst = _LANG_NAMES.get(target_language, target_language)
    parts = [
        f"Translate ONLY the text between <<<translate>>> and <<<end>>> from {src} into {dst}.",
        f"Write your answer in {dst} only, and return nothing but that translation — "
        "no context, no markers, no commentary.",
        "The surrounding text is context to translate consistently with; do not translate it.",
    ]
    if before:
        parts.append(f"\n[context before]\n{before}")
    parts.append(f"\n<<<translate>>>\n{paragraphs[index]}\n<<<end>>>")
    if after:
        parts.append(f"\n[context after]\n{after}")
    prompt = "\n".join(parts)
    system = _system(style_prompt)
    budget = min(8000, 400 + len(paragraphs[index]) * 4)

    if provider == "claude":
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model=CLAUDE_MODEL, max_tokens=budget,
            output_config={"effort": "low"},
            system=system, messages=[{"role": "user", "content": prompt}],
        )
        if message.stop_reason == "refusal":
            raise RuntimeError("Claude declined to translate this passage")
        result = next((b.text for b in message.content if b.type == "text"), "")
        model = CLAUDE_MODEL
    else:
        result = await _deepseek_call(api_key, system, prompt, budget)
        model = DEEPSEEK_MODEL
    if not (result or "").strip():
        raise RuntimeError("empty translation")
    return result.strip(), model
