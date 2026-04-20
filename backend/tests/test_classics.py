"""Tests for services/classics.py — get_classics() and get_free_ids()."""

import json
import pytest
import services.classics as classics_module
from services.classics import get_classics, get_free_ids


SAMPLE_CLASSICS = [
    {"id": 1342, "title": "Pride and Prejudice"},
    {"id": 11, "title": "Alice's Adventures in Wonderland"},
    {"id": 84, "title": "Frankenstein"},
]


@pytest.fixture(autouse=True)
def reset_cache(monkeypatch):
    """Reset the module-level cache before each test."""
    monkeypatch.setattr(classics_module, "_classics_cache", None)
    yield
    monkeypatch.setattr(classics_module, "_classics_cache", None)


def test_get_classics_loads_from_json_file(tmp_path, monkeypatch):
    json_file = tmp_path / "free_classics.json"
    json_file.write_text(json.dumps(SAMPLE_CLASSICS), encoding="utf-8")
    monkeypatch.setattr(classics_module, "_CLASSICS_PATH", str(json_file))

    result = get_classics()
    assert result == SAMPLE_CLASSICS


def test_get_classics_is_cached(tmp_path, monkeypatch):
    json_file = tmp_path / "free_classics.json"
    json_file.write_text(json.dumps(SAMPLE_CLASSICS), encoding="utf-8")
    monkeypatch.setattr(classics_module, "_CLASSICS_PATH", str(json_file))

    result1 = get_classics()
    # Remove the file — if caching works the second call still succeeds
    json_file.unlink()
    result2 = get_classics()

    assert result1 is result2


def test_get_classics_returns_empty_list_when_file_missing(monkeypatch):
    monkeypatch.setattr(classics_module, "_CLASSICS_PATH", "/nonexistent/path/free_classics.json")

    result = get_classics()
    assert result == []


def test_get_free_ids_returns_set_of_ints(tmp_path, monkeypatch):
    json_file = tmp_path / "free_classics.json"
    json_file.write_text(json.dumps(SAMPLE_CLASSICS), encoding="utf-8")
    monkeypatch.setattr(classics_module, "_CLASSICS_PATH", str(json_file))

    ids = get_free_ids()
    assert isinstance(ids, set)
    assert ids == {1342, 11, 84}


def test_get_free_ids_empty_when_no_file(monkeypatch):
    monkeypatch.setattr(classics_module, "_CLASSICS_PATH", "/nonexistent/path/free_classics.json")

    ids = get_free_ids()
    assert ids == set()
