# Design: Accelerate CI pipeline — Issue #885

**Status:** Shipped — Phase 1 (PRs #914 baseline, #919 path-scoping, #922 docker cache, #973 measurement, 2026-04-24); Phase 2 design follow-up: see `ci-speedup-phase-2.md` (PR #990)
**Author:** Architect
**Date:** 2026-04-24
**Priority:** P2 — engineering-time drag, not user-visible. Pipeline is functional.
**Requires `user-approved` label** per Path B workflow (new `.github/workflows/ci.yml` structure + matrix jobs).

---

## Problem

Every PR sits in `BLOCKED` for 5–8 minutes while four heavy CI jobs run: Frontend Jest (+ `next build`), Frontend E2E (Playwright), Backend pytest, Verify Docker build. A workflow-/docs-only PR like #862 incurs the full cost even though it touches nothing executable (see #875). Current throughput is ~1–2 PR-per-cycle per session, so roughly **20 CI-minutes of wall clock per productive cycle** is the bottleneck.

This doc commits us to five ordered optimizations, the order, measurement methodology, and per-optimization rollback.

## Goals

1. **Cut median PR CI wall time from ~7 min to ≤3 min** for typical PRs touching only one side of the stack (frontend *or* backend).
2. **Cut docs-/workflow-only PR CI wall time to <1 min** by exiting before heavy jobs run.
3. **Do not weaken pre-merge coverage on `main`.** Every test that runs today keeps running on `push: main`, plus a nightly full-coverage job.
4. **Every optimization is independently revertable.** One PR per optimization; revert = revert that PR's commit.

## Non-goals

- Replacing GitHub Actions with a different CI. Out of scope.
- Moving heavy tests off PR path (e.g. nightly-only E2E). Explicitly retained as a PR gate — we've had regressions it caught.
- Introducing a new test framework. Existing Jest + pytest + Playwright stay.
- Addressing the workflow file itself beyond the optimizations listed. Unrelated hygiene lives in separate PRs.

---

## Baseline measurement (prerequisite to landing changes)

Before merging any optimization, we measure "today" so post-change deltas are meaningful.

**Methodology.** For the last 10 merged PRs that touched code, pull each run's timing via:

```bash
gh run list --workflow=ci.yml --status=success --limit 30 \
    --json databaseId,displayTitle,createdAt,updatedAt \
    --jq '[.[] | {id, title: .displayTitle, duration_sec: (((.updatedAt | fromdate) - (.createdAt | fromdate)))}][0:10]'

for id in $ids; do
    gh run view $id --json jobs \
        --jq '[.jobs[] | {name, duration: (((.completedAt | fromdate) - (.startedAt | fromdate)))}]'
done
```

Record in `reports/ci_baseline_2026_04_24.md`:

| Job | Median wall time | p95 wall time | Frequency |
|---|---|---|---|
| `changes` (paths-filter) | _(to measure)_ | _(to measure)_ | 100% |
| `test-frontend` (Jest + build) | _(to measure)_ | _(to measure)_ | 100% when code=true |
| `test-e2e` (Playwright) | _(to measure)_ | _(to measure)_ | 100% when code=true |
| `test-backend` (pytest) | _(to measure)_ | _(to measure)_ | 100% when code=true |
| `verify-docker` | _(to measure)_ | _(to measure)_ | 100% when code=true |

Baseline lands as a separate `chore: measure CI baseline` commit before PR 1 of the optimization series. Without it, we're guessing.

---

## Five optimizations, in implementation order

Order is chosen for **decreasing correlation risk** — each step's success is measurable before the next step lands, and no later step depends on earlier steps executing.

### Opt 1 — Land #875 (paths-filter fix)

**Already filed; not this design doc's scope.** Noted here because **every other step is measured against the paths-filter working correctly**. If #875 lands after Opt 2, the path-scoped gates we add in Opt 2 can produce false negatives on shared-contract changes.

**Dependency:** #875 must merge first.

### Opt 2 — Path-scoped CI splits

Split the current single `code` output into three:

```yaml
# .github/workflows/ci.yml
changes:
  steps:
    - uses: dorny/paths-filter@v3
      id: filter
      with:
        filters: |
          frontend:
            - 'frontend/**'
            - '.github/workflows/ci.yml'
          backend:
            - 'backend/**'
            - '.github/workflows/ci.yml'
          docker:
            - 'backend/Dockerfile'
            - 'docker-compose.yml'
            - 'backend/requirements.txt'
            - 'backend/pyproject.toml'
  outputs:
    frontend: ${{ steps.filter.outputs.frontend }}
    backend:  ${{ steps.filter.outputs.backend }}
    docker:   ${{ steps.filter.outputs.docker }}
```

Then gate jobs:

```yaml
test-frontend: { if: needs.changes.outputs.frontend == 'true' }
test-e2e:      { if: needs.changes.outputs.frontend == 'true' }
test-backend:  { if: needs.changes.outputs.backend  == 'true' }
verify-docker: { if: needs.changes.outputs.docker == 'true' || needs.changes.outputs.backend == 'true' }
```

**Always-run exception**: keep a minimal job (lint + schema-guard) that runs on *any* code change, so shared-contract tests (OpenAPI drift, env.example drift) still fire regardless of path. Candidate: `scripts/check_api_contract.py` (doesn't exist yet — tracked as a follow-up to this opt).

**Expected saving**: ~50% of PRs today touch only one side. Median PR drops from ~7 min to ~3 min on those cycles.

**Risks**:
- A frontend-only change that breaks the backend type-checker (OpenAPI generation, if we add it). Mitigated by `push: main` always running the full matrix.
- Workflow changes themselves — `ci.yml` edits correctly trigger all filters because both `frontend` and `backend` list `.github/workflows/ci.yml`.

**Verification PR-level**: open a test PR touching only `docs/FEATURES.md` — confirm `changes` is the only job that runs, all four heavy jobs skip. Open a test PR touching only `frontend/src/app/page.tsx` — confirm backend + docker are skipped; frontend jobs run. Open a backend-only PR — confirm frontend jobs skip.

**Rollback**: revert the PR that changed the `filters:` block. `paths-filter` step is idempotent.

### Opt 3 — Skip coverage on PRs (fresh on `main` + weekly)

Current Jest command:

```bash
npm test -- --coverage --ci --reporters=default --reporters=jest-junit
```

Coverage instrumentation ~2x's Jest wall time. On PRs, run `--no-coverage`. On `push: main`, keep `--coverage`. Additionally, add a `scheduled` workflow that runs the full-coverage matrix nightly.

```yaml
- name: Run Jest
  run: npm test -- --ci ${{ github.event_name == 'push' && '--coverage' || '--no-coverage' }} \
    --reporters=default --reporters=jest-junit
```

Backend pytest: today it runs `pytest --tb=short --junitxml=pytest-results.xml` without `--cov`. Already fast on this axis — **no change needed** for backend in Opt 3. Noted for completeness.

**Expected saving**: 30–60 s per PR on the Jest job.

**Risks**: coverage regressions slip through. Mitigation: nightly full-coverage job + upload summary artifact; CI-gate can be added later if drops become a problem.

**Verification**: open a test PR touching `frontend/src/lib/api.ts` — confirm Jest runs without coverage flag. Merge; confirm the next push-to-main run does include coverage.

**Rollback**: revert the job change.

### Opt 4 — Parallel test sharding (Jest + pytest)

**Jest**:

```yaml
strategy:
  matrix:
    shard: [1/3, 2/3, 3/3]
steps:
  - run: npm test -- --ci --no-coverage --shard=${{ matrix.shard }} \
        --reporters=default --reporters=jest-junit
```

**pytest**: add `pytest-xdist` to `requirements.txt` + run with `-n auto` (auto-distributes by CPU count).

**Prerequisite audit** (lands as a *separate commit* on the opt PR):

- Jest: grep for tests that rely on shared module-level state — `jest.mock` that carries state across `it` blocks, shared `beforeAll` without teardown. Fix any found.
- pytest: audit `backend/tests/` for fixtures without `@pytest.fixture(scope="function")` that mutate globals (DB, env, time). Our `tmp_db` is per-test-function already — risk is modules that set module-level state on import (seen in some scripts tests). Fix or `@pytest.mark.serial`.

Without this audit, sharding breaks flaky — we've seen this in #738's era.

**Expected saving**: 40–60% on the test portion of Jest + pytest jobs.

**Risks**: flakiness. Mitigated by the audit commit + keeping `push: main` on the same config so an unsharded regression-check path remains.

**Verification**: open a test PR; confirm the 3 Jest shards and xdist pytest complete ≤ single-shard wall time.

**Rollback**: remove the `strategy.matrix` block and `-n auto` flag.

### Opt 5 — Docker build-layer caching

Migrate `verify-docker` from `docker build` to `docker/build-push-action@v6` with GitHub Actions cache:

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v6
  with:
    context: backend
    push: false
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

**Expected saving**: 1–2 minutes on PRs where base deps are unchanged (the common case). Dockerfile changes invalidate the relevant layer; Python / Node dep changes invalidate those layers specifically.

**Risks**: low. Occasional cache invalidation is already the norm on CI systems. The cache eviction policy is GitHub-managed and doesn't need tuning.

**Verification**: open a test PR that doesn't touch `backend/Dockerfile` or `requirements.txt` — confirm `verify-docker` uses cache (look for `CACHED` in the build log).

**Rollback**: revert the job change.

---

## Sequencing + stacking

| Opt | Depends on | Can stack with |
|---|---|---|
| 1 (#875) | — | — |
| 2 (path-scoped) | Opt 1 merged | Opt 3, 5 |
| 3 (no coverage) | — (independent) | Opt 2, 4, 5 |
| 4 (sharding) | Prerequisite audit commit | Opt 2, 3, 5 |
| 5 (docker cache) | — (independent) | All |

**Recommended land order**: 1 → 2 → 3 → 5 → 4. Rationale:

- Opt 1 is zero-risk correctness.
- Opt 2 is the biggest PR-time win with simple verification.
- Opt 3 stacks cleanly and is trivially revertable.
- Opt 5 is low risk and independent of the rest.
- Opt 4 is last because the audit commit is non-trivial and we want to measure the cumulative win from 1–3+5 before committing to sharding. If the combined baseline is already ≤3 min median PR, Opt 4 may not be worth the complexity.

Each optimization is a **separate PR** referencing this design doc. Follow-up issues filed post-merge per the Path B rule.

---

## Rollback plan (series-wide)

Each optimization is revertable independently (one commit each, one `.github/workflows/ci.yml` diff each). If a single opt causes unexpected CI instability:

1. `git revert <opt-commit>` on a new branch, fast-track through CI.
2. File a follow-up issue to investigate; leave the other optimizations in place.

No data consequences in any opt — everything is CI-config only. No cache-invalidation steps are needed when reverting (GitHub's GHA cache eviction handles itself).

---

## Test plan / success criteria

- [ ] Baseline measurement committed to `reports/ci_baseline_2026_04_24.md` before Opt 2 merges.
- [ ] **Median PR CI wall time ≤ 3 minutes** after Opts 1+2+3+5 merge (measured on the 10 PRs that follow).
- [ ] **Docs-/workflow-only PR wall time < 1 minute** after Opt 2 merges.
- [ ] No regression in test reliability (flake rate — tracked via GitHub's re-run stats over 2 weeks post-merge).
- [ ] `push: main` still runs the full matrix with coverage.

If the ≤3 min target is not met after Opt 2+3+5, Opt 4 is revisited. If it *is* met, Opt 4 is filed as "deferred" and only picked up if we observe fresh slowdowns.

---

## Open questions

1. **Do we add a nightly coverage workflow now, or defer?** Proposed: **add now**, as part of Opt 3. Otherwise we lose visibility into coverage drift during the period between "PR ran without coverage" and "next main merge ran with coverage."
2. **Should Opt 4 (sharding) land at all?** Proposed: decide after Opts 1+2+3+5 merge. If we're at ≤3 min median, sharding's marginal win isn't worth the fixture-audit risk. Close this issue with Opt 4 deferred.
3. **Always-run `contract-check` job — build it, or wait until we observe false-negative drift?** Proposed: wait. File as a follow-up issue if a path-scoped false-negative bites us in the first 2 weeks.
4. **Playwright sharding in Opt 4 too?** Proposed: no. Playwright has its own sharding story (`--shard`), but our E2E suite is small (<10 tests today) — the per-shard spin-up of browsers is net-slower below ~30 E2E tests.
5. **Cache-from `gha` vs `registry` (Docker)?** Proposed: `gha` — already built into GitHub Actions, no registry config to maintain. Revisit if cache eviction becomes a problem.

---

## References

- Tracking issue: #885 (`P2`, needs `user-approved`)
- Dependency: #875 (paths-filter fix — prerequisite for Opt 2)
- Sibling: #796 (auto-merge.yml label guard — unrelated but often edited in same CI config hygiene)
- Prior CI work: #738 (paths-filter introduction)

Closes #885 once this design doc merges. Implementation lands across Opts 2+3+4+5 as separate PRs, each referencing this doc.
