"""Wiktionary REST API integration for word definitions and lemma extraction."""
import json
import re
from urllib.parse import quote

import httpx

# Definitions can be requested in any language: each Wiktionary edition is its
# own wiki, so the *target* language selects the host (#2704). Non-English
# editions are far thinner than en.wiktionary, which is why the caller falls
# through to an AI lookup and then to English.
_BASE_TEMPLATE = "https://{target}.wiktionary.org/api/rest_v1/page/definition"
DEFAULT_TARGET_LANG = "en"
_HEADERS = {"User-Agent": "BookReaderAI/1.0 (https://github.com/alfmunny/book-reader-ai)"}

# A form-of statement has one of these words directly before "of"
# ("past participle of X", "plural of X", "comparative degree of X", ...).
# A bare " of " is NOT enough: ordinary glosses use it constantly
# ("not befitting someone of higher class") and following those produced
# nonsense base forms (owner report, 2026-08-25: gewoehnlich -> "higher").
_FORM_OF_RE = re.compile(
    r"\b(?:participle|tense|past|present|preterite|plural|singular|genitive"
    r"|dative|accusative|nominative|inflection|forms?|comparative|superlative"
    r"|conjugation|imperative|infinitive|subjunctive|gerund|diminutive|degree"
    r"|spelling|misspelling|abbreviation|contraction|clipping|variant)"
    r"\s+of\s+",
    re.IGNORECASE,
)

_WORD_RE = re.compile(r"[A-Za-z\u00C0-\u00F6\u00F8-\u00FF\u0400-\u04FF\-]+")


def _extract_lemma(raw_html: str, current_word: str) -> str | None:
    """Try to extract the base form from a Wiktionary 'form of' definition.

    Examples handled:
      "past participle of <b class='Latn'>gehen</b>"
      "plural of <a href='./Buch'>Buch</a>"
    """
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", raw_html)).strip()
    m = _FORM_OF_RE.search(text)
    if not m:
        return None

    wm = _WORD_RE.match(text[m.end():])
    if wm:
        candidate = wm.group(0)
        if candidate.lower() != current_word.lower():
            return candidate

    return None


def _strip_html(text: str) -> str:
    # Remove <style> and <script> blocks entirely (including their CSS/JS content)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL | re.IGNORECASE)
    return re.sub(r"<[^>]+>", "", text).strip()


async def _fetch(word: str, lang: str, target: str = DEFAULT_TARGET_LANG) -> dict | None:
    """GET the definition payload for *word* from *target*'s Wiktionary, or None."""
    base = _BASE_TEMPLATE.format(target=quote(target, safe=""))
    url = f"{base}/{quote(word.lower(), safe='')}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url, headers=_HEADERS)
    except Exception:
        return None
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except Exception:
        return None


def _parse(data: dict, lang: str, word: str) -> tuple[list[dict], str]:
    """Return (definitions, lemma) from a Wiktionary payload."""
    # Non-English editions do not always key their sections by ISO code, so fall
    # back to whichever section the wiki did return rather than finding nothing.
    entries = data.get(lang) or data.get("en") or next(
        (v for v in data.values() if isinstance(v, list) and v), []
    )

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

    return definitions, lemma


def _wiki_url(word: str, target: str = DEFAULT_TARGET_LANG) -> str:
    return f"https://{target}.wiktionary.org/wiki/{quote(word, safe='')}"


