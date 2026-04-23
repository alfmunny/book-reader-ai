"""
Gemini-backed equivalents of the Claude AI functions.
Uses google-genai (new SDK) with the user's own API key.
"""
import asyncio
import re
from google import genai
from google.genai import types

MODEL = "gemini-3.1-flash-lite-preview"
# Model used by the bulk translator. Defaults to the same model that powers
# the rest of the app (known to work with the user's key). Admins can override
# this through the bulk-translate start request if they want to try a
# higher-quality model.
TRANSLATOR_MODEL = MODEL


# Permissive safety settings for literary translation. Classic books (Faust
# is the concrete case) routinely trigger default mid-level filters on
# sexuality / violence / occultism, causing finish_reason=PROHIBITED_CONTENT
# with no translation returned. The queue worker then burns through the
# whole fallback chain because every model shares the same safety layer.
# We push the thresholds to BLOCK_NONE on the four categories that
# literature commonly trips: harassment, hate speech, sexually explicit,
# dangerous content. Civic-integrity / image categories are unrelated to
# prose translation and left at defaults.
_LITERARY_SAFETY_SETTINGS: list[types.SafetySetting] = [
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
]


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

SYSTEM_SUMMARY = """You are a concise literary summarizer. Given a chapter from a classic book, produce a structured summary with these exact sections:

**Overview** — 2-3 sentences capturing the chapter's main arc.
**Key Events** — 3-5 bullet points of the most important plot developments.
**Characters** — who appears and what they do (skip if no named characters).
**Themes** — 1-2 recurring motifs or literary themes present in this chapter.

Be concise. Focus on plot and character. Do not include spoilers beyond this chapter. Use markdown."""


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


async def generate_chapter_summary(
    api_key: str, chapter_text: str, book_title: str, author: str, chapter_title: str = ""
) -> str:
    # Use first 4000 chars to stay well within token limits; summaries cover entire chapter structure.
    excerpt = chapter_text[:4000].strip()
    chapter_label = f' — {chapter_title}' if chapter_title else ''
    prompt = (
        f'Book: "{book_title}"{chapter_label} by {author}\n\n'
        f"Chapter text:\n---\n{excerpt}\n---\n\n"
        "Produce a structured summary of this chapter."
    )
    return await _generate(api_key, SYSTEM_SUMMARY, prompt, 600)


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


async def define_word(api_key: str, word: str, lang: str = "en") -> dict:
    """Return an AI-generated definition for a word or phrase.

    Used as a fallback when wiktionary returns no definitions — handles German
    compound words, inflected forms, and multi-word phrases that wiktionary misses.

    Returns the same shape as wiktionary.lookup so callers can use either transparently.
    """
    lang_note = f" The word is in {lang}." if lang != "en" else ""
    prompt = (
        f'Define "{word}" as it would appear in a reading context.{lang_note}\n\n'
        "Return a JSON object with exactly these fields:\n"
        '  "lemma": the base/dictionary form of the word or phrase\n'
        '  "definitions": array of objects with "pos" (part of speech) and "text" (definition)\n'
        "Provide 1-3 definitions. Keep each definition under 100 words. "
        "Return ONLY the JSON object, no markdown, no explanation."
    )
    import json as _json
    raw = await _generate(api_key, "", prompt, 400)
    raw = raw.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        data = _json.loads(raw)
        return {
            "lemma": str(data.get("lemma", word)),
            "language": lang,
            "definitions": [
                {"pos": str(d.get("pos", "")), "text": str(d.get("text", ""))}
                for d in data.get("definitions", [])[:3]
                if d.get("text")
            ],
            "url": "",
            "source": "ai",
        }
    except Exception:
        return {
            "lemma": word, "language": lang, "definitions": [],
            "url": "", "source": "ai",
        }


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


# ── Batched literary translation ─────────────────────────────────────────────

SYSTEM_LITERARY_TRANSLATOR = """You are an award-winning literary translator. \
Translate each chapter from {source} to {target} preserving:
- Literary style, tone, voice, and rhythm
- Character names, place names, and cultural references — KEEP THESE CONSISTENT across chapters
- Paragraph structure (each paragraph in the original is one paragraph in the output)
- Verse line breaks (if the source uses short lines for poetry/drama, preserve them)

Output format — CRITICAL:
Wrap each chapter's translation in <chapter index="N"> ... </chapter> tags using the
same `index` attribute you saw in the input. Do not add commentary, titles, or numbering.
Do NOT re-translate or comment on material provided as <context>...</context>.
Only translate content inside <chapter> tags."""


