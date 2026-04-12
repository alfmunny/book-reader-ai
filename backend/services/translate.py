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
import re
from typing import Literal

Provider = Literal["gemini", "google"]


# ── Google Translate (free, no key) ──────────────────────────────────────────

# Google Translate uses region-specific codes for some languages.
# Our app uses short ISO codes (zh, pt) but Google expects zh-CN, pt-BR, etc.
_GOOGLE_LANG_MAP = {
    "zh": "zh-CN",
    "pt": "pt-BR",
    "he": "iw",    # Google still uses the old Hebrew code
}


def _normalize_google_lang(lang: str) -> str:
    """Convert our language codes to Google Translate's expected format."""
    return _GOOGLE_LANG_MAP.get(lang, lang)


def _google_translate_chunk(text: str, source: str, target: str) -> str:
    """Translate a chunk of text via Google Translate (free, synchronous)."""
    from deep_translator import GoogleTranslator
    return GoogleTranslator(
        source=_normalize_google_lang(source),
        target=_normalize_google_lang(target),
    ).translate(text)


def _unwrap_paragraph(text: str) -> str:
    """Join hard-wrapped lines within a paragraph into flowing text.

    Gutenberg texts wrap at ~70 chars, inserting \\n mid-sentence.
    Google Translate treats each line independently, so we must unwrap
    before translating.  Preserves intentional breaks (e.g. verse or
    dialogue) by only joining when the previous line doesn't end with
    punctuation that suggests a deliberate break.
    """
    return re.sub(r"(?<![.!?:;\"'\u201d])\n(?!\n)", " ", text)


_HEADING_RE = re.compile(
    r'^(?:'
    r'(?:CHAPTER|CHAPITRE|KAPITEL|BOOK|PART|ACT|SCENE|PROLOGUE?|EPILOGUE?)'
    r'[\s.:\-]*'
    r'(?:[IVXLCDM]+|[0-9]+)?'
    r'[.\s]*'
    r'|[IVXLCDM]+\.?\s*'  # bare roman numeral like "I" or "XIV."
    r'|[0-9]+\.?\s*'      # bare number like "1" or "14."
    r')$',
    re.IGNORECASE,
)


def _is_heading(text: str) -> bool:
    """Return True if text looks like a chapter heading (not worth translating)."""
    stripped = text.strip()
    return bool(_HEADING_RE.match(stripped))


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
        unwrapped = _unwrap_paragraph(para)
        # Skip chapter headings — translating "I" or "Chapter XIV" produces
        # nonsense like "我" (Chinese for the pronoun "I").
        if _is_heading(unwrapped):
            results.append(unwrapped)
            continue
        translated = await loop.run_in_executor(
            None, _google_translate_chunk, unwrapped, source, target
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
