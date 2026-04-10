import os
import anthropic

_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


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


async def generate_insight(
    chapter_text: str, book_title: str, author: str, response_language: str = "en"
) -> str:
    client = get_client()
    # Use first 1500 chars — enough context, keeps cost low
    excerpt = chapter_text[:1500].strip()
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=600,
        system=SYSTEM_INSIGHT + _lang(response_language),
        messages=[
            {
                "role": "user",
                "content": (
                    f'Book: "{book_title}" by {author}\n\n'
                    f"Chapter opening:\n---\n{excerpt}\n---\n\n"
                    "Share one fascinating insight about this passage."
                ),
            }
        ],
    )
    return message.content[0].text


async def answer_question(
    question: str, passage: str, book_title: str, author: str, response_language: str = "en"
) -> str:
    client = get_client()
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_QA + _lang(response_language),
        messages=[
            {
                "role": "user",
                "content": (
                    f'Book: "{book_title}" by {author}\n\n'
                    f"Current passage:\n---\n{passage}\n---\n\n"
                    f"Question: {question}"
                ),
            }
        ],
    )
    return message.content[0].text


async def check_pronunciation(
    original_text: str, spoken_text: str, language: str = "en"
) -> str:
    client = get_client()
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        system=SYSTEM_PRONUNCIATION,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Language: {language}\n\n"
                    f"Original text:\n---\n{original_text}\n---\n\n"
                    f"What the reader said (transcribed):\n---\n{spoken_text}\n---\n\n"
                    "Please provide pronunciation feedback."
                ),
            }
        ],
    )
    return message.content[0].text


async def suggest_youtube_query(passage: str, book_title: str, author: str) -> str:
    client = get_client()
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=128,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Given this passage from "{book_title}" by {author}:\n---\n{passage[:500]}\n---\n\n'
                    "Suggest a concise YouTube search query (max 8 words) to find a theatrical or film performance. "
                    "Return ONLY the search query, nothing else."
                ),
            }
        ],
    )
    return message.content[0].text.strip()


async def translate_chunk(text: str, source_language: str, target_language: str) -> str:
    """Translate a single chunk of text."""
    client = get_client()
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_TRANSLATOR,
        messages=[
            {
                "role": "user",
                "content": (
                    f"Translate from {source_language} to {target_language}:\n\n{text}"
                ),
            }
        ],
    )
    return message.content[0].text


async def translate_text(
    text: str, source_language: str, target_language: str, chunk_size: int = 1500
) -> list[str]:
    """
    Translate text in paragraph-aware chunks.
    Returns a list of translated chunks matching the input paragraphs grouping.
    """
    import asyncio

    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        return []

    # Group paragraphs into chunks of ~chunk_size chars
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

    # Translate all chunks concurrently
    async def translate_one(paras: list[str]) -> str:
        joined = "\n\n".join(paras)
        return await translate_chunk(joined, source_language, target_language)

    results = await asyncio.gather(*[translate_one(c) for c in chunks])

    # Split results back into individual paragraphs (best-effort)
    # Use the same \n\n splitter; strip only leading/trailing blank lines per part,
    # but preserve internal \n so poem stanza lines stay intact.
    translated_paragraphs: list[str] = []
    for result in results:
        parts = [p.strip("\n").rstrip() for p in result.split("\n\n") if p.strip()]
        translated_paragraphs.extend(parts)

    return translated_paragraphs
