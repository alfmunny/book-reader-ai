# Development journal

A time-ordered record of how Book Reader AI evolves. Captures the "why we built this the way we did" story that commit history alone doesn't tell.

!!! note "Auto-generation coming in PR C"

    Daily entries are **not yet auto-generated**. That lands in PR C of the docs-site rollout (#864), which also introduces the nightly `docs-journal.yml` workflow. Until then, this page is a placeholder for the structure described in the [docs site design doc](../design/docs-site.md).

## Entry template (coming)

Every daily entry will follow this structure:

1. **What shipped** — merged PRs of the day, grouped by role.
2. **Reports generated** — audit outputs, benchmarks, deploy reports landed in-repo that day.
3. **Pipeline / workflow lessons** — chore-class learnings (hand-written).
4. **Next things** — current unclaimed top-priority issues.
5. **Incidents / near-misses** — what went wrong and the lesson (hand-written).
6. **Decisions and abandoned paths** — things we considered and chose *not* to do (hand-written).
7. **User-facing changelog** — 1–2 lines per shipped feature/fix in plain language.

Sections 1, 2, 4, 7 are auto-derivable from git + `gh issue list` + `review-state.md`. Sections 3, 5, 6 are where human writing earns its keep.

## Cadence (coming)

- **Daily entry** — auto-generated each night; PM fills the hand sections in the next morning's cycle.
- **Weekly editorial rollup** — hand-written Sunday post pulling themes from the week's seven daily entries.

---

Until the generator lands, the closest thing to a development journal lives at:

- `product/review-state.md` — PM's rolling cycle-by-cycle state (semi-hand-written).
- **[Reports](../reference/reports.md)** — the audit outputs and benchmarks as they land.
- The repo's `git log` — authoritative change history.
