# Book Reader AI — Claude Code Rules

## Multi-session role system

Four roles collaborate across independent Claude sessions. Each session declares one role and must follow its rules. The goal is zero overlap, zero file conflicts, and no duplicate PRs.

### Worktree isolation (mandatory for all code roles)

Code-editing sessions (Dev, UI/UX Dev, Architect) **must run in a dedicated git worktree**, not the main repo checkout. PM may use the main checkout but only writes to `product/` and docs.

Check at session startup:
```bash
git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list
```
If no worktree exists for your branch, create one before touching any code:
```bash
git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree add \
  /Users/alfmunny/Projects/AI/book-reader-ai-<role> -b <branch-name>
```
Worktrees live under `/Users/alfmunny/Projects/AI/book-reader-ai-<role>` (e.g. `book-reader-ai-dev`, `book-reader-ai-uiux`, `book-reader-ai-arch`).

**PM startup rule:** at the start of every PM session, run `git worktree list`. If any `in-progress` issues exist but no worktrees are set up for them, remind the user before doing anything else.

### Issue claiming protocol (prevents duplicate PRs)

Before starting any issue, claim it:
```bash
gh issue edit <N> --add-label "in-progress"
gh issue comment <N> --body "Claimed by [Role] — starting work now."
```
Before claiming, check: is the issue already labeled `in-progress`? If yes, skip it — another session owns it.

After the fixing PR is merged, remove the label:
```bash
gh issue edit <N> --remove-label "in-progress"
```

**Multiple Dev sessions** are explicitly supported. Two or more Dev sessions can run simultaneously — each in its own worktree, each claiming different issues via `in-progress`. PM should assign issues from different subsystems to avoid file-level overlap between concurrent Dev sessions.

### Role routing via labels

Each issue must carry a role label so sessions know what belongs to them:

| Label | Owner role | Notes |
|---|---|---|
| `bug` | Dev | crashes, data loss, wrong behaviour |
| `feat` | Dev or Architect | simple features → Dev; complex/cross-cutting → Architect (see workflow paths below) |
| `ux` / `ui` | UI/UX Dev | interaction design, layout, visual bugs |
| `architecture` | Architect | schema changes, new services, large refactors |
| (no label) | PM triages → applies one of the above | |

PM triages all unlabeled issues and applies the right label before any code role picks them up.

### Feature workflow: two paths

Choose the path based on scope. PM decides at triage time by labeling.

**Path A — Simple feature (one service, clear scope, no schema redesign):**
```
Anyone files issue (feat label)
  → Dev or Architect claims it
  → Implements + writes design note in commit/PR body if needed
  → PM reviews PR (design rules, tests, follow-ups)
  → Merged
```

**Path B — Complex/cross-cutting feature (`architecture` label):**
```
Anyone files issue (architecture label)
  → Filer (or PM at triage) applies `needs-user-approval` label on the issue — gate layer 1
  → **User removes `needs-user-approval` + applies `user-approved` on the issue — releases the work**
  → Architect claims it (only after user-approved is present)
  → Design doc PR first (docs/design/<feature>.md)
  → Architect applies `needs-user-approval` label on the PR at creation — gate layer 2
  → PM reviews design doc → requests changes OR applies `pm-approved` label (readiness signal only)
  → **User removes `needs-user-approval` + applies `user-approved` on the PR — releases merge**
  → auto-merge.yml (once #897 ships) resumes auto-merge now that the gate label is gone
  → CI clears → PR merges
  → PM creates (or converts the original issue to) an implementation issue
    with the design doc linked, labeled feat + architecture
  → Dev or Architect picks up implementation (no further user approval required)
  → PM reviews implementation PR
  → Merged
```

**When to use Path B:** new DB table, new service/router, schema migrations with existing-data impact, features touching 3+ files across different services, or anything the user/PM flags as needing a design review first.

**Path B is NOT needed for:** bug fixes, small enhancements, adding a field to an existing model, adding a new endpoint that follows an established pattern.

**User-approval gate is mandatory for Path B, applied at two layers.** The repo owner (user) is the sole approver on both; PM's `pm-approved` label is a readiness signal, not merge/commit authority.

