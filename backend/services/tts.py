"""
Edge TTS service — Microsoft neural voices, free, no API key required.

Voice quality tiers (best available per language):
  Neural voices sound natural and support SSML prosody rate control.
"""

import io
import edge_tts

# Best neural voice per language code (female by default — clearest for reading)
VOICE_MAP: dict[str, str] = {
    # MultilingualNeural voices — latest generation, most natural sounding
    "en": "en-US-EmmaMultilingualNeural",
    "en-us": "en-US-EmmaMultilingualNeural",
    "en-gb": "en-GB-AdaMultilingualNeural",
    "de": "de-DE-FlorianMultilingualNeural",
    "fr": "fr-FR-VivienneMultilingualNeural",
    "es": "es-ES-XimenaMultilingualNeural",
    "it": "it-IT-GiuseppeMultilingualNeural",
    "pt": "pt-BR-ThalitaMultilingualNeural",
    "zh": "zh-CN-XiaoxiaoMultilingualNeural",
    "ja": "ja-JP-MasaruMultilingualNeural",
    "ko": "ko-KR-HyunsuMultilingualNeural",
    # Standard Neural voices for languages without Multilingual variants
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


def _pick_voice(language: str) -> str:
    """Return the best neural voice for a language code."""
    lang = language.lower().strip()
    if lang in VOICE_MAP:
        return VOICE_MAP[lang]
    # Try base code (e.g. "en-AU" → "en")
    base = lang.split("-")[0]
    return VOICE_MAP.get(base, "en-US-JennyNeural")


def _rate_str(rate: float) -> str:
    """Convert a multiplier (0.5–2.0) to edge-tts prosody rate string."""
    pct = round((rate - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


async def synthesize(text: str, language: str = "en", rate: float = 1.0) -> bytes:
    """
    Synthesize text to MP3 audio bytes using Microsoft Edge neural TTS.

    Args:
        text: Text to speak.
        language: BCP-47 language code (e.g. "en", "de", "zh").
        rate: Playback speed multiplier (0.5 = half speed, 2.0 = double).

    Returns:
        Raw MP3 bytes.
    """
    voice = _pick_voice(language)
    communicate = edge_tts.Communicate(text, voice, rate=_rate_str(rate))

    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])

    return buf.getvalue()
