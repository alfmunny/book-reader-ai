"""
TTS service using Microsoft Edge TTS (free, no API key, MP3 output).
"""

import io
from typing import Literal

import edge_tts

Gender = Literal["female", "male"]

EDGE_VOICE_FEMALE: dict[str, str] = {
    "en": "en-US-EmmaMultilingualNeural",
    "en-us": "en-US-EmmaMultilingualNeural",
    "en-gb": "en-GB-AdaMultilingualNeural",
    "de": "de-DE-SeraphinaMultilingualNeural",
    "fr": "fr-FR-VivienneMultilingualNeural",
    "es": "es-ES-XimenaMultilingualNeural",
    "it": "it-IT-IsabellaNeural",
    "pt": "pt-BR-ThalitaMultilingualNeural",
    "zh": "zh-CN-XiaoxiaoMultilingualNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "nl": "nl-NL-ColetteNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "ar": "ar-EG-SalmaNeural",
    "pl": "pl-PL-AgnieszkaNeural",
    "sv": "sv-SE-SofieNeural",
    "da": "da-DK-ChristelNeural",
    "fi": "fi-FI-NooraNeural",
    "nb": "nb-NO-PernilleNeural",
    "tr": "tr-TR-EmelNeural",
    "cs": "cs-CZ-VlastaNeural",
    "hu": "hu-HU-NoemiNeural",
    "ro": "ro-RO-AlinaNeural",
    "el": "el-GR-AthinaNeural",
    "he": "he-IL-HilaNeural",
}

EDGE_VOICE_MALE: dict[str, str] = {
    "en": "en-US-AndrewMultilingualNeural",
    "en-us": "en-US-AndrewMultilingualNeural",
    "en-gb": "en-GB-RyanNeural",
    "de": "de-DE-FlorianMultilingualNeural",
    "fr": "fr-FR-RemyMultilingualNeural",
    "es": "es-ES-AlvaroNeural",
    "it": "it-IT-GiuseppeMultilingualNeural",
    "pt": "pt-BR-AntonioNeural",
    "zh": "zh-CN-YunyangNeural",
    "ja": "ja-JP-MasaruMultilingualNeural",
    "ko": "ko-KR-HyunsuMultilingualNeural",
    "nl": "nl-NL-MaartenNeural",
    "ru": "ru-RU-DmitryNeural",
    "ar": "ar-SA-HamedNeural",
    "pl": "pl-PL-MarekNeural",
    "sv": "sv-SE-MattiasNeural",
    "da": "da-DK-JeppeNeural",
    "fi": "fi-FI-HarriNeural",
    "nb": "nb-NO-FinnNeural",
    "tr": "tr-TR-AhmetNeural",
    "cs": "cs-CZ-AntoninNeural",
    "hu": "hu-HU-TamasNeural",
    "ro": "ro-RO-EmilNeural",
    "el": "el-GR-NestorasNeural",
    "he": "he-IL-AvriNeural",
}

_FALLBACK_FEMALE = "en-US-EmmaMultilingualNeural"
_FALLBACK_MALE = "en-US-AndrewMultilingualNeural"


def _pick_edge_voice(language: str, gender: Gender = "female") -> str:
    lang = language.lower().strip()
    voice_map = EDGE_VOICE_MALE if gender == "male" else EDGE_VOICE_FEMALE
    fallback = _FALLBACK_MALE if gender == "male" else _FALLBACK_FEMALE
    if lang in voice_map:
        return voice_map[lang]
    base = lang.split("-")[0]
    return voice_map.get(base, fallback)


def _rate_str(rate: float) -> str:
    pct = round((rate - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


async def synthesize(
    text: str,
    language: str = "en",
    rate: float = 1.0,
    *,
    gender: Gender = "female",
) -> tuple[bytes, str, list[dict]]:
    """Synthesize text with Edge TTS.
    Returns (mp3_bytes, "audio/mpeg", word_boundaries).
    Each boundary: {"offset_ms": float, "text": str}
    """
    voice = _pick_edge_voice(language, gender)
    communicate = edge_tts.Communicate(text.replace("\n", " "), voice, rate=_rate_str(rate))

    buf = io.BytesIO()
    boundaries: list[dict] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append({
                "offset_ms": round(chunk["offset"] / 10_000, 1),
                "text": chunk["text"],
            })

    return buf.getvalue(), "audio/mpeg", boundaries


# ── Text chunking ─────────────────────────────────────────────────────────────

TTS_CHUNK_CHARS = 400


def chunk_text(text: str, max_chars: int = TTS_CHUNK_CHARS) -> list[str]:
    """Split text into chunks suitable for TTS, respecting paragraph/line boundaries."""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    def flush() -> None:
        nonlocal current, current_len
        if current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0

    for para in paragraphs:
        para_len = len(para)
        if current_len + para_len + 2 <= max_chars:
            current.append(para)
            current_len += para_len + 2
            continue
        flush()
        if para_len <= max_chars:
            current.append(para)
            current_len = para_len
            continue
        line_buf: list[str] = []
        line_buf_len = 0
        for line in para.split("\n"):
            line_with_break = len(line) + 1
            if line_buf_len + line_with_break > max_chars and line_buf:
                chunks.append("\n".join(line_buf))
                line_buf = []
                line_buf_len = 0
            line_buf.append(line)
            line_buf_len += line_with_break
        if line_buf:
            chunks.append("\n".join(line_buf))

    flush()
    return chunks