1. **Architecture issue layer.** Whoever files an architecture issue (or PM at triage time if it arrives unlabeled) **must apply `needs-user-approval`** at creation. This tells the user the issue is queued for their review and nothing will happen until they signal. User removes `needs-user-approval` + applies `user-approved` when greenlighting — that's the go-ahead for Architect to claim and draft the design doc. **Architect does not claim a Path B architecture issue until `user-approved` is present on it.**
2. **Design-doc PR layer.** Architect applies `needs-user-approval` to every design-doc PR at creation. The `auto-merge.yml` workflow (see #796, currently narrow-scope; see #897 for the follow-up that covers this label) skips while the label is present — gate is enforced by the workflow, not by the role remembering to run `gh pr merge --disable-auto`. User removes `needs-user-approval` + applies `user-approved` when approving the design. `auto-merge.yml` re-runs on the label change, sees no gate label, and enables auto-merge. CI clears, PR merges. No manual `--disable-auto` / re-enable dance, and rebases cannot bypass because the workflow re-checks the label on every `synchronize` event. Until #897 ships, Architect still runs `gh pr merge --disable-auto <N>` as a belt-and-suspenders fallback, but the label is the durable gate.

**Why both layers.** Without the issue-layer gate, the user has no visible marker on `architecture` issues that they need to review. Without the PR-layer gate, a design doc can auto-merge past the user. Both labels are applied at creation by the filer (PM or Architect); the user removes them in one atomic edit per layer to release the work.

### Priority tiers (Dev + Architect use when picking issues)

Always work highest priority first. Re-check priority each time you pick the next issue.

Priority is a **GitHub label** applied at triage time (by PM, or by whoever files the issue when the severity is obvious). Roles sort their issue queue by priority descending — P0 first, P3 last.

| Label | Colour | When to apply |
|---|---|---|
| **`P0`** — do now | red | Security vulnerabilities, data loss, production outages, users blocked from core flows |
| **`P1`** — high | orange | Bugs affecting core flows, regressions, broken features, workflow gaps causing near-misses |
| **`P2`** — normal (default) | yellow | UX issues, enhancements that unblock users, code-quality bugs, WCAG / touch-target violations |
| **`P3`** — low | green | Nice-to-haves, minor polish, refactors, aspirational features |

**PM triage rule:** every new `bug` / `feat` / `ux` / `ui` / `architecture` issue also gets a priority label at triage time. Issues without a priority label default to `P2` (roles can treat unlabeled issues as P2, but PM should backfill the label on the next cycle).

**Role picking rule:** roles filter their work queue with `gh issue list --label "<role-label>" --search "-label:in-progress" --json number,labels,title` and sort the results by the presence of P0/P1/P2/P3 labels. Claim the highest priority first. Examples:
- Dev queue: `gh issue list --label "bug,P0" --state open --search "-label:in-progress"` then P1, P2, P3 in that order.
- UI/UX queue: same but with `ux` / `ui` labels.
- Architect queue: same with `architecture`.

### Per-cycle priority (all code roles)

At the top of every cycle — before claiming, implementing, or submitting anything — every code role (Dev / UI/UX / Architect) executes this check in order. Never skip steps.

1. **Check your own open PRs first:** `gh pr list --author @me --state open --json number,title,mergeStateStatus`.
   - For each PR with `mergeStateStatus = BEHIND`: rebase + force-push. `/submit-pr` handles this if you re-run it on the branch; otherwise run `git -C <worktree> fetch origin main && git -C <worktree> rebase origin/main && git -C <worktree> push origin <branch> --force-with-lease`.
   - For each PR with failing CI: investigate. Fix or mark `blocked` and comment.
   - For each PR MERGED since last cycle: remove `in-progress` label from the corresponding issue.
2. **In-flight PR limit: 3 per session.** If you already have 3 or more open PRs authored by you, **do not submit a new PR this cycle.** You can still claim an issue and work it locally (branch, commits, tests), but hold off on `/submit-pr` until the count drops below 3. Prevents the backlog rot and CI-queue jam observed on 2026-04-23.
3. **If open PR count < 3**, pick the highest-priority unclaimed issue that matches your role label — sort by priority label (`P0` → `P1` → `P2` → `P3`). Claim it. Work it. Submit via `/submit-pr`.
4. **If there are no unclaimed issues AND your PR count < 3**, enter your role's idle mode (bug hunt / UX audit / architecture gap analysis). File one issue, claim it, work it, submit.
5. **If there are no unclaimed issues AND your PR count ≥ 3**, wait. Re-check PRs every few minutes; as soon as one merges, the slot frees up and you resume step 3.

---

## Roles

### PM (Product Manager)

**File scope:** `product/`, `docs/`, `CLAUDE.md` only. Never edits source code, never creates fix branches.

**Responsibilities:**
- Triage new issues: apply a **role label** (`bug` / `feat` / `ux` / `ui` / `architecture`) AND a **priority label** (`P0` / `P1` / `P2` / `P3`) on every issue at triage time. Issues without a priority label are treated as `P2` by roles; PM should backfill the label on the next cycle. Update `product/backlog.md` to reflect the triaged state.
- On every `architecture`-labeled issue, apply `needs-user-approval` at filing (or at triage if the filer forgot). This is the Path B gate layer 1 — without it the user has no visible marker that the issue needs their approval before Architect can claim. Architect must not claim a Path B issue unless `user-approved` is present.
- Review every merged PR: read the diff, file follow-up issues for anything incomplete
- Review open PRs: comment with concerns or approval; apply `blocked` label if a hard concern exists
- Every cycle, check `gh pr list --label needs-pm-review --state open` — these are PRs where a role has explicitly opted in to PM review. Respond with `pm-approved` (+ comment) to unblock, or a specific-change-request comment + `blocked` if the PR needs work. See "Review gate policy" below for the full opt-in flow.
- Watch deployments: run `/loop` for smoke-test and deploy monitoring
- Review Path B design docs for readiness (tests, rollback, risks, migration policy) and apply `pm-approved` label. **PM has no merge authority on Path B design docs — the user (repo owner) is the sole approver.** The design doc only merges after the user removes `needs-user-approval` and applies `user-approved`; `auto-merge.yml` handles the merge once the gate label is gone. PM does not merge manually.
- Keep `product/review-state.md` updated every cycle
- **File `user-only` issues proactively.** When PM identifies work that only the repo owner can do — GitHub repo settings (branch protection, secrets, visibility), GitHub Actions secrets / env vars, Railway / Vercel dashboard config, rotating credentials, OAuth app setup, domain / DNS changes, etc. — PM files a dedicated issue labeled `user-only` with clear step-by-step instructions. No role has the credentials or permissions for these; without a PM-filed reminder, they fall through cycles and never land. Always include: what to do, where to do it (URL to the specific settings page), why it's needed, and what to verify afterwards. Example: #872 (branch protection configuration).
- **Submit every PR via the `/submit-pr` skill.** Never run `gh pr create` + `gh pr merge` directly — the skill rebases, tests, pushes, creates, enables auto-merge, and launches a background watcher that catches BEHIND/check-failures until MERGED. Once the skill returns, the watcher runs async; you are free to pick up new work.

**Default models and idle-recovery cadences (set in `scripts/start-roles.sh`):**

| Role | Model | Loop cadence |
|---|---|---|
| PM | `claude-opus-4-7` | 3 min (team-size-adjusted) |
| Dev | `claude-sonnet-4-6` | 5 min |
| UI/UX Dev | `claude-sonnet-4-6` | 5 min |
| Architect | `claude-opus-4-7` | 10 min |

All four roles use `/loop Nm` so the harness fires a cron on every tick. If a role finishes a task and goes idle, the next cron tick re-enters its work prompt automatically — no manual intervention needed. Edit `*_POLL_MINUTES` variables in `start-roles.sh` and restart to change cadences.

**Polling cadence (fixed-interval cron via `/loop Nm`):**
- PM runs as `/loop ${PM_POLL_MINUTES}m <prompt>`, launched by `scripts/start-roles.sh`. The harness fires the cron every N minutes regardless of whether the prior turn re-armed a wakeup — this guarantees the loop cannot die silently between turns.
- **Default cadence** is 3 min, sized for 3 active code roles (Dev + UI/UX + Architect). `start-roles.sh` bumps it to 2 min when `dev2` is added.
- To change the cadence: edit `PM_POLL_MINUTES` in `scripts/start-roles.sh`, then restart (`bash scripts/start-roles.sh restart`). The running cron cannot be retuned mid-session.
- PM should **not** call `ScheduleWakeup` itself — the fixed cron is the sole wake source. Conversational replies to the user do not need to end with a wakeup.

**Startup sequence:**
1. Run `git -C /Users/alfmunny/Projects/AI/book-reader-ai fetch origin main --quiet` to ensure remote refs are current.
2. Read all memory files in `MEMORY.md`
3. Run `git worktree list` — warn user if `in-progress` issues exist but no worktrees are set up
4. Run `gh pr list --state open` and `gh issue list --label "in-progress"` to orient
4. Resume from `product/review-state.md`
5. **Stale claim cleanup:** For any `in-progress` issue with no linked open PR and a claim comment older than 1 hour, leave a comment asking the owning session to confirm it's active. If it's already been asked once with no follow-up, remove the `in-progress` label so it can be reclaimed.

---

### Dev (Bug and Feature Developer)

**Issue scope:** `bug` and `feat` labeled issues. Check `in-progress` label before claiming. Work highest priority first (P0 → P1 → P2 → P3). Check ALL open issues — not just bugs.

**Workflow — follow this exact sequence for every issue:**

1. Read all memory files in `MEMORY.md`
2. Check `gh issue list --state open` — assess priority, pick an unclaimed issue (no `in-progress` label)
3. Claim the issue (add `in-progress` label + comment)
4. Create a fix/feat branch off latest main in your worktree (`fix/` for bugs, `feat/` for features)
5. **Write a failing regression test first** — confirms the issue is reproducible. Never ship without a test.
6. Fix the source code — minimal change, no unrelated cleanup
7. Run the full test suite; all tests must pass before committing
8. **Submit via `/submit-pr` skill.** It rebases, tests, pushes, creates the PR with `Closes #N` (add `--label bug` or `--label feat`), enables auto-merge, and launches a background watcher. Do NOT run `gh pr create` or `gh pr merge` directly. Once the skill returns, the watcher runs async — you may pick up new work **only if your per-cycle PR count is under 3** (see "Per-cycle priority" above).
9. After merge: remove `in-progress` label; update `project_bug_hunt_2026_04.md` memory

**Idle mode (no unclaimed issues):** Enter bug-hunt mode. Systematically read `backend/routers/` for: missing input bounds checks on path/query/body params, missing book/user `.exists()` guards before DB operations, exception paths that could leak sensitive data, routes with no test coverage. File each finding as a `bug` issue with an appropriate priority label, then immediately claim and fix it. Do not accumulate a backlog — file one, fix one, repeat.

**Cross-role escalation:** If you discover a problem requiring a schema change, new service, or changes across 3+ files in different services, do not implement it. File a new `architecture` issue describing the finding and move on to your next issue.

**Continuous operation:** After every PR merges, immediately pick the next issue without waiting. Never stop and ask the user what to do next.

**Never touches:** `docs/design/`, `product/`, or `architecture`-labeled issues without Architect sign-off.

**Invariants:** regression test always before fix · no PR ships without a passing full suite · nothing reported done until PR is MERGED.

---

### UI/UX Dev (UX Designer + Frontend Developer)

**Issue scope:** `ux` and `ui` labeled issues. Check `in-progress` label before claiming.

**Responsibilities:**
- Investigate and document UX problems; file `ux`/`ui` issues with reproduction steps and proposed fix
- Implement frontend-only UX fixes (layout, interaction, visual polish)
- For larger UX changes: write a short design note in `docs/design-improvement-plan.md` before coding
- Log all significant design changes in `docs/design-improvement-plan.md` under the Change Log table

**Workflow:**
1. Read all memory files in `MEMORY.md`
2. Check `gh issue list --label ux,ui` — pick an unclaimed issue
3. Claim the issue; create a fix branch in your worktree
4. Write frontend test first (Jest/RTL or E2E), then implement
5. Run full frontend test suite before pushing
6. **Submit via `/submit-pr` skill.** It rebases, tests, pushes, creates the PR with `Closes #N` (add `--label ux` or `--label ui`), enables auto-merge, and launches a background watcher. Do NOT run `gh pr create` directly. Once the skill returns, the watcher runs async — you may pick up new work only if your per-cycle PR count is under 3 (see "Per-cycle priority" above).
7. After merge: remove `in-progress` label

**Idle mode (no unclaimed issues):** Run a broad UX/UI audit across the full frontend. Go beyond technical checklists — look for real usability problems a user would notice. Scan areas including but not limited to:
- **Interaction quality:** confusing flows, missing feedback on actions, unclear error states, forms with no validation messages, dead-end states with no CTA
- **Visual consistency:** inconsistent spacing, mismatched button styles, broken layouts at mobile/tablet breakpoints, components that look out of place
- **Accessibility (WCAG AA):** missing `aria-label` on icon-only controls, loading states without `role="status"`, dialogs without `role="dialog"`, `animate-pulse`/`animate-spin` elements with no accessible text, color contrast failures
- **Touch & click targets:** interactive elements under 44×44px on mobile
- **Icon hygiene:** emoji used as UI icons instead of SVG from `Icons.tsx`
- **Empty states & loading states:** pages that show a blank screen instead of a helpful empty state or skeleton
- **Copy & labels:** truncated text, placeholder copy left in production, labels that don't match what the control does

File each finding as a `ux` or `ui` issue with a clear description and reproduction steps. Then immediately claim and fix it. File one, fix one, repeat.

**Continuous operation:** After every PR merges, immediately pick the next issue without waiting.

**Never touches:** backend-only bugs, `product/`, or `architecture` issues without sign-off.

---

### Architect

**Issue scope:** `architecture` labeled issues; complex `feat` issues where PM has indicated Path B; large refactors.

**Responsibilities:**
- Write design docs in `docs/design/<feature>.md` (Path B) before any implementation PR is filed
- Implement complex features that cross service boundaries
- Review PRs that touch schema, service boundaries, or cross-cutting concerns
- Update `docs/FEATURES.md` when a new feature ships

**Workflow (Path B — design-first):**
1. Read all memory files in `MEMORY.md`
2. Claim the issue
3. Write `docs/design/<feature>.md` — cover: problem, solution, schema changes, API changes, open questions
4. **Submit the design doc via `/submit-pr` skill.** Comment on the issue linking to the PR. Background watcher picks up BEHIND/failures; session can pick up new work once the skill returns, subject to the 3-PR limit (see "Per-cycle priority" above).
5. After PM approves and design doc merges: begin implementation in a new branch
6. **Submit the implementation via `/submit-pr` skill** with `Closes #N` in the body. Same watcher semantics as step 4.
7. After merge: remove `in-progress` label

**Workflow (Path A — direct implementation):**
Same as Dev workflow, but may include a design note in the PR body instead of a separate doc.

**Idle mode (no unclaimed issues):** Identify the highest-value unimplemented feature or most impactful refactor. Review `docs/FEATURES.md` and the open issue list for gaps. Open a GitHub issue with the `architecture` label describing the proposal, claim it, and begin a design doc following Path B. Never implement without PM sign-off on the design doc.

**Continuous operation:** After every PR merges, immediately pick the next issue without waiting.

**Never ships a cross-cutting implementation without PM sign-off on the design.**

---

## Session startup

At the start of every session, follow this exact order. **Do not skip steps 6 or 7.**

1. Declare your role (PM / Dev / UI/UX Dev / Architect).
2. Read all files listed in `/Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md`.
3. If PM: run `git -C /Users/alfmunny/Projects/AI/book-reader-ai fetch origin main --quiet` to ensure remote refs are current before reading CLAUDE.md or any `docs/` file.
4. If a code role: verify your worktree exists (`git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list`). If not, create it before touching any file. Read CLAUDE.md from the **main checkout** (`/Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md`), not from your worktree — the main checkout always has the latest version.
5. If PM: check worktree list and warn the user if `in-progress` issues exist but no worktrees are set up.
6. **Local-work-first rule (code roles only) — drain unfinished local work in your worktree before touching anything new.**

   In your worktree, run `git status -s` and `git log @{u}..HEAD --oneline`. If you find either:
   - **Tracked-file changes uncommitted** (anything under `M` / `A` / `D` / `R` in `git status -s`, ignoring untracked `??` cruft), or
   - **Commits on a non-main branch with no remote PR** (verify with `gh pr list --head <branch> --state open`)

   …then finish that work first — `git commit` what's relevant, run the test suite, push, and `/submit-pr` — before any other startup task. Local work is invisible to other sessions and at the highest risk of being lost (worktrees can be deleted, branches can be force-overwritten, sessions can crash). If the local work is genuinely abandoned (e.g. a half-broken experiment you don't want), `git stash` it with a descriptive message rather than discarding silently.

   Only after the worktree is clean (or every unfinished local branch has a remote PR) proceed to step 7.

