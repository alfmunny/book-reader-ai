"""Wiktionary REST API integration for word definitions and lemma extraction."""
import json
import re
from urllib.parse import quote

import httpx

_BASE = "https://en.wiktionary.org/api/rest_v1/page/definition"
_HEADERS = {"User-Agent": "BookReaderAI/1.0 (https://github.com/alfmunny/book-reader-ai)"}

# Keywords that signal a "form of" definition entry
_FORM_KEYWORDS = frozenset({
    "participle", "tense", "plural", "singular", "genitive", "dative",
    "accusative", "nominative", "inflection", "form", "comparative",
    "superlative", "conjugation", "imperative", "infinitive",
})


def _extract_lemma(raw_html: str, current_word: str) -> str | None:
    """Try to extract the base form from a Wiktionary 'form of' definition.

    Examples handled:
      "past participle of <b class='Latn'>gehen</b>"
      "plural of <a href='./Buch'>Buch</a>"
    """
    lower = re.sub(r"<[^>]+>", "", raw_html).lower()
    if " of " not in lower and not any(k in lower for k in _FORM_KEYWORDS):
        return None

    # Extract text node immediately after "of " followed by one or more tags
    m = re.search(r"\bof\s+(?:<[^>]+>)+([^<\s,;.]+)", raw_html, re.IGNORECASE)
    if m:
        candidate = m.group(1).strip(" .,;")
        if candidate and candidate.lower() != current_word.lower():
            return candidate

    # Fallback: plain "of word" without HTML tags
    m = re.search(r"\bof\s+([A-Za-zÀ-öø-ÿ\u0400-\u04FF\-]+)", raw_html, re.IGNORECASE)
    if m:
        candidate = m.group(1).strip()
        if candidate and candidate.lower() != current_word.lower():
            return candidate

    return None


def _strip_html(text: str) -> str:
    # Remove <style> and <script> blocks entirely (including their CSS/JS content)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    return re.sub(r"<[^>]+>", "", text).strip()


async def lookup(word: str, lang: str = "en") -> dict:
    """Fetch definition and lemma for *word* in *lang* from English Wiktionary.

    Returns::

        {
            "lemma": str,           # base form (== word if no form-of found)
            "language": str,        # the lang code used
            "definitions": [        # up to 3
                {"pos": str, "text": str}
            ],
            "url": str,             # canonical Wiktionary URL
        }
    """
    url = f"{_BASE}/{quote(word.lower(), safe='')}"
    wikt_url = f"https://en.wiktionary.org/wiki/{quote(word, safe='')}"

    empty = {"lemma": word, "language": lang, "definitions": [], "url": wikt_url}

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, headers=_HEADERS)
    except Exception:
        return empty

    if resp.status_code != 200:
        return empty

    try:
        data = resp.json()
    except Exception:
        return empty

    entries = data.get(lang) or data.get("en") or []

    definitions: list[dict] = []
    lemma: str = word

    for entry in entries[:3]:
        pos = entry.get("partOfSpeech", "")
        for defn in entry.get("definitions", [])[:2]:
            raw = defn.get("definition", "")
            clean = _strip_html(raw)
            if not clean:
                continue

            # Try lemma extraction on first definition only
            if lemma == word:
                candidate = _extract_lemma(raw, word)
                if candidate:
                    lemma = candidate

            definitions.append({"pos": pos, "text": clean})
            if len(definitions) >= 3:
                break
        if len(definitions) >= 3:
            break

    return {
        "lemma": lemma,
        "language": lang,
        "definitions": definitions,
        "url": wikt_url,
    }


_AI_SYSTEM = (
    "You are a multilingual dictionary. Given a word or phrase and its language, "
    "return ONLY a JSON object with this exact shape:\n"
    '{"lemma": "<base form>", "definitions": [{"pos": "<part of speech>", "text": "<definition>"}]}\n'
    "Include at most 3 definitions. If the input is already the base form, lemma == input. "
    "No markdown fences, no extra keys, no explanation — raw JSON only."
)


async def ai_lookup(word: str, lang: str, api_key: str) -> dict:
    """Call Gemini to look up *word* when Wiktionary returns nothing.

    Returns the same shape as :func:`lookup`.
    """
    from services.gemini import _generate
    wikt_url = f"https://en.wiktionary.org/wiki/{quote(word, safe='')}"
    empty = {"lemma": word, "language": lang, "definitions": [], "url": wikt_url}
    try:
        prompt = f'Word: "{word}"\nLanguage code: {lang}'
        raw = await _generate(api_key, _AI_SYSTEM, prompt, max_tokens=256)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
        data = json.loads(raw)
        definitions = [
            {"pos": d.get("pos", ""), "text": d.get("text", "")}
            for d in data.get("definitions", [])
            if d.get("text")
        ][:3]
        return {
            "lemma": data.get("lemma") or word,
            "language": lang,
            "definitions": definitions,
            "url": wikt_url,
        }
    except Exception:
        return empty
