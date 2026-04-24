"""Tests for scripts/generate_docs.py (#864 PR B).

Each generator is a pure function over a filesystem snapshot. Tests stage
minimal input trees under pytest's `tmp_path` fixture and assert on the
generated file's content. No network, no DB.
"""

from __future__ import annotations

import os
import sys
from datetime import date
from pathlib import Path

import pytest

_SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"
)
sys.path.insert(0, _SCRIPTS_DIR)

import generate_docs  # noqa: E402


# ── _extract_module_docstring / _extract_argparse_help ──────────────────────


def _write(path: Path, content: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def test_extract_module_docstring_returns_empty_when_missing(tmp_path):
    p = _write(tmp_path / "bare.py", "x = 1\n")
    assert generate_docs._extract_module_docstring(p) == ""


def test_extract_module_docstring_returns_text_when_present(tmp_path):
    p = _write(
        tmp_path / "described.py",
        '"""One-line summary.\n\nSecond paragraph.\n"""\n\nx = 1\n',
    )
    doc = generate_docs._extract_module_docstring(p)
    assert "One-line summary." in doc
    assert "Second paragraph." in doc


def test_extract_argparse_help_produces_markdown_table(tmp_path):
    p = _write(
        tmp_path / "cli.py",
        """
import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--limit", type=int, help="Cap to N.")
parser.add_argument("--verbose", help="Talk more.")
""",
    )
    table = generate_docs._extract_argparse_help(p)
    assert "| `--limit` | Cap to N. |" in table
    assert "| `--verbose` | Talk more. |" in table


def test_extract_argparse_help_returns_empty_when_no_argparse(tmp_path):
    p = _write(tmp_path / "no_cli.py", '"""Nothing to see here."""\n')
    assert generate_docs._extract_argparse_help(p) == ""


# ── generate_scripts_reference ──────────────────────────────────────────────


def test_generate_scripts_reference_skips_files_without_docstring(tmp_path):
    scripts = tmp_path / "scripts"
    _write(scripts / "with_doc.py", '"""I have a docstring."""\n')
    _write(scripts / "empty.py", "x = 1\n")
    _write(scripts / "__init__.py", "")
    _write(scripts / "generate_docs.py", '"""Also skipped."""\n')

    out = tmp_path / "reference" / "scripts.md"
    generate_docs.generate_scripts_reference(scripts, out)
    text = out.read_text(encoding="utf-8")

    assert "## `with_doc.py`" in text
    assert "I have a docstring." in text
    assert "empty.py" not in text  # no docstring → skipped
    assert "generate_docs.py" not in text  # self-skipped


def test_generate_scripts_reference_emits_argparse_flags_when_present(tmp_path):
    scripts = tmp_path / "scripts"
    _write(
        scripts / "tool.py",
        '''"""A tool."""
import argparse
p = argparse.ArgumentParser()
p.add_argument("--book-id", type=int, help="Which book.")
''',
    )
    out = tmp_path / "reference" / "scripts.md"
    generate_docs.generate_scripts_reference(scripts, out)
    text = out.read_text(encoding="utf-8")
    assert "### Flags" in text
    assert "| `--book-id` | Which book. |" in text


def test_generate_scripts_reference_writes_banner(tmp_path):
    scripts = tmp_path / "scripts"
    _write(scripts / "a.py", '"""A."""\n')
    out = tmp_path / "reference" / "scripts.md"
    generate_docs.generate_scripts_reference(scripts, out)
    assert out.read_text(encoding="utf-8").startswith(generate_docs.BANNER)


# ── generate_reports_index ──────────────────────────────────────────────────


def test_generate_reports_index_uses_h1_as_title(tmp_path):
    reports = tmp_path / "reports"
    _write(
        reports / "epub_audit_2026_04_24.md",
        "# EPUB Split Audit — 2026-04-24\n\nSummary paragraph here.\n",
    )
    out = tmp_path / "reference" / "reports.md"
    generate_docs.generate_reports_index(reports, out)
    text = out.read_text(encoding="utf-8")
    assert "## EPUB Split Audit — 2026-04-24" in text
    assert "epub_audit_2026_04_24.md" in text
    assert "Summary paragraph here." in text


def test_generate_reports_index_orders_by_filename_descending(tmp_path):
    reports = tmp_path / "reports"
    _write(reports / "01_older.md", "# Older\n\nOne.\n")
    _write(reports / "02_newer.md", "# Newer\n\nTwo.\n")
    out = tmp_path / "reference" / "reports.md"
    generate_docs.generate_reports_index(reports, out)
    text = out.read_text(encoding="utf-8")
    newer_idx = text.index("Newer")
    older_idx = text.index("Older")
    assert newer_idx < older_idx, "newer reports come first"


def test_generate_reports_index_skips_metadata_lines_when_finding_summary(tmp_path):
    reports = tmp_path / "reports"
    _write(
        reports / "r.md",
        """# A Report

**Author:** Someone
**Date:** 2026

---

This is the actual summary paragraph.
""",
    )
    out = tmp_path / "reference" / "reports.md"
    generate_docs.generate_reports_index(reports, out)
    text = out.read_text(encoding="utf-8")
    assert "This is the actual summary paragraph." in text


# ── generate_design_index ──────────────────────────────────────────────────


def test_generate_design_index_parses_status_line(tmp_path):
    design = tmp_path / "design"
    _write(
        design / "foo.md",
        """# Design: Foo

**Status:** Draft — awaiting PM review

## Problem

We have a problem with foo.
""",
    )
    out = tmp_path / "architecture" / "design-index.md"
    generate_docs.generate_design_index(design, out)
    text = out.read_text(encoding="utf-8")
    assert "Design: Foo" in text
    assert "Draft — awaiting PM review" in text
    assert "We have a problem with foo." in text


def test_generate_design_index_renders_table_with_link(tmp_path):
    design = tmp_path / "design"
    _write(design / "a.md", "# A design\n\n**Status:** Merged\n\n## Problem\n\nA problem.\n")
    _write(design / "b.md", "# B design\n\n**Status:** Merged\n\n## Problem\n\nB problem.\n")
    out = tmp_path / "architecture" / "design-index.md"
    generate_docs.generate_design_index(design, out)
    text = out.read_text(encoding="utf-8")
    assert "| [A design](../design/a.md) | Merged |" in text
    assert "| [B design](../design/b.md) | Merged |" in text


# ── generate_migration_index ────────────────────────────────────────────────


def test_generate_migration_index_extracts_leading_comment(tmp_path):
    migrations = tmp_path / "migrations"
    _write(
        migrations / "031_fk_annotations_vocabulary.sql",
        """-- Issue #754 / PR 1/4: declare REFERENCES ... ON DELETE CASCADE
-- on annotations and vocabulary.

CREATE TABLE annotations_new (...);
""",
    )
    out = tmp_path / "architecture" / "migrations.md"
    generate_docs.generate_migration_index(migrations, out)
    text = out.read_text(encoding="utf-8")
    assert "031 — `031_fk_annotations_vocabulary.sql`" in text
    assert "Issue #754" in text
    assert "CREATE TABLE" not in text, "SQL body must not leak into the description"


def test_generate_migration_index_handles_no_comment(tmp_path):
    migrations = tmp_path / "migrations"
    _write(migrations / "099_bare.sql", "CREATE TABLE foo (id INTEGER);\n")
    out = tmp_path / "architecture" / "migrations.md"
    generate_docs.generate_migration_index(migrations, out)
    text = out.read_text(encoding="utf-8")
    assert "099 — `099_bare.sql`" in text
    assert "_(no description comment in file)_" in text


# ── generate_daily_journal_stub ────────────────────────────────────────────


def test_generate_daily_journal_stub_renders_all_seven_sections(tmp_path):
    out = tmp_path / "journal" / "2026-04-24.md"
    generate_docs.generate_daily_journal_stub(date(2026, 4, 24), out)
    text = out.read_text(encoding="utf-8")
    for section in (
        "# 2026-04-24",
        "## 1. What shipped",
        "## 2. Reports generated",
        "## 3. Pipeline / workflow lessons",
        "## 4. Next things",
        "## 5. Incidents / near-misses",
        "## 6. Decisions and abandoned paths",
        "## 7. User-facing changelog",
    ):
        assert section in text, f"missing section: {section}"


# ── main() CLI ──────────────────────────────────────────────────────────────


def test_main_runs_all_generators_end_to_end(tmp_path, monkeypatch):
    # Build a fake repo tree.
    (tmp_path / "backend" / "scripts").mkdir(parents=True)
    (tmp_path / "reports").mkdir()
    (tmp_path / "docs" / "design").mkdir(parents=True)
    (tmp_path / "backend" / "migrations").mkdir()

    _write(tmp_path / "backend" / "scripts" / "s.py", '"""A script."""\n')
    _write(tmp_path / "reports" / "r.md", "# A report\n\nSummary.\n")
    _write(
        tmp_path / "docs" / "design" / "d.md",
        "# Design doc\n\n**Status:** Draft\n\n## Problem\n\nThe problem.\n",
    )
    _write(
        tmp_path / "backend" / "migrations" / "001_init.sql",
        "-- Initial schema.\n\nCREATE TABLE a (id INTEGER);\n",
    )

    rc = generate_docs.main(["--repo-root", str(tmp_path)])
    assert rc == 0

    # Every output file landed in the expected location.
    assert (tmp_path / "docs" / "reference" / "scripts.md").exists()
    assert (tmp_path / "docs" / "reference" / "reports.md").exists()
    assert (tmp_path / "docs" / "architecture" / "design-index.md").exists()
    assert (tmp_path / "docs" / "architecture" / "migrations.md").exists()
