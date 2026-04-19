import json
import os

_CLASSICS_PATH = os.path.join(os.path.dirname(__file__), "..", "free_classics.json")
_classics_cache: list[dict] | None = None


def get_classics() -> list[dict]:
    global _classics_cache
    if _classics_cache is None:
        if os.path.isfile(_CLASSICS_PATH):
            with open(_CLASSICS_PATH, encoding="utf-8") as f:
                _classics_cache = json.load(f)
        else:
            _classics_cache = []
    return _classics_cache


def get_free_ids() -> set[int]:
    return {b["id"] for b in get_classics()}