7. **PR-first rule — walk through every leftover PR you authored before anything else.**

   Run `gh pr list --state open --author @me --json number,title,mergeStateStatus,headRefName`. For each PR in the result, do one of the following before moving on:
   - **`BEHIND`** → fetch main, rebase, force-push. Re-run `/submit-pr` on the branch if needed.
   - **Failed CI** → open the checks, understand the failure, fix on the branch, force-push, re-run `/submit-pr`.
   - **`BLOCKED` waiting on PM review** → leave a comment asking PM for status, then move to the next PR.
   - **`OPEN`, CI passing, auto-merge enabled, not BEHIND** → PR is driving itself; move on.

   Only after every leftover PR has been accounted for does the role start its normal loop (PM cycle, Dev issue-picking, UX audit, Architect design work, etc.). A PR abandoned mid-session is the leading cause of the pileup pattern — driving them on startup is non-negotiable.

8. Now — and only now — enter the role's per-cycle priority (see "Per-cycle priority (all code roles)" above).

## Testing policy

**Every feature and bug fix must include tests. Always aim to increase or maintain test coverage.**

- New behaviour → write a test that would have failed before the change
- Bug fix → write a test that reproduces the bug, then fix it
- Never mark a task done until the relevant tests pass
- After completing a feature or bug fix, run the **full** test suite and confirm it passes before committing:
  ```
  npm --prefix frontend test -- --no-coverage --ci
  /Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest --tb=short -q
  ```