async def lookup(word: str, lang: str = "en", target: str = DEFAULT_TARGET_LANG) -> dict:
    """Fetch definition and lemma for *word* in *lang*.

    An inflected word's own Wiktionary entry usually says nothing more than which
    form it is ("past participle of gehen"), which is useless on its own — so when
    a base form is found the pointer is followed once and the base form's actual
    definitions are returned instead, with the form-of note kept separately (#2663).

    Returns::

        {
            "lemma": str,           # base form (== word if no form-of found)
            "language": str,        # the lang code used
            "definitions": [        # up to 3, of the base form when one was found
                {"pos": str, "text": str}
            ],
            "form_of": str | None,  # e.g. "past participle of gehen"
            "url": str,             # canonical Wiktionary URL
            "definition_lang": str, # the language the definitions are written in
        }

    *lang* is the language the word itself is in; *target* is the language the
    definitions should be written in, and selects which Wiktionary edition is
    queried (#2704).
    """
    empty = {"lemma": word, "language": lang, "definitions": [], "form_of": None,
             "url": _wiki_url(word, target), "definition_lang": target}

    data = await _fetch(word, lang, target)
    if data is None:
        return empty

    definitions, lemma = _parse(data, lang, word)

    if lemma == word:
        return {**empty, "definitions": definitions}

    form_of = definitions[0]["text"] if definitions else None
    base_data = await _fetch(lemma, lang, target)
    base_definitions = _parse(base_data, lang, lemma)[0] if base_data else []

    if not base_definitions:
        # Base form has no usable entry — the form-of statement is still better
        # than showing the user nothing at all.
        return {"lemma": lemma, "language": lang, "definitions": definitions,
                "form_of": form_of, "url": _wiki_url(word, target),
                "definition_lang": target}

    return {
        "lemma": lemma,
        "language": lang,
        "definitions": base_definitions,
        "form_of": form_of,
        "url": _wiki_url(lemma, target),
        "definition_lang": target,
    }


_AI_SYSTEM = (
    "You are a multilingual dictionary. Given a word or phrase and its language, "
    "return ONLY a JSON object with this exact shape:\n"
    '{"lemma": "<base form>", "definitions": [{"pos": "<part of speech>", "text": "<definition>"}]}\n'
    "Include at most 3 definitions. If the input is inflected, lemma is its base form. "
    "If the word is a compound (common in German), the FIRST definition must explain "
    'its parts with pos "compound", e.g. for "Himmelslicht": '
    '{"pos": "compound", "text": "Himmel (heaven) + Licht (light): light of heaven"}. '
    "For rare or author-invented words, infer the meaning from the parts and say so. "
    "No markdown fences, no extra keys, no explanation — raw JSON only."
)

# Appended when the reader asked for definitions in a language other than English
# (#2704). `lemma` and `pos` stay machine-readable; only the gloss is translated.
_AI_TARGET_RULE = (
    '\nWrite every "text" value in {target_name}. Keep "lemma" in the word\'s own '
    'language and "pos" as a plain English part-of-speech tag.'
)

# Language names the AI is asked to write in. Anything not listed falls back to
# the bare code, which the models handle acceptably.
_LANG_NAMES = {
    "zh": "Chinese (Simplified)", "de": "German", "fr": "French", "es": "Spanish",
    "it": "Italian", "pt": "Portuguese", "ru": "Russian", "ja": "Japanese",
    "ko": "Korean", "nl": "Dutch", "pl": "Polish", "tr": "Turkish",
    "ar": "Arabic", "hi": "Hindi", "sv": "Swedish", "en": "English",
}


def _system_prompt(target: str) -> str:
    if target == DEFAULT_TARGET_LANG:
        return _AI_SYSTEM
    return _AI_SYSTEM + _AI_TARGET_RULE.format(target_name=_LANG_NAMES.get(target, target))


async def ai_lookup(
    word: str, lang: str, api_key: str, provider: str = "gemini",
    target: str = DEFAULT_TARGET_LANG,
) -> dict:
    """Look up *word* with the user's own AI key when Wiktionary returns nothing.

    *provider* is one of "deepseek" / "gemini" / "claude" — the key belongs to
    that provider. *target* is the language the definitions should be written in.
    Returns the same shape as :func:`lookup`.
    """
    empty = {"lemma": word, "language": lang, "definitions": [], "form_of": None,
             "url": _wiki_url(word, target), "definition_lang": target}
    system = _system_prompt(target)
    try:
        prompt = f'Word: "{word}"\nLanguage code: {lang}'
        if provider == "deepseek":
            from services.deepseek import _chat
            raw = await _chat(api_key, system, prompt, max_tokens=400)
        elif provider == "claude":
            from services.claude import dictionary_lookup_with_key
            raw = await dictionary_lookup_with_key(api_key, system, prompt)
        else:
            from services.gemini import _generate
            raw = await _generate(api_key, system, prompt, max_tokens=400)
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
            "form_of": None,
            "url": "",
            "definition_lang": target,
        }
    except Exception:
        return empty