# Parses <chapter index="N">content</chapter> blocks from the model output.
_CHAPTER_BLOCK_RE = re.compile(
    r'<chapter\s+index\s*=\s*["\']?(\d+)["\']?\s*>(.*?)</chapter>',
    re.DOTALL | re.IGNORECASE,
)


# Rough estimate: how many output tokens a chapter of N source words
# will consume. Mirrors bulk_translate.WORDS_TO_OUTPUT_TOKENS so the
# batch-grouper and the chunker agree on "oversized".
_WORDS_TO_OUTPUT_TOKENS = 1.4


def _estimate_output_tokens(text: str) -> int:
    """Approx output tokens for a source text, with a small wrapper
    allowance for the `<chapter>` tags the model echoes back."""
    return int(len(text.split()) * _WORDS_TO_OUTPUT_TOKENS) + 100


def _split_paragraphs_into_budget_chunks(
    paragraphs: list[str], max_output_tokens: int,
) -> list[list[str]]:
    """Group consecutive paragraphs so each sub-chunk stays under the
    model's output budget. Used to translate one oversized chapter via
    several API calls while preserving paragraph order and count.

    Leaves a 10% headroom so the model still fits its reply inside
    max_output_tokens even when our per-word estimate under-counts
    (CJK targets, dense verse)."""
    if not paragraphs:
        return []
    # If even a single paragraph on its own exceeds the budget we still
    # put it in its own chunk — splitting mid-paragraph would lose
    # paragraph alignment downstream. The caller has to accept the risk
    # of mid-paragraph truncation on that one call.
    budget = int(max_output_tokens * 0.9)
    chunks: list[list[str]] = []
    current: list[str] = []
    current_tokens = 0
    for para in paragraphs:
        est = _estimate_output_tokens(para)
        if current and current_tokens + est > budget:
            chunks.append(current)
            current = []
            current_tokens = 0
        current.append(para)
        current_tokens += est
    if current:
        chunks.append(current)
    return chunks


