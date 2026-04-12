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


# Gemini TTS has an output cap of roughly ~30 seconds of audio per call.
# When the input text is longer than that, the model stops generating speech
# but the response still contains silent PCM padding to fill its output
# buffer. The result is a long WAV with 30s of speech and 5+ minutes of
# silence — useless for chapter-length text. To work around this we chunk
# the input by paragraph/line, synthesize each chunk separately, trim the
# trailing silence from each chunk's PCM, and concatenate.
GEMINI_TTS_CHUNK_CHARS = 400


def _chunk_text_for_tts(text: str, max_chars: int = GEMINI_TTS_CHUNK_CHARS) -> list[str]:
    """Split text into chunks of at most max_chars, respecting paragraph and line boundaries.

    Strategy: prefer to keep paragraphs whole. If a single paragraph is too
    long, split it on line breaks. Empty chunks are dropped.
    """
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    def flush_current():
        nonlocal current, current_len
        if current:
            chunks.append("\n\n".join(current))
            current = []
            current_len = 0

    for para in paragraphs:
        para_len = len(para)

        # Paragraph fits inside the current chunk
        if current_len + para_len + 2 <= max_chars:
            current.append(para)
            current_len += para_len + 2
            continue

        # Current chunk has stuff, flush it before handling this paragraph
        flush_current()

        # Single paragraph is small enough on its own
        if para_len <= max_chars:
            current.append(para)
            current_len = para_len
            continue

        # Single paragraph is too long → split on line breaks
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

    flush_current()
    return chunks


def _trim_trailing_silence(
    pcm: bytes,
    sample_rate: int = 24000,
    rms_threshold: float = 200.0,
    tail_ms: int = 250,
) -> bytes:
    """Trim trailing silence from raw 16-bit mono PCM.

    Walks 100 ms windows from the end of the buffer toward the start, finds
    the last window whose RMS is above `rms_threshold`, and keeps everything
    up to that window plus a small `tail_ms` cushion. Internal pauses are
    preserved (we only cut from the very end).

    `rms_threshold=200` is well below normal speech (typically RMS 1000–8000
    for Gemini's voices) but well above the silence floor (~5–15 RMS).
    """
    if not pcm:
        return pcm
    n_samples = len(pcm) // 2  # 16-bit = 2 bytes/sample
    if n_samples == 0:
        return pcm

    window = max(1, sample_rate // 10)  # 100 ms
    samples = struct.unpack(f"<{n_samples}h", pcm)

    # Walk windows from the end
    last_loud_end = 0
    i = n_samples - window
    while i >= 0:
        chunk = samples[i : i + window]
        # RMS — avoid sqrt for speed; threshold the squared value
        sq_sum = sum(s * s for s in chunk)
        rms_sq = sq_sum / len(chunk)
        if rms_sq > rms_threshold * rms_threshold:
            last_loud_end = i + window
            break
        i -= window

    if last_loud_end == 0:
        # All silent — return unchanged so the caller can decide what to do
        return pcm

    keep_samples = min(n_samples, last_loud_end + (sample_rate * tail_ms // 1000))
    return pcm[: keep_samples * 2]


async def _gemini_synthesize(text: str, language: str, api_key: str) -> tuple[bytes, str]:
    """
    Synthesize a single chunk via Google Gemini TTS. Returns (wav_bytes, content_type).

    Gemini's TTS preview model has an output cap (~30 sec of audio per call)
    and pads truncated outputs with silence. The CALLER is responsible for
    splitting longer text into chunks and concatenating the results — see
    `_chunk_text_for_tts`. We trim the per-chunk trailing silence here so
    callers don't have to worry about the padding.

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

    pcm = response.candidates[0].content.parts[0].inline_data.data
    trimmed = _trim_trailing_silence(pcm)
    return _pcm_to_wav(trimmed, sample_rate=24000), "audio/wav"


# ── Public dispatch ──────────────────────────────────────────────────────────

def chunk_text(text: str, max_chars: int = GEMINI_TTS_CHUNK_CHARS) -> list[str]:
    """Public wrapper around _chunk_text_for_tts so the router can expose it.

    The frontend calls this via POST /api/ai/tts/chunks before fetching audio,
    and uses the resulting list to drive per-chunk progress UI and per-chunk
    audio caching.
    """
    return _chunk_text_for_tts(text, max_chars=max_chars)


def resolve_voice(provider: Provider, language: str) -> str:
    """Return the concrete voice name a synthesize() call would use.

    Exposed so the router can use (provider, voice) as part of the audio cache key —
    switching from one voice to another should miss the cache and re-generate.
    """
    if provider == "google":
        return _pick_gemini_voice(language)
    return _pick_edge_voice(language)


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