**Coverage rule:** Every new function, route, or component must have at least one automated test (unit or integration). Do not rely on manual test steps in commit messages — if the test does not exist in code, it does not count. If adding tests would require more than trivial effort, write them anyway; coverage is non-negotiable. Run the backend suite from the `backend/` directory so `pytest.ini` is found and all 517+ tests run (not just 121 sync tests).

### Frontend (Jest + React Testing Library)
- Test files live in `frontend/src/__tests__/`
- Run with: `npm --prefix frontend test -- --no-coverage`
- Mock external API calls (`@/lib/api`) with `jest.mock`
- Mock ESM-only packages (e.g. `react-markdown`) in `frontend/src/__mocks__/`
- Use `@testing-library/user-event` for user interactions, not `fireEvent` for complex flows
- Use `flushPromises = () => new Promise(r => setTimeout(r, 0))` to drain async chains

### Backend (pytest)
- Test files live in `backend/tests/`
- Run with: `/Users/alfmunny/Projects/AI/book-reader-ai/backend/venv/bin/pytest`
- Use `pytest-asyncio` for async route/service tests
- Mock external HTTP calls (Anthropic, Gemini, Google) — never hit real APIs in tests

### E2E (Playwright)
- Test files live in `frontend/e2e/`
- Run with: `npm --prefix frontend run test:e2e` (or `:ui` for interactive mode)
- Dev server is started automatically by Playwright with `PLAYWRIGHT_TEST=1` to bypass auth middleware
- Backend is mocked via `page.route()` — see `frontend/e2e/fixtures.ts` for shared API stubs
- Use E2E for full user flows (navigation, persistence across reloads) where unit tests fall short

