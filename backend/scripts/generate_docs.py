"""Pre-build generator for the docs site (#864 PR B).

Writes auto-generated Markdown pages into the MkDocs source tree so
`mkdocs build` picks them up. Runs before `mkdocs build` — see the
`.github/workflows/docs.yml` pre-build step added in this PR.

Five generators, one per auto-gen section:

- `generate_scripts_reference` — from `backend/scripts/*.py` module
  docstrings + argparse parsers.
- `generate_reports_index` — from `reports/*.md` H1 + first paragraph.
- `generate_design_index` — from `docs/design/*.md` H1 + Status line.
- `generate_migration_index` — from `backend/migrations/*.sql` leading
  comment.
- `generate_daily_journal_stub` — emits a dated 7-section stub for the
  next nightly journal run (wired in PR C).

Usage
-----
    # Local dev — regenerate the auto pages and rebuild.
    python -m scripts.generate_docs
    mkdocs serve

    # CI — same invocation runs before `mkdocs build`.

Each generator is a pure function over the filesystem; no network, no
DB. Tests mock input paths and assert on generated file content.

The generated pages are **tracked** in git on the assumption that the
generator runs as part of every docs PR. A future CI drift check
(follow-up issue) can enforce this by running the generator and
failing on a non-empty `git diff docs/`.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


BANNER = (
    "<!-- THIS PAGE IS AUTO-GENERATED. Edit the source script or report, "
    "not this file. Re-run `python -m scripts.generate_docs` after changes. -->\n\n"
)


# ── Scripts reference ────────────────────────────────────────────────────────


SKIP_SCRIPTS = {"__init__.py", "generate_docs.py"}


@dataclass
class ScriptEntry:
    name: str
    module: str
    docstring: str
    argparse_help: str  # may be empty


def _extract_module_docstring(py_path: Path) -> str:
    """Parse the file and return the module-level docstring, or empty."""
    try:
        tree = ast.parse(py_path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return ""
    return ast.get_docstring(tree) or ""


def _extract_argparse_help(py_path: Path) -> str:
    """Very lightweight argparse extractor — looks for --flag / add_argument
    literal strings and returns a Markdown snippet. Best-effort only.

    We deliberately don't import the module (scripts may have side effects);
    static parsing is enough for a readable docs page."""
    try:
        tree = ast.parse(py_path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return ""
    flags: list[tuple[str, str]] = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "add_argument"
        ):
            flag = None
            for arg in node.args:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    if arg.value.startswith("-"):
                        flag = arg.value
                        break
            helptext = ""
            for kw in node.keywords:
                if kw.arg == "help" and isinstance(kw.value, ast.Constant):
                    if isinstance(kw.value.value, str):
                        helptext = kw.value.value
            if flag:
                flags.append((flag, helptext))
    if not flags:
        return ""
    lines = ["| Flag | Description |", "|---|---|"]
    for flag, helptext in flags:
        lines.append(f"| `{flag}` | {helptext or '—'} |")
    return "\n".join(lines)


def _collect_scripts(scripts_dir: Path) -> list[ScriptEntry]:
    entries: list[ScriptEntry] = []
    for py_path in sorted(scripts_dir.glob("*.py")):
        if py_path.name in SKIP_SCRIPTS:
            continue
        docstring = _extract_module_docstring(py_path)
        if not docstring.strip():
            continue
        entries.append(
            ScriptEntry(
                name=py_path.stem,
                module=f"scripts.{py_path.stem}",
                docstring=docstring.strip(),
                argparse_help=_extract_argparse_help(py_path),
            )
        )
    return entries


def generate_scripts_reference(scripts_dir: Path, out_md: Path) -> None:
    entries = _collect_scripts(scripts_dir)
    lines = [BANNER, "# Scripts reference\n"]
    lines.append(
        "Operational CLI tools under `backend/scripts/`. Every script runs "
        "as `python -m <module>` from the `backend/` directory.\n"
    )
    if not entries:
        lines.append("_No scripts with docstrings found._\n")
    for entry in entries:
        lines.append(f"## `{entry.name}.py`\n")
        lines.append(f"{entry.docstring}\n")
        if entry.argparse_help:
            lines.append("### Flags\n")
            lines.append(entry.argparse_help + "\n")
        lines.append(f"```bash\npython -m {entry.module}\n```\n")
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")


# ── Reports index ────────────────────────────────────────────────────────────


def _parse_report(md_path: Path) -> tuple[str, str]:
    """Return (title, first-paragraph-summary) for a report Markdown file."""
    text = md_path.read_text(encoding="utf-8", errors="replace")
    title = md_path.stem.replace("_", " ")
    summary = ""
    # First H1 becomes the title.
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("# "):
            title = s[2:].strip()
            break
    # First non-empty, non-metadata paragraph after the H1 becomes the summary.
    lines = text.splitlines()
    seen_h1 = False
    buf: list[str] = []
    for line in lines:
        s = line.strip()
        if s.startswith("# "):
            seen_h1 = True
            continue
        if not seen_h1:
            continue
        if s.startswith("**") or s.startswith("---") or s.startswith("#"):
            if buf:
                break
            continue
        if not s:
            if buf:
                break
            continue
        buf.append(s)
        if len(" ".join(buf)) > 300:
            break
    summary = " ".join(buf).strip()
    return title, summary


def generate_reports_index(reports_dir: Path, out_md: Path) -> None:
    items: list[tuple[Path, str, str]] = []
    for md_path in sorted(reports_dir.glob("*.md"), reverse=True):
        title, summary = _parse_report(md_path)
        items.append((md_path, title, summary))
    lines = [BANNER, "# Reports\n"]
    lines.append(
        "Audit outputs, benchmarks, and incident write-ups. "
        "Ordered newest first by filename.\n"
    )
    if not items:
        lines.append("_No reports yet._\n")
    for md_path, title, summary in items:
        lines.append(f"## {title}\n")
        lines.append(f"- **File:** `reports/{md_path.name}`")
        if summary:
            lines.append(f"- **TL;DR:** {summary}")
        lines.append("")
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")


# ── Design-doc index ────────────────────────────────────────────────────────


_STATUS_RE = re.compile(r"^\*\*Status:\*\*\s*(.+)$", re.MULTILINE)


def _parse_design_doc(md_path: Path) -> tuple[str, str, str]:
    """Return (title, status, first-paragraph-summary) for a design doc."""
    text = md_path.read_text(encoding="utf-8", errors="replace")
    title = md_path.stem.replace("_", " ").replace("-", " ")
    status = "—"
    summary = ""
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("# "):
            title = s[2:].strip()
            break
    m = _STATUS_RE.search(text)
    if m:
        status = m.group(1).strip()
    # Summary: the first real paragraph after the "## Problem" section heading
    # if present; fall back to the first paragraph after the H1.
    lines = text.splitlines()
    in_problem = False
    buf: list[str] = []
    for line in lines:
        s = line.strip()
        if s.startswith("## Problem"):
            in_problem = True
            continue
        if in_problem:
            if s.startswith("#") or not s:
                if buf:
                    break
                continue
            if s.startswith("**") or s.startswith("---"):
                continue
            buf.append(s)
            if len(" ".join(buf)) > 250:
                break
    summary = " ".join(buf).strip()
    return title, status, summary


def generate_design_index(design_dir: Path, out_md: Path) -> None:
    items: list[tuple[Path, str, str, str]] = []
    for md_path in sorted(design_dir.glob("*.md")):
        title, status, summary = _parse_design_doc(md_path)
        items.append((md_path, title, status, summary))
    lines = [BANNER, "# Design docs index\n"]
    lines.append(
        "Every significant architectural change in Book Reader AI lands as "
        "a merged design doc under `docs/design/`. Auto-generated list below.\n"
    )
    if not items:
        lines.append("_No design docs yet._\n")
    else:
        lines.append("| Design doc | Status | Summary |")
        lines.append("|---|---|---|")
        for md_path, title, status, summary in items:
            link = f"[{title}](../design/{md_path.name})"
            short = summary[:200] + "…" if len(summary) > 200 else summary
            lines.append(f"| {link} | {status} | {short or '—'} |")
        lines.append("")
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")


# ── Migration index ────────────────────────────────────────────────────────


def _parse_migration(sql_path: Path) -> tuple[str, str]:
    """Return (number, description) — description is the leading `--` comment
    block, joined."""
    text = sql_path.read_text(encoding="utf-8", errors="replace")
    name = sql_path.stem  # e.g. "031_fk_annotations_vocabulary"
    number = name.split("_", 1)[0] if "_" in name else name
    desc_lines: list[str] = []
    for line in text.splitlines():
        s = line.rstrip()
        if s.startswith("-- "):
            desc_lines.append(s[3:])
        elif s == "--":
            desc_lines.append("")
        elif s.strip() == "":
            if desc_lines:
                # blank line between comment blocks ends the description
                break
            continue
        else:
            break  # first non-comment, non-blank — stop
    # Trim trailing blanks and join.
    while desc_lines and not desc_lines[-1]:
        desc_lines.pop()
    return number, "\n".join(desc_lines).strip()


def generate_migration_index(migrations_dir: Path, out_md: Path) -> None:
    items: list[tuple[Path, str, str]] = []
    for sql_path in sorted(migrations_dir.glob("*.sql")):
        number, desc = _parse_migration(sql_path)
        items.append((sql_path, number, desc))
    lines = [BANNER, "# Migration index\n"]
    lines.append(
        "Every migration file is numbered and self-describing. Full files "
        "live under `backend/migrations/`.\n"
    )
    if not items:
        lines.append("_No migrations yet._\n")
    for sql_path, number, desc in items:
        lines.append(f"## {number} — `{sql_path.name}`\n")
        if desc:
            lines.append(desc + "\n")
        else:
            lines.append("_(no description comment in file)_\n")
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")


# ── Daily journal stub ────────────────────────────────────────────────────


def generate_daily_journal_stub(day: date, out_md: Path) -> None:
    """Write the 7-section stub for a given day. The nightly workflow
    (PR C) will call this with today's date; locally you can call it
    with any date to seed missing history.
    """
    iso = day.isoformat()
    lines = [
        BANNER,
        f"# {iso}\n",
        "## 1. What shipped\n",
        "_Auto-populated by the nightly workflow from merged PRs grouped by role._\n",
        "## 2. Reports generated\n",
        "_Auto-populated from changes in the `reports/` folder._\n",
        "## 3. Pipeline / workflow lessons\n",
        "_PM to fill._\n",
        "## 4. Next things\n",
        "_Auto-populated from open architecture / feat / bug issues ranked by priority._\n",
        "## 5. Incidents / near-misses\n",
        "_PM to fill._\n",
        "## 6. Decisions and abandoned paths\n",
        "_PM to fill._\n",
        "## 7. User-facing changelog\n",
        "_Auto-drafted from PR titles; PM edits for tone._\n",
    ]
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(lines), encoding="utf-8")


# ── CLI ─────────────────────────────────────────────────────────────────────


def _run_all(repo_root: Path) -> None:
    scripts = repo_root / "backend" / "scripts"
    reports = repo_root / "reports"
    design = repo_root / "docs" / "design"
    migrations = repo_root / "backend" / "migrations"
    out_dir = repo_root / "docs"

    generate_scripts_reference(scripts, out_dir / "reference" / "scripts.md")
    generate_reports_index(reports, out_dir / "reference" / "reports.md")
    generate_design_index(design, out_dir / "architecture" / "design-index.md")
    generate_migration_index(migrations, out_dir / "architecture" / "migrations.md")


def _journal_stub_path(repo_root: Path, day: date) -> Path:
    return repo_root / "docs" / "journal" / "daily" / f"{day.isoformat()}.md"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate auto docs pages.")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repo root (default: two levels up from this file).",
    )
    parser.add_argument(
        "--journal-day",
        type=str,
        default=None,
        help=(
            "If set, generate ONLY a daily journal stub for the given ISO date "
            "(YYYY-MM-DD) and exit. Intended for the nightly docs-journal "
            "workflow. Skips the index generators."
        ),
    )
    args = parser.parse_args(argv)

    repo_root = args.repo_root or Path(__file__).resolve().parents[2]

    if args.journal_day is not None:
        day = date.fromisoformat(args.journal_day)
        out = _journal_stub_path(repo_root, day)
        if out.exists():
            print(f"{out} already exists — leaving in place so PM edits are preserved.")
            return 0
        generate_daily_journal_stub(day, out)
        print(f"Wrote journal stub at {out}")
        return 0

    _run_all(repo_root)
    print(f"Generated docs under {repo_root / 'docs'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
