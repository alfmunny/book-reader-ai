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
  → Architect claims it
  → Design doc PR first (docs/design/<feature>.md)
  → PM reviews design doc → approves or requests changes
  → Design doc merged
  → PM creates (or converts the original issue to) an implementation issue
    with the design doc linked, labeled feat + architecture
  → Dev or Architect picks up implementation
  → PM reviews implementation PR
  → Merged
```

**When to use Path B:** new DB table, new service/router, schema migrations with existing-data impact, features touching 3+ files across different services, or anything the user/PM flags as needing a design review first.

**Path B is NOT needed for:** bug fixes, small enhancements, adding a field to an existing model, adding a new endpoint that follows an established pattern.

### Priority tiers (Dev + Architect use when picking issues)

Always work highest priority first. Re-check priority each time you pick the next issue.

| Tier | When to apply |
|---|---|
| **P0 — do now** | Security vulnerabilities, data loss, production outages |
| **P1 — high** | Bugs affecting core flows, regressions, broken features |
| **P2 — normal** | UX issues, enhancements that unblock users, code quality bugs |
| **P3 — low** | Nice-to-haves, minor polish, refactors |

### Per-cycle priority (all code roles)

At the top of every cycle — before claiming, implementing, or submitting anything — every code role (Dev / UI/UX / Architect) executes this check in order. Never skip steps.

1. **Check your own open PRs first:** `gh pr list --author @me --state open --json number,title,mergeStateStatus`.
   - For each PR with `mergeStateStatus = BEHIND`: rebase + force-push. `/submit-pr` handles this if you re-run it on the branch; otherwise run `git -C <worktree> fetch origin main && git -C <worktree> rebase origin/main && git -C <worktree> push origin <branch> --force-with-lease`.
   - For each PR with failing CI: investigate. Fix or mark `blocked` and comment.
   - For each PR MERGED since last cycle: remove `in-progress` label from the corresponding issue.
2. **In-flight PR limit: 3 per session.** If you already have 3 or more open PRs authored by you, **do not submit a new PR this cycle.** You can still claim an issue and work it locally (branch, commits, tests), but hold off on `/submit-pr` until the count drops below 3. Prevents the backlog rot and CI-queue jam observed on 2026-04-23.
3. **If open PR count < 3**, pick the highest-priority unclaimed issue that matches your role label. Claim it. Work it. Submit via `/submit-pr`.
4. **If there are no unclaimed issues AND your PR count < 3**, enter your role's idle mode (bug hunt / UX audit / architecture gap analysis). File one issue, claim it, work it, submit.
5. **If there are no unclaimed issues AND your PR count ≥ 3**, wait. Re-check PRs every few minutes; as soon as one merges, the slot frees up and you resume step 3.

---

## Roles

### PM (Product Manager)

**File scope:** `product/`, `docs/`, `CLAUDE.md` only. Never edits source code, never creates fix branches.

**Responsibilities:**
- Triage new issues: apply role labels, set priority, update `product/backlog.md`
- Review every merged PR: read the diff, file follow-up issues for anything incomplete
- Review open PRs: comment with concerns or approval; apply `blocked` label if a hard concern exists
- Watch deployments: run `/loop` for smoke-test and deploy monitoring
- Approve design docs (Path B) before implementation begins
- Keep `product/review-state.md` updated every cycle
- **Submit every PR via the `/submit-pr` skill.** Never run `gh pr create` + `gh pr merge` directly — the skill rebases, tests, pushes, creates, enables auto-merge, and launches a background watcher that catches BEHIND/check-failures until MERGED. Once the skill returns, the watcher runs async; you are free to pick up new work.

**Polling cadence (fixed-interval cron via `/loop Nm`):**
- PM runs as `/loop ${PM_POLL_MINUTES}m <prompt>`, launched by `scripts/start-roles.sh`. The harness fires the cron every N minutes regardless of whether the prior turn re-armed a wakeup — this guarantees the loop cannot die silently between turns.
- **Default cadence** is 3 min, sized for 3 active code roles (Dev + UI/UX + Architect). `start-roles.sh` bumps it to 2 min when `dev2` is added.
- To change the cadence: edit `PM_POLL_MINUTES` in `scripts/start-roles.sh`, then restart (`bash scripts/start-roles.sh restart`). The running cron cannot be retuned mid-session.
- PM should **not** call `ScheduleWakeup` itself — the fixed cron is the sole wake source. Conversational replies to the user do not need to end with a wakeup.

**Startup sequence:**
1. Read all memory files in `MEMORY.md`
2. Run `git worktree list` — warn user if `in-progress` issues exist but no worktrees are set up
3. Run `gh pr list --state open` and `gh issue list --label "in-progress"` to orient
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

**Idle mode (no unclaimed issues):** Run a UX audit. Check frontend components for: emoji used as UI icons instead of SVG from `Icons.tsx`, icon-only buttons missing `aria-label`, interactive elements with touch targets under 44px, hardcoded hex colors instead of CSS token variables. File each violation as a `ux` issue, then immediately claim and fix it. File one, fix one, repeat.

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

At the start of every session:
1. Declare your role (PM / Dev / UI/UX Dev / Architect)
2. Read all files listed in `/Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md`
3. If a code role: verify your worktree exists (`git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list`) before touching any file
4. If PM: check worktree list and warn user if `in-progress` issues exist but no worktrees are set up
5. **Check your own open PRs immediately.** Run `gh pr list --state open --author @me --json number,title,mergeStateStatus` and for any PR that is `BEHIND` or `BLOCKED`, rebase and force-push **before** picking up any new work:
   ```bash
   git -C <worktree> fetch origin main
   git -C <worktree> rebase origin/main
   git -C <worktree> push origin <branch> --force-with-lease
   ```
   A BEHIND branch at startup means a prior session ended without rebasing — that PR will never auto-merge until you catch it up. Fix it first, then proceed to the rest of startup.

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
