"""Tests for generate_journal_nav: auto-populates the journal nav blocks."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
sys.path.insert(0, _SCRIPTS_DIR)

from generate_docs import generate_journal_nav  # noqa: E402


def _seed_repo(tmp_path: Path, days: list[str]) -> Path:
    daily = tmp_path / "docs" / "journal" / "daily"
    daily.mkdir(parents=True)
    for day in days:
        (daily / f"{day}.md").write_text(f"# {day}\n")
    return tmp_path


def test_rewrites_mkdocs_nav_block_in_reverse_chronological_order(tmp_path: Path) -> None:
    repo = _seed_repo(tmp_path, ["2026-04-22", "2026-04-26", "2026-04-24"])
    (repo / "mkdocs.yml").write_text(
        "nav:\n"
        "  - Journal:\n"
        "      - Introduction: journal/index.md\n"
        "      # <auto-journal-nav>\n"
        "      - 'PLACEHOLDER': journal/daily/PLACEHOLDER.md\n"
        "      # </auto-journal-nav>\n"
    )

    generate_journal_nav(repo)

    out = (repo / "mkdocs.yml").read_text()
    assert "PLACEHOLDER" not in out
    assert "      - '2026-04-26': journal/daily/2026-04-26.md\n" in out
    assert "      - '2026-04-24': journal/daily/2026-04-24.md\n" in out
    assert "      - '2026-04-22': journal/daily/2026-04-22.md\n" in out
    assert out.index("2026-04-26") < out.index("2026-04-24") < out.index("2026-04-22")


def test_rewrites_journal_index_recent_entries_block(tmp_path: Path) -> None:
    repo = _seed_repo(tmp_path, ["2026-04-22", "2026-04-26", "2026-04-24"])
    (repo / "docs" / "journal" / "index.md").write_text(
        "# Journal\n\n"
        "## Recent entries\n\n"
        "<!-- auto-journal-recent-entries -->\n"
        "- placeholder\n"
        "<!-- /auto-journal-recent-entries -->\n\n"
        "footer kept\n"
    )

    generate_journal_nav(repo)

    out = (repo / "docs" / "journal" / "index.md").read_text()
    assert "placeholder" not in out
    assert "- [2026-04-26](daily/2026-04-26.md)" in out
    assert "- [2026-04-24](daily/2026-04-24.md)" in out
    assert "- [2026-04-22](daily/2026-04-22.md)" in out
    assert "# Journal" in out
    assert "footer kept" in out


def test_idempotent_second_run_no_changes(tmp_path: Path) -> None:
    repo = _seed_repo(tmp_path, ["2026-04-26"])
    (repo / "mkdocs.yml").write_text(
        "      # <auto-journal-nav>\n"
        "      - 'old': journal/daily/old.md\n"
        "      # </auto-journal-nav>\n"
    )
    (repo / "docs" / "journal" / "index.md").write_text(
        "<!-- auto-journal-recent-entries -->\n"
        "- old\n"
        "<!-- /auto-journal-recent-entries -->\n"
    )

    generate_journal_nav(repo)
    first_mkdocs = (repo / "mkdocs.yml").read_text()
    first_index = (repo / "docs" / "journal" / "index.md").read_text()

    generate_journal_nav(repo)
    assert (repo / "mkdocs.yml").read_text() == first_mkdocs
    assert (repo / "docs" / "journal" / "index.md").read_text() == first_index


def test_index_caps_at_recent_count(tmp_path: Path) -> None:
    """The mkdocs nav lists every day, but the index page is capped (default 14)."""
    days = [f"2026-04-{i:02d}" for i in range(1, 21)]  # 20 days
    repo = _seed_repo(tmp_path, days)
    (repo / "mkdocs.yml").write_text(
        "      # <auto-journal-nav>\n      # </auto-journal-nav>\n"
    )
    (repo / "docs" / "journal" / "index.md").write_text(
        "<!-- auto-journal-recent-entries -->\n<!-- /auto-journal-recent-entries -->\n"
    )

    generate_journal_nav(repo)

    mkdocs_out = (repo / "mkdocs.yml").read_text()
    assert mkdocs_out.count("journal/daily/") == 20  # all 20 in nav

    index_out = (repo / "docs" / "journal" / "index.md").read_text()
    assert index_out.count("daily/") == 14  # capped at 14
    assert "[2026-04-20](daily/2026-04-20.md)" in index_out  # newest in
    assert "[2026-04-07](daily/2026-04-07.md)" in index_out  # 14th newest in
    assert "[2026-04-06](daily/2026-04-06.md)" not in index_out  # 15th cut


def test_no_op_when_markers_missing(tmp_path: Path) -> None:
    """If markers aren't present, the function leaves files alone (graceful migration)."""
    repo = _seed_repo(tmp_path, ["2026-04-26"])
    mkdocs_text = "nav:\n  - Journal:\n      - Introduction: journal/index.md\n"
    index_text = "# Journal\n\n## Recent entries\n\n- old\n"
    (repo / "mkdocs.yml").write_text(mkdocs_text)
    (repo / "docs" / "journal" / "index.md").write_text(index_text)

    generate_journal_nav(repo)

    assert (repo / "mkdocs.yml").read_text() == mkdocs_text
    assert (repo / "docs" / "journal" / "index.md").read_text() == index_text


def test_no_op_when_daily_dir_missing(tmp_path: Path) -> None:
    """No daily/ dir at all — function returns cleanly without touching anything."""
    (tmp_path / "mkdocs.yml").write_text("# minimal\n")
    generate_journal_nav(tmp_path)  # must not raise
    assert (tmp_path / "mkdocs.yml").read_text() == "# minimal\n"
