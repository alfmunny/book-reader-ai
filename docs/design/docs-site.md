# Design: GitHub Pages Documentation Site (MkDocs + Material) — Issue #864

**Status:** Draft — awaiting PM review, then user approval
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2 — quality-of-life for contributors and returning users; no user-visible product bug today.
**User-approved label on tracking issue:** yes (#864)

---

## Problem

Our docs live in three disconnected places: `docs/design/*.md`, `docs/FEATURES.md` + scattered top-level files, and the development journal smeared across `product/review-state.md`, `CLAUDE.md`, and commit history. There is **no single entry point**. A new contributor opens the repo and has no obvious path to "what does this do, how is it built, how do I work on it." Issues drift, design docs go unfound, and the multi-role workflow rules are invisible to anyone not reading the root.

This design doc commits us to a concrete information architecture, build pipeline, and freshness policy for a static docs site at `https://alfmunny.github.io/book-reader-ai/`.

## Goals

1. One URL that serves as the canonical entry point to "everything about book-reader-ai."
2. Auto-generated sections stay fresh without anyone touching them (scripts reference, design-doc index, development journal, user-facing changelog).
3. Hand-written sections (incidents, decisions, tutorials) have a dedicated place and a clear ownership / cadence.
4. The `reports/` folder — audit outputs, benchmarks, deploy reports — is surfaced as first-class content rather than hidden.
5. Existing files under `docs/` and `product/` do not need to move; the site reads them in place where possible.

## Non-goals

- **Auto-extracted API reference** from FastAPI routes. Deferred — possible v2. v1 has a hand-written overview page only.
- **Component-level React docs** for the frontend. Out of scope; no Storybook migration.
- **Versioned docs** (v1.0, v1.1 tabs). Single `main` is the source of truth for v1.
- **i18n of the docs themselves**. English only.
- **Polished tutorials for every feature.** We commit to *the scaffolding* for tutorials and migrate / write content incrementally. An empty "Tutorials" section with 2–3 seeded pages is acceptable for the v1 cut.

---

## Information architecture (v1)

Six top-level sections, in this order:

### 1. Overview

- **What is Book Reader AI** — one-page narrative. Derived from `docs/FEATURES.md` header + CLAUDE.md "Project Overview" memory.
- **Key features** — bullet list with screenshots. Pulled from `docs/FEATURES.md`.
- **Quick start** — clone + `docker compose up` + first-book ingest.

### 2. Tutorials (scaffolded; content seeded)

Hand-written. Two stubs shipped in v1, remaining stubs created as placeholders so the nav is complete:

- ✅ **Read your first Gutenberg book** (seed content, ~300 words).
- ✅ **Enable AI translation** (seed content).
- 🔲 Set up the reading queue.
- 🔲 Export to Obsidian.
- 🔲 Add your own EPUB (uploads).

Empty stubs render as "Coming soon" with a link back to the relevant GitHub issue so readers know what's in flight.

### 3. Reference

- **Features** — curated `docs/FEATURES.md` included via `mkdocs-include-markdown-plugin`. Living index, not a copy.
- **Scripts** — **auto-generated** from `backend/scripts/*.py` module docstrings. See "Auto-generation" below. Every script gets: what it does, when to use it, CLI flag list (parsed from `argparse`), at least one example invocation. Today that's `epub_split_audit.py`, `backfill_epubs.py`, `preseed_translations.py`, `translate_book.py`, `seed_books.py`, `seed_translations.py`, `migrate_upload_chapters.py`, `next_untranslated_chapter.py`, `pretranslate.py`.
- **Reports** — **auto-generated** page that enumerates everything in `reports/*.md` with title, date, and one-line summary parsed from the report's H1 + first paragraph. Reports themselves render as individual pages under `Reference → Reports → <filename>`. This gives the existing EPUB audit reports and `pretranslate_benchmark_2229.md` a permanent URL.
- **API overview** — hand-written summary of the FastAPI routers. Linked to Swagger/OpenAPI at `/docs` on the running server. Full auto-extract is v2.

### 4. Architecture

- **Stack** — FastAPI + SQLite + Next.js + Railway + Vercel. Derived from CLAUDE.md + `docs/design/` architecture summaries.
- **Design docs** — auto-generated index of `docs/design/*.md` with: title (H1), status (parsed from the `**Status:**` line these docs use), merge commit link (queried from `gh`), 1-line summary (first paragraph of "Problem" section). See "Auto-generation" below.
- **Database schema** — hand-written high-level ERD (Mermaid). Plus an auto-generated migration index (`backend/migrations/*.sql`, numbered list with commit link).

### 5. Development process

- **Multi-role workflow** — derived from `CLAUDE.md` sections on roles + worktree isolation.
- **Path A vs Path B** — workflow decision tree. Reference to `pm-approved` / `user-approved` label gates.
- **Testing policy** — frontend, backend, E2E. Pulled verbatim from `CLAUDE.md`.
- **Migration policy** — constraint migrations + cache invalidation patterns. Pulled from `CLAUDE.md` + examples from `docs/design/declared-fks-schema.md`.
- **PR workflow** — `/submit-pr` skill, 3-PR cap, auto-merge rules, label taxonomy.
- **Graphic design rules** — icon system, colour tokens, spacing, 44px touch targets. Pulled from `CLAUDE.md`.

Every subsection renders the corresponding slice of `CLAUDE.md` via `include-markdown` anchors, so a rules change only needs to be made in CLAUDE.md.

### 6. Development journal

Per the PM + user discussion captured on the issue, every daily entry follows a 7-section template:

1. **What shipped** (auto)
2. **Reports generated** (auto — links to the Reports page)
3. **Pipeline / workflow lessons** (hand)
4. **Next things** (auto)
5. **Incidents / near-misses** (hand)
6. **Decisions and abandoned paths** (hand)
7. **User-facing changelog** (auto-draft, hand-edited by PM)

Plus a **weekly editorial rollup** (Sundays, hand-written). Auto-derivable sections are filled by the build pipeline. Hand-written sections start as stubs — "PM to fill" — and the site simply renders whatever is present.

---

## MkDocs configuration outline

`mkdocs.yml` at repo root:

```yaml
site_name: Book Reader AI
site_url: https://alfmunny.github.io/book-reader-ai/
repo_url: https://github.com/alfmunny/book-reader-ai
edit_uri: edit/main/docs/
docs_dir: docs/_site          # see "Migration" — a transient build tree
theme:
  name: material
  features:
    - navigation.tabs
    - navigation.sections
    - navigation.top
    - search.suggest
    - content.code.copy
  palette:
    - scheme: default
      primary: amber          # matches app palette
      accent: amber
plugins:
  - search
  - include-markdown          # for CLAUDE.md snippets, FEATURES.md reuse
  - macros                    # for auto-generated pages (see below)
  - git-revision-date-localized
markdown_extensions:
  - admonition
  - pymdownx.details
  - pymdownx.superfences:
      custom_fences:
        - name: mermaid
          class: mermaid
          format: !!python/name:pymdownx.superfences.fence_code_format
  - toc:
      permalink: true
nav:
  - Overview: index.md
  - Tutorials:
      - tutorials/index.md
      - First book: tutorials/first-book.md
      - AI translation: tutorials/ai-translation.md
  - Reference:
      - Features: reference/features.md
      - Scripts: reference/scripts.md
      - Reports: reference/reports.md
      - API overview: reference/api.md
  - Architecture:
      - Stack: architecture/stack.md
      - Design docs: architecture/design-index.md
      - Database schema: architecture/database.md
  - Development:
      - Roles: development/roles.md
      - Path A vs B: development/paths.md
      - Testing: development/testing.md
      - Migrations: development/migrations.md
      - PR workflow: development/pr-workflow.md
      - Graphic design: development/design-rules.md
  - Journal:
      - journal/index.md
      - 'Daily entries': journal/daily/
      - 'Weekly rollups': journal/weekly/
```

Rough dependency list (pinned in a new `requirements-docs.txt` at repo root):

```
mkdocs==1.6.*
mkdocs-material==9.5.*
mkdocs-include-markdown-plugin==6.2.*
mkdocs-macros-plugin==1.0.*
mkdocs-git-revision-date-localized-plugin==1.2.*
```

---

## Auto-generation approach

### Decision: pre-build script, not an MkDocs plugin

Two options considered:

1. **Custom MkDocs plugin** — hooks `on_files` / `on_page_markdown`. Cleaner integration, runs inside the MkDocs build process.
2. **Standalone `scripts/generate_docs.py`** — runs *before* `mkdocs build`, writes its output into the transient `docs/_site/` tree that MkDocs then consumes.

**Choosing option 2** because:
- Generated content (scripts reference, design index, reports index, journal days) is plain Markdown we can also inspect directly.
- The pre-build script is trivially testable with pytest (seed a fake `backend/scripts/` directory, run it, assert files).
- MkDocs plugins carry extra upgrade risk across Material major versions; standalone Python has none.
- CI can call the same pre-build step to validate generation works, independently of `mkdocs build`.

### Generators (one function per section)

The script lives at `backend/scripts/generate_docs.py` and composes these generators. Each is a pure function over the repo tree; none touches the network.

- `generate_scripts_reference(scripts_dir, out_md)` — walks `backend/scripts/*.py`, imports each module for its docstring + argparse parser (via `parser.format_help()`), writes one section per script to `out_md`. Skips `__pycache__`, `__init__.py`, anything whose docstring is empty.
- `generate_reports_index(reports_dir, out_md)` — walks `reports/*.md`, reads H1 + first paragraph for each, produces the index page; MkDocs `nav` picks up per-file pages via a glob in the config (see nav section).
- `generate_design_index(design_dir, out_md)` — walks `docs/design/*.md`, parses H1 and the `**Status:**` line pattern, queries `gh pr list --search "path:<file>" --state merged` for merge commit links, writes the index.
- `generate_migration_index(migrations_dir, out_md)` — walks `backend/migrations/*.sql`, extracts the leading `-- ...` comment block as description.
- `generate_daily_journal_stub(date, out_md)` — creates a dated stub with all 7 sections. Auto-fills sections 1 (merged PRs that day), 2 (reports touched that day), 4 (current open architecture + feat issues), 7 (auto-drafted changelog). Hand sections are stubs with "_PM to fill_".

Each generator is a callable, unit-tested, and composable. `generate_docs.py`'s `main()` calls them in order.

### Caller

Called from two places:

1. **Local preview**: `make docs-serve` runs `python scripts/generate_docs.py --out docs/_site/` then `mkdocs serve`.
2. **CI**: `.github/workflows/docs.yml` runs the same.

Both write into `docs/_site/` which is **gitignored**. The site is always rebuilt from source on every publish; nothing generated lives in the tracked tree.

---

## Freshness policy

Generated pages stay fresh by construction (they're rebuilt every push). Hand-written pages are the risk:

1. **PR-template checkbox** added to `.github/pull_request_template.md`:

   > - [ ] If this PR adds or renames a script, tutorial, or design doc, I've updated the corresponding docs page. Unchecked if not applicable.

   Honor-system; the CI check below is the durable enforcement.

2. **CI check** (follow-up PR — out of scope for this design doc, tracked as a separate issue after design merges): a step in `.github/workflows/docs.yml` that:
   - Runs `scripts/generate_docs.py`.
   - Fails if the diff between the generated output and the tracked output is non-empty. (If we don't track generated output, this degenerates to "the build itself must succeed" — still valid.)
   - Additionally lints for orphaned links: broken internal links or references to `docs/design/<file>.md` that no longer exist.

3. **Journal cadence**: daily auto-stubs are created in-tree by a nightly GitHub Action (separate workflow `docs-journal.yml`). Stubs commit themselves. PM edits the hand sections in the next morning's PR; weekly rollups are a hand-written PR every Sunday. This turns "the journal exists" into a routine, not an afterthought.

Point 3 deserves its own tiny design; it's noted here and deferred to a follow-up issue (`docs: nightly daily-entry stub workflow`).

---

## Migration of existing files

Goal: move nothing that doesn't need to move. The site reads files in place via `include-markdown`.

| File / folder | Fate |
|---|---|
| `docs/design/*.md` | **Stay in place.** Site renders via `include-markdown` into `docs/_site/architecture/design/<basename>.md`. Canonical path remains `docs/design/`. |
| `docs/FEATURES.md` | **Stay in place.** Included into `reference/features.md`. |
| `docs/design-improvement-plan.md`, `docs/reader-interaction-design.md`, `docs/workflow-startup.md`, `docs/design-epub-ingestion.md` | **Stay in place.** Site renders each with a short wrapper under Architecture. |
| `product/review-state.md` | **Stay in place.** Site's journal generator consumes it; it's not rendered raw. |
| `CLAUDE.md` | **Stay in place.** Site's `development/*` pages include specific sections via anchors. |
| `reports/*.md` | **Stay in place.** Site renders each as its own page under `reference/reports/<basename>.md`. |
| `reports/pretranslate_benchmark_2229.md` | Same — gains a permanent URL. |
| `backend/scripts/*.py` | **Stay in place.** Script docstrings feed `reference/scripts.md` (auto). |
| `backend/migrations/*.sql` | **Stay in place.** Leading comment feeds migration index (auto). |

No file is moved by this PR. If a future restructure wants to move anything, that lands in a separate PR with a specific reason, not as collateral from the docs site.

New files created by this PR (design-doc only — implementation lands later):

- `docs/design/docs-site.md` — this doc.

New files created by the **subsequent implementation PR** (for reviewer's reference; not part of this design doc's diff):

- `mkdocs.yml`
- `requirements-docs.txt`
- `Makefile` targets `docs-serve`, `docs-build` (or add to existing Makefile if present)
- `scripts/generate_docs.py` + `backend/tests/test_generate_docs.py`
- `.github/workflows/docs.yml`
- `docs/_site/` — **gitignored**, created by the generator
- A few hand-written starter pages under `docs/` (e.g. `index.md`, `tutorials/*.md`, `development/*.md` wrappers)

---

## Build + deploy workflow

`.github/workflows/docs.yml`:

```yaml
name: Docs site
on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'reports/**'
      - 'backend/scripts/**'
      - 'backend/migrations/**'
      - 'CLAUDE.md'
      - 'mkdocs.yml'
      - 'requirements-docs.txt'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # needed for git-revision-date-localized
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements-docs.txt
      - run: python scripts/generate_docs.py --out docs/_site
      - run: mkdocs build --strict
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site/
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`paths:` scoping keeps the docs workflow from firing on unrelated backend/frontend PRs.

`mkdocs build --strict` turns warnings (broken links, missing nav entries) into build failures. Important — without `--strict` we'd ship broken pages silently.

---

## Rollout plan

Implementation lands across three PRs, not one:

1. **PR A — scaffolding + static content.** `mkdocs.yml`, `requirements-docs.txt`, GitHub Pages workflow, the six hand-written wrapper pages (Overview / Tutorials stubs / Architecture stack / Development-process pages that include-markdown CLAUDE.md sections). Generator skeleton exists but produces empty files. Enables the site URL to start rendering.
2. **PR B — auto-generation.** `scripts/generate_docs.py` fleshed out with all five generators + tests. The Reference/Scripts, Reference/Reports, Architecture/Design-docs, and Architecture/Database pages populate.
3. **PR C — journal workflow.** The nightly daily-entry stub workflow, plus seeded entries for the last 3 days to validate the generator. Separately tracked follow-up.

Approximate sizes: PR A ~15 files, PR B ~5 files + 10 tests, PR C ~3 files + generator tests.

---

## Open questions

1. **Should we track the generated docs/_site/ tree in git?** Tracking it makes the CI drift check trivial but doubles the repo size and creates noisy PRs on every script-docstring edit. **Proposed: no.** Keep it gitignored; CI asserts only "the build succeeds."
2. **Do we use `nav:` auto-inclusion** (MkDocs feature that auto-populates nav from filesystem) **or explicit nav entries?** Explicit is more work to maintain but gives PM full control over order and grouping. **Proposed: explicit nav, with one exception for the `journal/daily/` glob** where we really do want chronological auto-order.
3. **Should the PR-template checkbox be enforced by a CI check or just honour-system?** **Proposed: honour-system for v1, checked manually by PM in review**; file a follow-up issue for a CI check once the site is live and we see whether drift actually happens.
4. **What's the minimum Python version for the docs toolchain?** MkDocs+Material supports 3.8+. Repo runs 3.11 in backend. **Proposed: pin docs build to 3.11** for consistency; no strong reason to diverge.
5. **Custom domain?** `docs.bookreader.ai` or similar would need DNS + CNAME config. **Proposed: defer — ship at `alfmunny.github.io/book-reader-ai/` first, evaluate in v2 once traffic is observable.**

---

## Out of scope

- Tutorial content beyond 2 seed pages (content authoring is a separate ongoing task, not a design-doc deliverable).
- Search analytics, user comments, RSS feed. Nothing is blocked by their absence; easy to add later.
- Migrating reports generation to a structured format. The current `reports/*.md` files are markdown and render fine; a schema-for-reports is a different conversation.
- API reference auto-extraction from FastAPI. Possible v2.
- Versioned docs (multi-release tabs). Single-main suffices today.
