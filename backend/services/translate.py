"""
Translation service with pluggable backends.

Two backends:

  - "gemini"  Uses the user's Gemini API key. Best quality for literary
              text — preserves style, tone, and poetic structure.
  - "google"  Uses Google Translate via deep-translator. Free, no API key,
              good enough for casual reading. Falls back automatically when
              no Gemini key is available.

Public API: translate_text(text, source, target, provider, gemini_key)
"""

import asyncio
from typing import Literal

Provider = Literal["gemini", "google"]


# ── Google Translate (free, no key) ──────────────────────────────────────────

def _google_translate_chunk(text: str, source: str, target: str) -> str:
    """Translate a chunk of text via Google Translate (free, synchronous)."""
    from deep_translator import GoogleTranslator
    return GoogleTranslator(source=source, target=target).translate(text)


async def _google_translate(text: str, source: str, target: str) -> list[str]:
    """Split text into paragraphs and translate each via Google Translate."""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        return []

    # Run sync translator in a thread pool to avoid blocking the event loop.
    # Google Translate handles one paragraph at a time well.
    loop = asyncio.get_event_loop()
    results = []
    for para in paragraphs:
        translated = await loop.run_in_executor(
            None, _google_translate_chunk, para, source, target
        )
        results.append(translated)

    return results


# ── Gemini (requires API key, best quality) ──────────────────────────────────

async def _gemini_translate(text: str, source: str, target: str, api_key: str) -> list[str]:
    """Translate via Gemini — delegates to the existing gemini service."""
    from services.gemini import translate_text as gemini_translate_text
    return await gemini_translate_text(api_key, text, source, target)


# ── Public dispatch ──────────────────────────────────────────────────────────

async def translate_text(
    text: str,
    source_language: str,
    target_language: str,
    *,
    provider: Provider = "google",
    gemini_key: str | None = None,
) -> list[str]:
    """Translate text using the chosen backend.

    Returns a list of translated paragraphs (same paragraph structure as input).

    The "auto" resolution (Gemini if key available, else Google) is done by
    the caller (routers/ai.py), not here — this function always receives a
    concrete provider.
    """
    if provider == "gemini":
        if not gemini_key:
            raise ValueError("Gemini API key required for the Gemini translation provider")
        return await _gemini_translate(text, source_language, target_language, gemini_key)
    return await _google_translate(text, source_language, target_language)
