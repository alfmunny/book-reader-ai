"""DeepSeek chat completions for the insight chat (BYOK).

Thin wrapper over DeepSeek's REST API (OpenAI-compatible wire format is
DeepSeek's own contract). The key is the user's stored deepseek_key,
decrypted by the caller — never a server-wide key.
"""

import httpx

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
# deepseek-chat was retired 2026-07-24; v4-flash is the current workhorse
# ($0.22/M input, $0.66/M output off-peak — fractions of a cent per chat).
DEEPSEEK_MODEL = "deepseek-v4-flash"

SYSTEM_QA = """You are a knowledgeable literary assistant helping a reader understand a book.
Answer questions directly and accurately based on the passage context provided.
If the question goes beyond the passage, draw on your knowledge of the full work.
Be concise and clear. Use markdown for formatting."""

SYSTEM_INSIGHT = """You are an engaging literary guide who reveals one fascinating, non-obvious insight about a passage. Choose the most compelling angle — a hidden symbol, surprising historical context, connection to the author's life, clever literary device, or an intriguing interpretation that the average reader would miss. Be vivid and concise: 2–3 short paragraphs. Use markdown."""


def _lang(response_language: str) -> str:
    if response_language and response_language != "en":
        return f"\nRespond in this language: {response_language}."
    return ""


async def _chat(api_key: str, system: str, user_content: str, max_tokens: int) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            DEEPSEEK_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_content},
                ],
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]


async def answer_question(
    api_key: str,
    question: str,
    passage: str,
    book_title: str,
    author: str,
    response_language: str = "en",
) -> str:
    return await _chat(
        api_key,
        SYSTEM_QA + _lang(response_language),
        (
            f'Book: "{book_title}" by {author}\n\n'
            f"Current passage:\n---\n{passage}\n---\n\n"
            f"Question: {question}"
        ),
        max_tokens=1024,
    )


async def generate_insight(
    api_key: str,
    chapter_text: str,
    book_title: str,
    author: str,
    response_language: str = "en",
) -> str:
    excerpt = chapter_text[:1500].strip()
    return await _chat(
        api_key,
        SYSTEM_INSIGHT + _lang(response_language),
        (
            f'Book: "{book_title}" by {author}\n\n'
            f"Chapter opening:\n---\n{excerpt}\n---\n\n"
            "Share one fascinating insight about this passage."
        ),
        max_tokens=600,
    )