async def translate_chapters_batch(
    api_key: str,
    chapters: list[tuple[int, str]],  # list of (chapter_index, chapter_text)
    source_language: str,
    target_language: str,
    *,
    prior_context: str = "",   # already-translated text to anchor consistency
    model: str = TRANSLATOR_MODEL,
    max_output_tokens: int = 8192,
) -> dict[int, list[str]]:
    """Translate multiple chapters in a single API call.

    Each chapter is sent inside a `<chapter index="N">` tag. The model
    returns the same structure with translated content. Output is parsed
    back into a `{chapter_index: [paragraph, paragraph, ...]}` dict.

    The `prior_context` argument lets callers anchor the model for
    cross-batch consistency (character/place names, style). It should be
    a plain text snippet of previously-translated material.

    Oversized-chapter handling: if the batch has a single chapter whose
    estimated output tokens exceed `max_output_tokens`, the chapter is
    split into paragraph-aligned sub-chunks and translated across
    multiple API calls. Each sub-chunk uses the previous sub-chunk's
    tail as `prior_context` for cross-cut style consistency.

    Raises ValueError if the response can't be parsed into at least one
    chapter block — callers can fall back to per-chapter translation.
    """
    if not chapters:
        return {}

    # Single oversized chapter — translate in sub-chunks, preserving
    # paragraph order, so we stop dead-ending at MAX_TOKENS for long
    # chapters on flash-tier models.
    if len(chapters) == 1:
        idx, text = chapters[0]
        if _estimate_output_tokens(text) > max_output_tokens:
            return await _translate_chapter_in_chunks(
                api_key, idx, text,
                source_language, target_language,
                prior_context=prior_context,
                model=model,
                max_output_tokens=max_output_tokens,
            )

    system = SYSTEM_LITERARY_TRANSLATOR.format(
        source=source_language, target=target_language,
    )

    # Build the user prompt
    parts: list[str] = []
    if prior_context.strip():
        parts.append(
            "<context>\nThese chapters have already been translated — use the "
            "same naming conventions and style. Do not re-translate.\n\n"
            f"{prior_context.strip()}\n</context>"
        )
    for idx, text in chapters:
        parts.append(f'<chapter index="{idx}">\n{text.strip()}\n</chapter>')
    parts.append(
        "Translate the content inside each <chapter> tag. Output each "
        "translation wrapped in the same <chapter> tags with the matching "
        "index attribute. No extra commentary."
    )

    prompt = "\n\n".join(parts)

    client = _client(api_key)
    config = types.GenerateContentConfig(
        system_instruction=system,
        max_output_tokens=max_output_tokens,
        safety_settings=_LITERARY_SAFETY_SETTINGS,
    )
    response = await client.aio.models.generate_content(
        model=model, contents=prompt, config=config,
    )
    try:
        raw = response.text or ""
    except ValueError:
        raw = ""

    # Gemini tells us why generation stopped — MAX_TOKENS means we
    # truncated the output (often mid-chapter, so `</chapter>` is
    # missing). SAFETY / RECITATION means content was blocked. Other
    # finish reasons usually mean the response was empty for some
    # benign reason. We surface the reason in the error so the queue
    # worker's chain-advance logs point at a concrete problem.
    finish_reason = ""
    try:
        finish_reason = str(response.candidates[0].finish_reason or "")
    except (AttributeError, IndexError, TypeError):
        pass

    # Parse <chapter> blocks out of the response
    matches = _CHAPTER_BLOCK_RE.findall(raw)
    if not matches:
        # Fallback: when we sent exactly one chapter and the model
        # produced non-empty prose without the `<chapter>` wrapping,
        # trust it — it's almost certainly just that chapter's
        # translation (common on flash-lite with short inputs). Only
        # do this when the finish reason is a clean STOP; truncated
        # output isn't a complete translation.
        if (
            len(chapters) == 1
            and raw.strip()
            and finish_reason.upper().endswith("STOP")
        ):
            idx = chapters[0][0]
            paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
            if paragraphs:
                return {idx: paragraphs}

        # Diagnostic error: include the finish reason and a preview
        # of the raw output so admins can see whether the model
        # truncated, was blocked, or simply returned the wrong
        # format.
        preview = raw.strip()[:160].replace("\n", "\\n")
        reason = f" (finish_reason={finish_reason})" if finish_reason else ""
        raise ValueError(
            f"Gemini response contained no <chapter> blocks{reason} — "
            f"raw preview: {preview!r}"
        )

    result: dict[int, list[str]] = {}
    for idx_str, body in matches:
        idx = int(idx_str)
        paragraphs = [
            p.strip("\n").rstrip()
            for p in body.split("\n\n")
            if p.strip()
        ]
        if paragraphs:
            result[idx] = paragraphs
    return result


async def _translate_chapter_in_chunks(
    api_key: str,
    chapter_index: int,
    chapter_text: str,
    source_language: str,
    target_language: str,
    *,
    prior_context: str,
    model: str,
    max_output_tokens: int,
) -> dict[int, list[str]]:
    """Translate a single oversized chapter across several API calls.

    Splits the chapter's paragraphs into budget-sized sub-chunks,
    translates each as its own batch of one, and concatenates the
    paragraphs in order. Each call after the first passes a small tail
    of the previous translation as `prior_context` so the model keeps
    names and style consistent across the cut.

    Returns the same shape as `translate_chapters_batch`:
    `{chapter_index: [paragraph, ...]}`.
    """
    paragraphs = [p.strip() for p in chapter_text.split("\n\n") if p.strip()]
    if not paragraphs:
        return {chapter_index: []}
    sub_chunks = _split_paragraphs_into_budget_chunks(paragraphs, max_output_tokens)
    out: list[str] = []
    carry = prior_context
    for chunk_paragraphs in sub_chunks:
        chunk_text = "\n\n".join(chunk_paragraphs)
        # IMPORTANT: recurse into translate_chapters_batch but with the
        # sub-chunk small enough that the top-level "oversized" branch
        # does NOT fire — otherwise we'd loop. The split guarantees
        # each sub-chunk fits in budget, so the single-call path runs.
        sub = await translate_chapters_batch(
            api_key, [(chapter_index, chunk_text)],
            source_language, target_language,
            prior_context=carry,
            model=model,
            max_output_tokens=max_output_tokens,
        )
        translated = sub.get(chapter_index, [])
        out.extend(translated)
        # Carry the last 1–2 translated paragraphs as context for the
        # next sub-chunk. Keeps character names etc. consistent.
        if translated:
            carry = "\n\n".join(translated[-2:])
    return {chapter_index: out}


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
