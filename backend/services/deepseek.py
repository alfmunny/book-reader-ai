"""DeepSeek chat completions for the insight chat (BYOK).

Thin wrapper over DeepSeek's REST API (OpenAI-compatible wire format is
DeepSeek's own contract). The key is the user's stored deepseek_key,
decrypted by the caller — never a server-wide key.
"""

import httpx

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

SYSTEM_QA = """You are a knowledgeable literary assistant helping a reader understand a book.
Answer questions directly and accurately based on the passage context provided.
If the question goes beyond the passage, draw on your knowledge of the full work.
Be concise and clear. Use markdown for formatting."""


def _lang(response_language: str) -> str:
    if response_language and response_language != "en":
        return f"\nRespond in this language: {response_language}."
    return ""


async def answer_question(
    api_key: str,
    question: str,
    passage: str,
    book_title: str,
    author: str,
    response_language: str = "en",
) -> str:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            DEEPSEEK_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": DEEPSEEK_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_QA + _lang(response_language)},
                    {
                        "role": "user",
                        "content": (
                            f'Book: "{book_title}" by {author}\n\n'
                            f"Current passage:\n---\n{passage}\n---\n\n"
                            f"Question: {question}"
                        ),
                    },
                ],
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    return data["choices"][0]["message"]["content"]
