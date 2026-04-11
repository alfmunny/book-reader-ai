"""
Gemini-backed equivalents of the Claude AI functions.
Uses google-genai (new SDK) with the user's own API key.
"""
import asyncio
from google import genai
from google.genai import types

MODEL = "gemini-3.1-flash-lite-preview"


def _client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


async def _generate(api_key: str, system: str, prompt: str, max_tokens: int = 1024) -> str:
    client = _client(api_key)
    config = types.GenerateContentConfig(max_output_tokens=max_tokens)
    if system:
        config = types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_tokens,
        )
    response = await client.aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=config,
    )
    try:
        return response.text or ""
    except ValueError:
        return ""


# ── System prompts (same as claude.py) ───────────────────────────────────────

SYSTEM_INSIGHT = """You are an engaging literary guide who reveals one fascinating, non-obvious insight about a passage. Choose the most compelling angle — a hidden symbol, surprising historical context, connection to the author's life, clever literary device, or an intriguing interpretation that the average reader would miss. Be vivid and concise: 2–3 short paragraphs. Use markdown."""

SYSTEM_QA = """You are a knowledgeable literary assistant helping a reader understand a book.
Answer questions directly and accurately based on the passage context provided.
If the question goes beyond the passage, draw on your knowledge of the full work.
Be concise and clear. Use markdown for formatting."""

SYSTEM_PRONUNCIATION = """You are a language and diction coach helping someone practice reading aloud.
The user will provide their transcribed speech and the original text.
Identify specific differences, mispronunciations, or missed words.
Give encouraging, actionable feedback. Be specific about which words to focus on.
Use markdown for formatting."""

SYSTEM_TRANSLATOR = """You are a skilled literary translator. Translate the provided text preserving literary style, tone, rhythm, and nuance. Keep proper names, cultural references, and poetic structure intact.
IMPORTANT: Preserve the exact line structure of the input. Each line break (\\n) in the original must produce a line break in the translation. Each blank line between stanzas or paragraphs must be preserved as a blank line. Do NOT merge lines or reflow text.
Return ONLY the translation — no explanations, no commentary."""


def _lang(response_language: str) -> str:
    if response_language and response_language != "en":
        return f"\nRespond in this language: {response_language}."
    return ""


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_insight(
    api_key: str, chapter_text: str, book_title: str, author: str, response_language: str = "en"
) -> str:
    excerpt = chapter_text[:1500].strip()
    prompt = (
        f'Book: "{book_title}" by {author}\n\n'
        f"Chapter opening:\n---\n{excerpt}\n---\n\n"
        "Share one fascinating insight about this passage."
    )
    return await _generate(api_key, SYSTEM_INSIGHT + _lang(response_language), prompt, 600)


async def answer_question(
    api_key: str, question: str, passage: str, book_title: str, author: str, response_language: str = "en"
) -> str:
    prompt = (
        f'Book: "{book_title}" by {author}\n\n'
        f"Current passage:\n---\n{passage}\n---\n\n"
        f"Question: {question}"
    )
    return await _generate(api_key, SYSTEM_QA + _lang(response_language), prompt, 1024)


async def check_pronunciation(
    api_key: str, original_text: str, spoken_text: str, language: str = "en"
) -> str:
    prompt = (
        f"Language: {language}\n\n"
        f"Original text:\n---\n{original_text}\n---\n\n"
        f"What the reader said (transcribed):\n---\n{spoken_text}\n---\n\n"
        "Please provide pronunciation feedback."
    )
    return await _generate(api_key, SYSTEM_PRONUNCIATION, prompt, 512)


async def suggest_youtube_query(api_key: str, passage: str, book_title: str, author: str) -> str:
    prompt = (
        f'Given this passage from "{book_title}" by {author}:\n---\n{passage[:500]}\n---\n\n'
        "Suggest a concise YouTube search query (max 8 words) to find a theatrical or film performance. "
        "Return ONLY the search query, nothing else."
    )
    result = await _generate(api_key, "", prompt, 64)
    return result.strip()


async def translate_chunk(api_key: str, text: str, source_language: str, target_language: str) -> str:
    prompt = f"Translate from {source_language} to {target_language}:\n\n{text}"
    return await _generate(api_key, SYSTEM_TRANSLATOR, prompt, 8192)


async def translate_text(
    api_key: str, text: str, source_language: str, target_language: str, chunk_size: int = 5000
) -> list[str]:
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        return []

    chunks: list[list[str]] = []
    current: list[str] = []
    current_len = 0
    for para in paragraphs:
        if current_len + len(para) > chunk_size and current:
            chunks.append(current)
            current = []
            current_len = 0
        current.append(para)
        current_len += len(para)
    if current:
        chunks.append(current)

    results = []
    for chunk in chunks:
        result = await translate_chunk(api_key, "\n\n".join(chunk), source_language, target_language)
        results.append(result)

    translated: list[str] = []
    for result in results:
        parts = [p.strip("\n").rstrip() for p in result.split("\n\n") if p.strip()]
        translated.extend(parts)
    return translated