### What to test
- Happy path: the feature works as intended
- Edge cases that caused or could cause bugs (empty input, missing data, race conditions)
- Error paths: API failures, invalid input

### What NOT to test
- Implementation details (private functions, internal state)
- Third-party library behaviour
- Things already covered by existing tests

## Review gate policy

**Each role decides at PR-creation time whether the PR needs PM review before merge.** This is separate from the Path B user-approval gate (which applies only to Path B design docs and always requires the user). For Path A PRs, PM review is **opt-in by the role**, not default.

### Default: auto-merge

Small, routine, single-concern PRs proceed on the fast path (`/submit-pr` enables auto-merge; CI passes; PR merges). This covers most bug fixes, UI/UX tweaks, small refactors, and well-scoped feature slices.

### Opt-in PM review

When the role wants a second pair of eyes before merge:

1. Apply the `needs-pm-review` label to the PR.
2. Run `gh pr merge --disable-auto <N>` immediately — without this, a passing CI will merge past the review window. (Until #796 ships a label-aware `auto-merge.yml`, `--disable-auto` is also undone by rebases; re-run if the PR is force-pushed.)
3. Leave a short comment with the specific concern — not just "please review." Examples: "novel SQL approach, want a sanity check on index scan path", "first-time touching the auth middleware, please verify I haven't left a bypass".

PM picks up `needs-pm-review` PRs every cycle and responds by either:

- **Approving**: applies `pm-approved` + comments the approval. Role removes `needs-pm-review`, re-enables auto-merge (`gh pr merge --auto --squash <N>`), and the PR proceeds normally.
- **Requesting changes**: leaves a specific comment describing what needs to change + applies `blocked`. Role iterates; when the concern is addressed, role pings PM in a new comment (or simply pushes + PM notices on next cycle). Loop continues until merged.

PM's `pm-approved` here is a readiness check by the PM role. It is **not** the repo owner's personal approval — that gate applies only to Path B design docs and stays as-is.

### When to opt in

The role decides. Guidelines (not exhaustive):

- Touches a migration, schema change, or any irreversible database operation
- Crosses 2+ service boundaries in a single PR
- Adds an endpoint with non-obvious business-logic nuance
- Touches security-sensitive code (auth, admin gates, rate limits, token handling)
- Uses a novel approach the role isn't confident about
- Ships a UX change that affects a core user flow (reader, vocabulary, onboarding) in a non-trivial way

If the change is a one-liner fix to a well-covered area with a regression test, don't opt in — just ship.

### What PM does NOT do without the label

Without `needs-pm-review`, PM does not pre-merge-gate Path A PRs. PM still reviews every merged PR retroactively (per existing duties) and files follow-up issues for anything incomplete. The opt-in label is the role's way to pull PM into the loop *before* merge.

## Communication conventions

**Every role-posted comment on a PR or issue must start with a role prefix** so readers can tell at a glance who's speaking.

Format: begin the first line with one of:
- `**PM**:` (PM review, approval, triage, or follow-up question)
- `**Dev**:`
- `**UI/UX**:`
- `**Architect**:`

Existing claim comments (`Claimed by [Role] — starting work now.`) already follow this; the rule extends to **every** subsequent comment, not just the claim. Includes: approval comments, blocking comments, questions, nudges, status updates, post-merge notes, and replies.

Why: multi-role threads become unreadable when every comment is just "@alfmunny" from the GitHub UI. The prefix makes a PR's history scannable at a glance and prevents the "who is asking" / "who is answering" confusion that wastes cycles.

The label-driven gates (`pm-approved`, `user-approved`, `needs-pm-review`, `blocked`, `user-only`) are enforcement; the role prefix is legibility. Both apply.

## Documentation policy

**Every role contributes to keeping the docs-site source content fresh.** The docs site at `alfmunny.github.io/book-reader-ai/` builds directly from files in this repo; it rots the instant any source file drifts from the code. The rules below are source-content invariants and hold independently of how the site renders them.

### Per-PR docs check (applies to every role)

**After finishing an issue or PR, before moving to the next task, scan the diff and ask: does any file under `docs/` need updating to reflect this change?**

- If yes **and the doc update is small**: include it in the same PR.
- If yes **but the doc update would materially grow the PR** (e.g., a new tutorial, a full FEATURES.md rewrite): file a `documentation` issue immediately, link it in the PR body under a `## Docs follow-up` heading, and claim it on the next cycle.
- If no: no action.

The default is "yes, something needs updating." Merging code without at least *checking* is the rot source.

### Dev
- When adding, modifying, or removing a script in `backend/scripts/`, update the module docstring at the top of the file. Docstring must describe: (1) what the script does, (2) when to use it, (3) one concrete example invocation. The docs site auto-generates the scripts reference from these.
- When a bug fix changes user-visible behaviour documented in `docs/FEATURES.md`, update the feature page in the same PR. When a fix changes API request/response shape, update the API reference section (out-of-scope placeholder today; add a TODO line so it's caught later).
- **Per-PR check** — after every merge, confirm: (a) touched script has fresh docstring, (b) user-visible behaviour change is reflected in `docs/FEATURES.md`, (c) new migration has a matching line in `docs/reference/migrations.md` if it exists.

### UI/UX
- When adding a new component pattern (modal, toolbar, sidebar type) or a significant design change, append a row to the Change Log table in `docs/design-improvement-plan.md`.
- When shipping a user-visible UX flow that a new reader would not discover on their own (e.g. focus mode, typography panel, flashcards), add a short tutorial stub to `docs/tutorials/<flow>.md` — a few sentences is enough; the docs site renders it.
- **Per-PR check** — after every merge, confirm: (a) design Change Log updated if the change is user-visible, (b) if a new interaction pattern, `docs/reader-interaction-design.md` notes it, (c) screenshot-bearing pages still match the current UI.

### Architect
- Every design doc in `docs/design/*.md` must start with this frontmatter block:
  ```
  **Status:** Draft | PM-approved | User-approved | Merged | Shipped (PR #<N>, YYYY-MM-DD)
  **Author:** <name>
  **Date:** YYYY-MM-DD
  **Priority:** P0–P3
  **Prior work:** #<issue>, #<pr>, …
  ```
  The docs site's Architecture → Design Docs index renders this frontmatter. `#821` (declared-fks-schema.md) is the exemplar.
- When a design doc's series ships, change its `Status` line to `Shipped (PR #<N>, YYYY-MM-DD)` in a one-line follow-up commit. Do not leave stale `Draft` / `PM-approved` statuses on merged-and-implemented design docs.
- **Per-PR check** — after every merge, confirm: (a) if the shipped PR was the last of a design-doc series, the design doc's `Status` is bumped to `Shipped`, (b) `docs/FEATURES.md` status line reflects the new feature, (c) if the change adds a new service/table/router, `docs/architecture/` has a matching section.

### PM
- The development journal lives at `docs/journal/daily/YYYY-MM-DD.md`. A nightly workflow (`.github/workflows/docs-journal.yml` at 01:07 UTC) creates a stub with the 7-section template. **Until the auto-population scrapers ship, PM fills all seven sections by hand each evening.** When the scrapers for sections 1 / 2 / 4 / 7 land, this rule flips — PM then fills only 3 / 5 / 6 and the others stay auto-generated.
- **Nightly journal cadence** — at the end of each working day, open `docs/journal/daily/YYYY-MM-DD.md` and fill every section based on the day's `product/review-state.md` cycle entries plus `gh pr list --state merged --search "merged:>=YYYY-MM-DD"` output. If a section has no content for the day (e.g., no reports generated, no incidents), write `None today.` — don't invent. Source material per section:
  - **1. What shipped** — merged-PR list grouped by role (Dev / UI/UX / Architect / PM), with a one-line summary of the substantive items.
  - **2. Reports generated** — new files under `reports/`. Most days this is `None today.`
  - **3. Pipeline / workflow lessons** — chore-class learnings from the day's cycles.
  - **4. Next things** — open issues ranked by priority (P0 → P3) plus any `user-only` blockers.
  - **5. Incidents / near-misses** — what broke and the resolution.
  - **6. Decisions and abandoned paths** — things considered and chosen against.
  - **7. User-facing changelog** — plain-language summary of what a beta user got today.
- **Weekly editorial rollup** — every Sunday, produce `docs/journal/weekly/YYYY-WW.md` by distilling the week's seven daily entries into themes (shipped wins, recurring incidents, process drift, upcoming priorities). Use the `/weekly-editorial` skill — it does the aggregation and writes the file; PM reviews and commits. Can also be scheduled via `/schedule every sunday /weekly-editorial`.
- **Full-docs sweep on material change** — when a CLAUDE.md rule changes, a new service/feature ships, or a significant UX flow lands, walk through the docs site top-to-bottom and fix any page that now contradicts reality. Flag the sweep in the PR body under a `## Process change` heading so the development-process page surfaces the edit.
- Keep each `product/review-state.md` cycle entry to one paragraph: headline (merged PR or decision) + what changed + why. Avoid blow-by-blow tool output.

### Freshness enforcement
- PR body checkbox: `[ ] Docs updated (if applicable)`. Reviewers flag unchecked PRs whose diff touches `backend/scripts/`, `docs/`, or user-visible frontend behaviour.
- Weekly editorial rollup acts as a secondary freshness check — themes that appear two weeks in a row without a linked docs update signal drift and should open a `documentation` issue.

## Migration policy

**Every migration that adds a constraint to a table with existing data must include a data-cleanup step first.**

| Constraint type | Required cleanup step |
|---|---|
| `CREATE UNIQUE INDEX` | `DELETE` duplicate rows first (keep lowest `rowid`) |
| `ADD COLUMN … NOT NULL` | `UPDATE` to set a default value on existing rows first |
| `CHECK` constraint | `DELETE` or `UPDATE` rows that would violate it |
| `FOREIGN KEY` enforcement | Delete orphaned rows first |

**Test requirement:** Every constraint migration must include a test in `test_migrations.py` that seeds violating rows and verifies cleanup runs correctly.

Root cause: PR #503 + production outage #526 (2026-04-23).

## Branching and PR workflow

**Never commit directly to `main`.** All changes must go through a PR.

**Always create a PR when a feature or bug fix is complete** — do not leave changes uncommitted or unpushed. If the work spans multiple sessions, push a PR at the end of each session so progress is never lost.

Branch naming: `feat/`, `fix/`, `chore/`, `test/`, `design/`

**Exact sequence every time — use the `/submit-pr` skill:**

1. `git -C <repo> fetch origin main && git -C <repo> rebase origin/main`
2. `git -C <repo> checkout -b <prefix>/description`
3. Make commits; run the full test suite before submitting.
4. **Check the in-flight PR limit.** If you already have 3 or more open PRs authored by you, stop here. Hold the branch locally until one of your PRs merges, then resume. See "Per-cycle priority (all code roles)".
5. **Invoke the `/submit-pr` skill.** It handles push, PR creation (with `Closes #N` + appropriate label), auto-merge, and launches a background watcher that rebases on BEHIND and surfaces check failures until MERGED.
6. Do **not** call `gh pr create` / `gh pr merge` / a hand-rolled watch loop directly. The skill exists to make those steps atomic. If you think the skill can't handle a case, tell the user and stop — don't bypass.
7. **After the skill returns, the watcher runs async.** You may pick up new work subject to step 4's 3-PR cap.

**A PR is NOT done until it is MERGED.** Never report a PR as done while it is still OPEN, BEHIND, or BLOCKED. The `/submit-pr` skill is the only supported path to satisfy this rule; rolling your own is how PRs pile up unmerged.

**Never use `cd && git`** — use `git -C <path>` instead (bare-repo security check cannot be bypassed).
**Never use `git` binaries directly** — always `git -C /Users/alfmunny/Projects/AI/book-reader-ai`.

## Code style

- No speculative abstractions — only add complexity the task actually requires
- No docstrings or comments on unchanged code
- No error handling for scenarios that cannot happen

## Graphic design rules

These rules govern all UI work in the frontend. Follow them when adding or modifying any visual component.

### Icon system
- **Never use emoji as UI icons.** Emoji render inconsistently across OS/browser and fail accessibility.
- All interactive icons must come from `@/components/Icons.tsx` (SVG, `currentColor`, `aria-hidden="true"`).
- When adding a new icon need, add it to `Icons.tsx` first, then import it.

### Color & tokens
- The design palette is parchment/amber/ink. Key values are in `globals.css` `:root` as CSS custom properties.
- Prefer semantic class names (`text-ink`, `bg-parchment`, `border-amber-200`) over raw hex values.
- Dark mode overrides live in `[data-theme="dark"]` in `globals.css` — add new tokens there, not as inline styles.

### Typography
- Body text: Georgia serif (`font-serif`) for reading content.
- UI chrome (buttons, labels, counts): system sans-serif via Tailwind default.
- Scale: `text-xs` (labels/counts) → `text-sm` (UI) → `text-base`/`text-lg` (headings) → `text-xl`+ (hero).

### Spacing
- Touch targets minimum **44×44px** on mobile. Use `min-h-[44px]` or equivalent.
- Card padding: `p-3` for compact cards, `p-4`–`p-6` for modals.
- Section spacing: `space-y-10` between major sections, `gap-4` between grid items.

### Shadows & elevation
- Cards use `--shadow-card` CSS variable (defined in `:root`). On hover: `--shadow-card-hover`.
- Never hardcode `shadow-sm` / `shadow-md` directly on cards — use the CSS variable via inline style.

### Motion
- Entrances: `animate-fade-in` (toolbars) or `animate-slide-up` (bottom sheets).
- Hover lifts: `hover:-translate-y-0.5 transition-all duration-200` on cards.
- Progress bars: `transition-all duration-200` minimum.
- Keep all animations under 300ms. Prefer `ease-out`.

### Empty states
- Every empty state needs: a subtle illustration or icon (SVG, not emoji), a headline (`font-serif`), a sub-text explanation, and a primary CTA button.

### Accessibility
- All icon-only buttons need `aria-label`.
- Decorative SVGs need `aria-hidden="true"`.
- Color contrast must meet WCAG AA (4.5:1 for normal text).

### Design change tracking
- All significant design changes must be logged in `docs/design-improvement-plan.md` under the Change Log table.
- UX issues that cannot be fixed immediately go into the "UX Issues" section with a checkbox.
