"""Per-source-language speaker-cue detectors for the translation alignment
checker (issue #1073, design doc `docs/design/translation-alignment-checker.md`).

Each detector is a pair of pure functions:

    is_cue(line: str) -> bool
        True iff the source-language line is a speaker cue (a stage-play line
        like "FAUST." in Goethe, "Le Roi." in classical French theatre).

    is_translated_cue(line: str, target_language: str) -> bool
        True iff the translated line preserves the speaker-cue typography
        for the given target language. Currently only zh is wired up
        (heuristic: ≤20 chars, ends with "。"), but the signature leaves
        room for future targets.

Detectors are looked up by source-language ISO code (`de`, `fr`, `en`, `ru`).
Languages without a registered detector fall through to `no_cue_detector`,
which makes the cue check a no-op (every line passes).

Adding a language: implement the two functions and register in DETECTORS.
"""

from __future__ import annotations

import re
from typing import Callable

CueDetector = Callable[[str], bool]
TranslatedCueDetector = Callable[[str, str], bool]


# ----- Generic translated-cue check (target-language aware) ------------------
# Heuristic shared across detectors: a translated cue is a short standalone
# line that ends with the target language's sentence-final punctuation.
_TRANSLATED_CUE_TERMINATORS = {
    "zh": ("。", "："),  # full stop or colon (some translators use colon)
    "ja": ("。", "："),
    "en": (".", ":"),
    "fr": (".", ":"),
    "de": (".", ":"),
    "ru": (".", ":"),
    "es": (".", ":"),
}


def _is_translated_cue_default(line: str, target_language: str) -> bool:
    line = line.strip()
    if not line:
        return False
    if len(line) > 20:
        return False
    terminators = _TRANSLATED_CUE_TERMINATORS.get(target_language, (".",))
    return any(line.endswith(t) for t in terminators)


# ----- DE: Goethe-style ALL-CAPS cues ---------------------------------------
# "FAUST.", "MEPHISTOPHELES.", "DER KAISER.", "FAUST (abgewendet)."
_DE_CUE_RE = re.compile(
    r"^[A-ZÄÖÜ][A-ZÄÖÜß\s,]{1,}(?:\s*\([^)]{0,60}\))?\.$"
)


def _is_cue_de(line: str) -> bool:
    return bool(_DE_CUE_RE.match(line.strip()))


# ----- FR: classical theatre cues (mixed case + period) ----------------------
# "Le Roi.", "LE ROI.", "Don Juan.", "Sganarelle, à part."
# Either fully uppercase, OR Capitalized + ending in period AND ≤30 chars.
_FR_CUE_FULLCAP_RE = re.compile(
    r"^[A-ZÉÈÊÀÂÔ][A-ZÉÈÊÀÂÔ\s,]{1,}(?:\s*\([^)]{0,60}\))?\.$"
)
_FR_CUE_TITLECASE_RE = re.compile(
    r"^[A-ZÉÈÊÀÂÔ][a-zéèêàâôç]+(?:\s+[A-Z][a-zéèêàâôç]+)*"
    r"(?:,\s*[a-zéèêàâôç ]{1,30})?\.$"
)


def _is_cue_fr(line: str) -> bool:
    line = line.strip()
    if len(line) > 40:
        return False
    return bool(_FR_CUE_FULLCAP_RE.match(line) or _FR_CUE_TITLECASE_RE.match(line))


# ----- EN: Shakespearean / English-drama cues -------------------------------
# "HAMLET.", "Hamlet.", "OPHELIA, aside."
# Same shape as FR but with ASCII-only letters.
_EN_CUE_FULLCAP_RE = re.compile(
    r"^[A-Z][A-Z\s,]{1,}"
    r"(?:,\s*[a-z ]{1,30})?"           # optional ", aside" lowercase tail
    r"(?:\s*\([^)]{0,60}\))?\.$"
)
_EN_CUE_TITLECASE_RE = re.compile(
    r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,\s*[a-z ]{1,30})?\.$"
)


def _is_cue_en(line: str) -> bool:
    line = line.strip()
    if len(line) > 40:
        return False
    return bool(_EN_CUE_FULLCAP_RE.match(line) or _EN_CUE_TITLECASE_RE.match(line))


# ----- RU: Cyrillic ALL-CAPS + period ----------------------------------------
# "ГАМЛЕТ.", "ОФЕЛИЯ."
_RU_CUE_RE = re.compile(
    r"^[А-ЯЁ][А-ЯЁ\s,]{1,}(?:\s*\([^)]{0,60}\))?\.$"
)


def _is_cue_ru(line: str) -> bool:
    return bool(_RU_CUE_RE.match(line.strip()))


# ----- No-op default ---------------------------------------------------------


def _is_cue_none(line: str) -> bool:
    """Default detector for languages with no registered cue typography.
    Returns False for every line so the cue check is a no-op."""
    return False


# ----- Registry -------------------------------------------------------------

DETECTORS: dict[str, CueDetector] = {
    "de": _is_cue_de,
    "fr": _is_cue_fr,
    "en": _is_cue_en,
    "ru": _is_cue_ru,
}


def get_detector(source_language: str) -> CueDetector:
    return DETECTORS.get(source_language.lower(), _is_cue_none)


def is_translated_cue(line: str, target_language: str) -> bool:
    return _is_translated_cue_default(line, target_language)
