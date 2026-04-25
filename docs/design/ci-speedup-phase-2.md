# CI Speedup Phase 2 — Closing the 318s → 180s Gap

**Status:** Merged — design only (PR #990, 2026-04-24); staged implementation per design (slow-test fixes → pytest-xdist → Playwright smoke → deferred sharding)
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2
**Prior work:** #971 (issue), #885 (phase 1, merged), `docs/design/ci-speedup.md`, `reports/ci_baseline_2026_04_24.md`

## Problem

Phase 1 shipped Opt 2 (path-scoping) and Opt 5 (docker cache) and closed out #921 (coverage-skip) `wontfix`. Measured post-merge median across 12 PRs (#919..#963): **318s**. Design target was **≤ 180s**.

Gap: **138s / 76%** over target.

Per-job breakdown on a representative UX-only PR (#963):

| Job | Runtime |
|---|---|
| Backend tests (pytest) | **4m 11s** |
| Frontend E2E (Playwright) | **4m 14s** |
| Frontend tests (Jest) | 2m 13s |
| Docker build | *skipped* ✅ (Opt 2 working) |

Wall-time ceiling = slowest always-running job ≈ 4m 14s. Backend pytest runs on *all* frontend PRs per the user-approved `frontend || backend` gating rule from the #919 review thread (integration safety over speed). That gating is not up for reversal.

## Three options

### Option A — Speed up backend pytest from 4m 11s to ≤ 2m

Profile-backed wins (measured with `pytest --durations=20` on 2026-04-24):

| Test group | Current | Root cause | Fix |
|---|---:|---|---|
| 3× `worker_idles_*` | 10.01s each (30s total) | `asyncio.sleep(10)` waiting for the idle tick | Monkeypatch sleep / inject a fake clock — cut to <0.1s each |
| 4× `test_search_books_*_both_attempts_raises` | ~2.05s each (8.2s total) | HTTP retry exponential backoff runs real-time | Patch `tenacity` backoff to zero in test fixture |
| 1× `test_seed_popular_refuses_concurrent_start` | 1.36s | Sleep-based race window | Shrink window |

Total estimated savings **~35s** on the backend pytest job (4m 11s → ~3m 35s). Paired with pytest-xdist parallel workers (`-n auto`, ~4 cores on GitHub runner) the job could drop further but diminishing returns — the 35s of real-time waits can't be parallelised.

**Sub-option A': pytest-xdist parallel**. Runs N worker processes. `conftest.py` uses `tmp_path` per-test, so no shared-DB contention. Most tests are pure-CPU or async I/O — good parallelisation candidates. Expected: ~2×–3× speedup modulo fixture overhead, so 4m 11s → ~1m 30s – 2m 10s.

Risk: a few tests use `init_db` + module-level state that may have hidden ordering dependencies. Prior attempts would need a flake-sweep. Low risk once landed.

**Estimated median after A + A'**: 318s → **~220s**. Still 40s over target, but closing.

### Option B — Playwright smoke suite on PRs, full suite on main

Current: `npm run test:e2e` runs every E2E spec on every PR (~4m 14s). Most PRs don't touch the full user-journey surface.

Proposal:
1. Tag critical-path specs with `@smoke` (home → open book → read chapter → add annotation → translate).
2. `frontend/playwright.config.ts` adds a `smoke` project that greps `@smoke`.
3. CI `test-e2e` job defaults to `--project=smoke` on pull request events; keeps `--project=full` on `push: main`.

Target smoke-suite runtime: **< 60s**. Full suite still runs on main as the safety net already codified in the weekly `push: main` trigger.

Risk: regressions in non-smoke flows slip past PR review and only surface on `push: main`. Mitigation: weekly full run + smoke list reviewed quarterly to keep coverage current.

**Estimated median after A + A' + B**: 318s → **~150s–170s**. Hits the 180s target.

### Option C — Opt 4 sharding (deferred per phase 1 design)

Split the pytest or E2E suite across 2–4 parallel GitHub runners. Doubles runner-minutes cost. The original design deferred this if Opts 1–3 were enough; with 1 and 3 dropped, it comes back on the table.

Backend pytest shard×2 would take 4m 11s → ~2m 10s at no test-code change cost. But runner-minute cost doubles for every PR. On a small team with modest GH Actions budget this adds up — a quick sanity check with `gh api /repos/.../actions/billing` would tell us headroom.

**Estimated median after A' + C (backend-shard)**: 318s → **~175s**. Also hits the target.

## Recommendation

**Ship A + A' first (low-risk, high-ROI, no cost increase), measure, then only ship B if still above 180s.** Skip C unless both A' and B fall short.

| Stage | Work | Est. median delta |
|---|---|---:|
| 1 | Patch 3× worker-idle waits + gutenberg retry backoff | −35s → ~283s |
| 2 | pytest-xdist `-n auto` on backend job | −60s to −90s → 193s–223s |
| 3 | Re-measure with 10+ post-merge PRs | — |
| 4 | *Only if still > 180s* → Playwright smoke-suite (B) | −20s to −40s → ≤ 180s |
| 5 | *Only if still > 180s after B* → Opt 4 shard (C) | — |

## Schema / data migration

None. All changes are in test code, `conftest.py`, and CI workflow YAML.

## API changes

None.

## Test plan

Per-stage:

**Stage 1 — fix slow tests:**
- Compare `pytest --durations=20` output before and after; the 3 worker-idle tests should drop from ~10s each to <0.1s each.
- Verify no flakes: run the touched tests 50× with `pytest --count=50` (pytest-repeat) — zero flakes.

**Stage 2 — pytest-xdist:**
- Run full suite with `-n auto` — must pass identically to serial run. Zero tolerance for new flakes (pytest-xdist exposes isolation bugs).
- Run 10× to catch ordering-dependency flakes that only show under parallelism.
- Compare CI wall-time before/after. Pin a new baseline in `reports/`.

**Stage 3 — remeasure:**
- Sample 10 code-touching PRs post-merge, compute median with the same methodology as `reports/ci_baseline_2026_04_24.md`. Append a new "Post-Phase-2 Stage 1–2" section.

**Stage 4 (conditional) — Playwright smoke:**
- Hand-audit the smoke list against `docs/FEATURES.md` core flows.
- CI pipeline runs smoke on PR, full on push:main — verify via a deliberate "break a non-smoke flow" PR experiment (revert immediately).

## Open questions

1. **What counts as @smoke?** Draft list: home navigation, book open, read chapter, translate chapter, add annotation, open vocabulary, logout. Review with PM before coding.
2. **pytest-xdist flake sweep budget**: how many retries/iterations before concluding "no flakes"? Proposal: 10 full-suite runs locally pre-PR.
3. **Runner-minutes headroom for sharding**: not blocking for Phase 2 since we're targeting A/A'/B first; only matters if we reach stage 5.
4. **Does #875 paths-filter still fire correctly?** Docs-only PRs should still get ~10s total per phase 1 baseline. Add an assertion test for this.

## Rollout

1. Merge this design doc
2. **Stage 1 PR**: targeted test fixes (3× worker-idle, gutenberg retry backoff). Small, reviewable.
3. **Stage 2 PR**: pytest-xdist adoption + workflow update. Requires CI re-measurement afterward.
4. Append measurement to `reports/ci_baseline_2026_04_24.md` after each stage.
5. Stages 4–5 only if measurement confirms still short of 180s.

## References

- Phase 1 design: `docs/design/ci-speedup.md` (#901)
- Phase 1 baseline + post-measurement: `reports/ci_baseline_2026_04_24.md`
- #919 (Opt 2 implementation with the amended test-backend gating)
- #922 (Opt 5 docker cache)
- #921 (Opt 3 wontfix — coverage needed on PRs)
