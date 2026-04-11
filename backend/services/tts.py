"""
TTS service with pluggable backends.

Two backends are available:

  - "edge"   Microsoft Edge TTS (free, no API key, MP3 output, decent quality)
  - "google" Google Gemini TTS (uses the user's Gemini API key, WAV output,
             noticeably better quality for literary text — especially German)

Public API: `synthesize(text, language, rate, provider, gemini_key)`.
Returns a tuple `(audio_bytes, content_type)`.
"""

import io
import struct
from typing import Literal

import edge_tts

Provider = Literal["edge", "google"]


# ── Edge TTS (existing) ──────────────────────────────────────────────────────

# Best Edge neural voice per language code (female by default — clearest for reading)
EDGE_VOICE_MAP: dict[str, str] = {
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


def _pick_edge_voice(language: str) -> str:
    """Return the best Edge neural voice for a language code."""
    lang = language.lower().strip()
    if lang in EDGE_VOICE_MAP:
        return EDGE_VOICE_MAP[lang]
    base = lang.split("-")[0]
    return EDGE_VOICE_MAP.get(base, "en-US-JennyNeural")


def _rate_str(rate: float) -> str:
    """Convert a multiplier (0.5–2.0) to edge-tts prosody rate string."""
    pct = round((rate - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


async def _edge_synthesize(text: str, language: str, rate: float) -> tuple[bytes, str]:
    """Synthesize via Microsoft Edge TTS. Returns (mp3_bytes, content_type)."""
    voice = _pick_edge_voice(language)
    communicate = edge_tts.Communicate(text, voice, rate=_rate_str(rate))

    buf = io.BytesIO()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])

    return buf.getvalue(), "audio/mpeg"


# ── Gemini TTS ───────────────────────────────────────────────────────────────

GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts"

# Gemini's prebuilt voices are language-agnostic — the model handles
# multilingual input from a single voice. We pick a default per major
# language family based on which voice sounds best for narration.
# Available voices: Aoede, Charon, Fenrir, Kore, Leda, Orus, Puck, Zephyr.
GEMINI_VOICE_MAP: dict[str, str] = {
    "en": "Kore",      # bright, clear English narrator
    "de": "Charon",    # deep, gravitas — works well for German classics
    "fr": "Leda",      # soft female, good for French
    "es": "Aoede",     # smooth Spanish narration
    "it": "Aoede",
    "pt": "Aoede",
    "ja": "Puck",
    "ko": "Puck",
    "zh": "Puck",
}
GEMINI_DEFAULT_VOICE = "Kore"


def _pick_gemini_voice(language: str) -> str:
    """Return the preferred Gemini prebuilt voice for a language."""
    lang = language.lower().strip()
    base = lang.split("-")[0]
    return GEMINI_VOICE_MAP.get(base, GEMINI_DEFAULT_VOICE)


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """
    Wrap raw PCM data in a WAV file header so browsers can play it.
    Gemini TTS returns 24 kHz / 16-bit / mono PCM.
    """
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = len(pcm_data)
    file_size = 36 + data_size

    header = b"RIFF"
    header += struct.pack("<I", file_size)
    header += b"WAVE"
    header += b"fmt "
    header += struct.pack("<I", 16)         # PCM fmt-chunk size
    header += struct.pack("<H", 1)          # PCM format
    header += struct.pack("<H", channels)
    header += struct.pack("<I", sample_rate)
    header += struct.pack("<I", byte_rate)
    header += struct.pack("<H", block_align)
    header += struct.pack("<H", bits_per_sample)
    header += b"data"
    header += struct.pack("<I", data_size)

    return header + pcm_data


async def _gemini_synthesize(text: str, language: str, api_key: str) -> tuple[bytes, str]:
    """
    Synthesize via Google Gemini TTS. Returns (wav_bytes, content_type).

    Note: Gemini TTS does not support a rate parameter — playback speed is
    a client-side concern (audio.playbackRate on the <audio> element).
    """
    # Imported lazily so test environments without the SDK don't crash on import.
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    voice_name = _pick_gemini_voice(language)

    response = await client.aio.models.generate_content(
        model=GEMINI_TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice_name),
                ),
            ),
        ),
    )

    pcm_data = response.candidates[0].content.parts[0].inline_data.data
    return _pcm_to_wav(pcm_data, sample_rate=24000), "audio/wav"


# ── Public dispatch ──────────────────────────────────────────────────────────

async def synthesize(
    text: str,
    language: str = "en",
    rate: float = 1.0,
    *,
    provider: Provider = "edge",
    gemini_key: str | None = None,
) -> tuple[bytes, str]:
    """
    Synthesize text to speech using the chosen backend.

    Returns:
        (audio_bytes, content_type) — content_type varies by backend
        (Edge → "audio/mpeg", Gemini → "audio/wav").

    Raises:
        ValueError: if provider is "google" and gemini_key is missing.
    """
    if provider == "google":
        if not gemini_key:
            raise ValueError("Gemini API key required for the Google TTS provider")
        return await _gemini_synthesize(text, language, gemini_key)
    return await _edge_synthesize(text, language, rate)
