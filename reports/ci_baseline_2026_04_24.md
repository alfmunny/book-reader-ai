# CI Baseline — 2026-04-24

**Author:** Architect
**Purpose:** Establish pre-optimization baseline for issue #885 (CI speedup). The design doc (`docs/design/ci-speedup.md`, merged #901) calls for this as a prerequisite to Opt 2 landing so post-change deltas are meaningful.

---

## TL;DR

Median CI wall time for a typical code-touching PR is **~5 minutes (311 s)**. Docs / chore PRs that correctly skip the code jobs finish in **~10 seconds**. P95 is **~7 minutes (433 s)**.

The design-doc success criterion of **≤ 3 min median for code PRs** requires roughly a **40 % reduction**. Opts 2 (path-scoping) and 5 (docker cache) alone should clear this; Opt 4 (sharding) is deferred unless it doesn't.

## Methodology

All data from the last 30 CI runs on this repo, fetched:

```bash
gh run list --workflow=ci.yml --limit 30 --json databaseId,displayTitle,conclusion,createdAt,updatedAt
```

Run durations are computed as `updatedAt − createdAt` (workflow wall time, end-to-end including queue wait). Successful runs only (n = 22 overall; 18 code-touching + 4 docs/chore).

## Results

### Workflow-level durations (seconds)

| Cohort | n  | median | p95 | min | max |
|---|---:|---:|---:|---:|---:|
| **Code-touching PRs** (heavy jobs ran)      | 18 |   **311** |   433 |   266 |   429 |
| **Docs / chore PRs** (paths-filter skipped) |  4 |   **10**  |    — |     8 |    12 |

### Per-job durations (single representative run)

From run `24884885604` (feat: wire `_split_dramatic_speakers` …). The GitHub Actions API reports all parallel jobs as ending at the same instant as the workflow itself, so the values below are best read as "job ran alongside the others for ~5 minutes total wall time" rather than an isolated runtime per job.

| Job | Start (Z) | End (Z) | Approx runtime |
|---|---|---|---:|
| Detect code changes           | 10:29:27 | 10:34:33 | ≤ 5m (blocked by slowest child) |
| Frontend tests (Jest)         | 10:29:37 | 10:34:33 | ≤ 5m |
| Frontend E2E (Playwright)     | 10:29:35 | 10:34:33 | ≤ 5m |
| Backend tests (pytest)        | 10:29:35 | 10:34:33 | ≤ 5m |
| Verify Docker build           | 10:29:35 | 10:34:33 | ≤ 5m |
| Post coverage comment         | 10:34:33 | 10:34:33 | ~0 s |

Per-step (sub-job) timings are available via `gh api /repos/<owner>/<repo>/actions/runs/<id>/jobs` if finer granularity is needed for Opt 3 (skip-coverage) or Opt 4 (sharding) validation. Not pulled here because the aggregate story is already clear.

## Interpretation

- **Paths-filter works.** The 10-second cohort confirms `#875` (paths-filter fix) is live — docs-only PRs skip the heavy matrix.
- **Code PRs spend ~5 minutes on four parallel heavy jobs.** All four tend to end at roughly the same instant because the workflow blocks on the slowest. Any optimization that reduces the slowest job cuts the whole run.
- **Variance is tight** (p95/median ≈ 1.4). Runs don't thrash — optimizations should show up as a clean shift of the median.

## Success criteria from `docs/design/ci-speedup.md`

- [ ] Median code-PR run ≤ **180 s** (from 311 s today, ≈ 42 % reduction).
- [ ] Docs-/workflow-only runs < **60 s** (from 10 s today — already cleared, just don't regress).
- [ ] `push: main` continues to run the full matrix with coverage.
- [ ] Flake rate unchanged (tracked over 2 weeks post-merge).

## Post-optimization measurement

Re-run the same `gh run list` query after each opt lands on main, appending a row to this report. If median drops below 180 s after Opts 1+2+3+5, Opt 4 (sharding) is deferred per the design.

## Artifacts

- Raw run list: `/tmp/ci_jobs.csv` (per-job timings from 10 representative runs).
- Companion design doc: `docs/design/ci-speedup.md` (#901).
- Tracking issue: #885.
