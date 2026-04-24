# Development journal

A time-ordered record of how Book Reader AI evolves. Captures the "why we built this the way we did" story that commit history alone doesn't tell.

## How entries are created

- **Nightly** at 01:07 UTC the `docs-journal.yml` workflow runs `python -m backend.scripts.generate_docs --journal-day YYYY-MM-DD` and commits the resulting stub to `main`.
- **Manually** (for backfill) via **Actions → Docs journal → Run workflow** with a specific date.
- The generator is **idempotent** — if today's stub already exists, the workflow logs "leaving in place" and skips the commit. PM edits to hand sections are never clobbered.

## Entry structure

Every daily entry follows the same 7-section template:

1. **What shipped** — merged PRs of the day, grouped by role. *(auto-populated from merged PRs, future tooling)*
2. **Reports generated** — audit outputs, benchmarks, deploy reports landed in-repo that day. *(auto-populated)*
3. **Pipeline / workflow lessons** — chore-class learnings. *(hand-written by PM)*
4. **Next things** — current unclaimed top-priority issues. *(auto-populated)*
5. **Incidents / near-misses** — what went wrong and the lesson. *(hand-written)*
6. **Decisions and abandoned paths** — things we considered and chose *not* to do. *(hand-written)*
7. **User-facing changelog** — 1–2 lines per shipped feature/fix in plain language. *(auto-drafted, hand-edited)*

Sections 1, 2, 4, 7 will become filled automatically as we layer in git-log / issue-list / reports-folder scrapers in follow-ups. Sections 3, 5, 6 are where human writing earns its keep.

## Recent entries

Seeded for validation of the generator; the nightly workflow commits new stubs from 2026-04-25 onward.

- [2026-04-24](daily/2026-04-24.md)
- [2026-04-23](daily/2026-04-23.md)
- [2026-04-22](daily/2026-04-22.md)

## Weekly editorial rollup

Not wired yet — planned as a hand-written Sunday post pulling themes from the week's seven daily entries. Tracked under a future follow-up issue.

## Related

- `product/review-state.md` — PM's rolling cycle-by-cycle state.
- **[Reports](../reference/reports.md)** — the audit outputs and benchmarks as they land.
- The repo's `git log` — authoritative change history.
