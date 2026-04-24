#!/usr/bin/env bash
# start-roles.sh — launch and manage multi-role Claude Code sessions in tmux
#
# Works with any git repo. Defaults to the repo containing this script.
#
# Usage:
#   bash scripts/start-roles.sh [--repo <path>] [subcommand] [--bypass]
#
# Subcommands:
#   (none)              Start all 4 roles in separate tmux windows
#   overview            Collapse roles into a 2×2 overview pane
#   restore             Spread overview panes back to separate windows
#   stop                Gracefully stop the session
#   restart [--bypass]  Stop then start fresh
#   dev2    [--bypass]  Add a second Dev window to a running session
#   --help | -h | help  Show this help
#
# Requires: tmux, claude (Claude Code CLI), gh (GitHub CLI)

set -euo pipefail

# ── Resolve default repo from script location ─────────────────────────────────
# Assumes this file lives at <repo>/scripts/start-roles.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="$(dirname "$SCRIPT_DIR")"

# ── Parse args ────────────────────────────────────────────────────────────────

BYPASS=""
SUBCOMMAND=""
REPO="$DEFAULT_REPO"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bypass)      BYPASS="--dangerously-skip-permissions"; shift ;;
    --help|-h|help) SUBCOMMAND="help"; shift ;;
    --repo)        REPO="$(cd "$2" && pwd)"; shift 2 ;;
    overview|restore|stop|restart|dev2) SUBCOMMAND="$1"; shift ;;
    *) shift ;;
  esac
done

# ── Derive session name and paths from repo ───────────────────────────────────

SLUG="$(basename "$REPO")"
SESSION="$SLUG"
REPO_DEV="${REPO}-dev"
REPO_UIUX="${REPO}-uiux"
REPO_ARCH="${REPO}-arch"

# Claude Code memory path: ~/.claude/projects/<repo-path-/-→->/memory/MEMORY.md
MEMORY_PATH="$HOME/.claude/projects/$(echo "$REPO" | tr '/' '-')/memory/MEMORY.md"

# Base claude command (bypass flag only — model is passed per-role)
CLAUDE_BASE="claude${BYPASS:+ $BYPASS}"

# ── Model assignments per role ─────────────────────────────────────────────────
# PM:    Opus   — sustained multi-cycle review loop, design judgement, triage
# Dev:   Sonnet — code generation and test writing
# UX:    Sonnet — component implementation, SVG extraction, touch target fixes
# Arch:  Opus   — deep reasoning for design docs and cross-cutting decisions

MODEL_PM="claude-opus-4-7"
MODEL_DEV="claude-sonnet-4-6"
MODEL_UIUX="claude-sonnet-4-6"
MODEL_ARCH="claude-opus-4-7"

# ── Polling cadences (fixed-interval cron via /loop Nm) ───────────────────────
# All four roles use /loop so the harness re-fires the prompt on every cron
# tick, even if the prior turn went idle. This prevents any role from silently
# stalling after finishing a task.
#
# PM cadence is team-size-adjusted:
#   1 code role   → 5 min   2 code roles  → 4 min
#   3 code roles  → 3 min   4 code roles  → 2 min  (dev + dev2 + uiux + arch)
#
# Code role cadences are idle-recovery checks — long enough not to interrupt
# active work, short enough to restart a stalled session quickly.

PM_POLL_MINUTES=3
DEV_POLL_MINUTES=5
UIUX_POLL_MINUTES=5
ARCH_POLL_MINUTES=10

# ── Helpers ───────────────────────────────────────────────────────────────────

die()      { echo "ERROR: $*" >&2; exit 1; }
running()  { tmux has-session -t "$SESSION" 2>/dev/null; }

# Create a worktree pointing to origin/main if the directory doesn't exist yet
ensure_worktree() {
  local wt="$1"
  if [ ! -d "$wt" ]; then
    echo "Creating worktree at $wt..."
    git -C "$REPO" fetch origin main --quiet
    git -C "$REPO" worktree add --detach "$wt" origin/main
  fi
}

check_deps() {
  command -v tmux   >/dev/null 2>&1 || die "tmux not found — brew install tmux"
  command -v claude >/dev/null 2>&1 || die "claude CLI not found — install Claude Code"
  command -v gh     >/dev/null 2>&1 || die "gh not found — brew install gh"
  gh auth status    >/dev/null 2>&1 || die "gh not authenticated — run: gh auth login"
}

# Write role prompts to /tmp (namespaced by SLUG so multiple repos can run at once)
write_prompts() {
  cat > "/tmp/${SLUG}-pm.txt" << PROMPT
SESSION STARTUP — before invoking /loop below, perform the full CLAUDE.md §Session startup sequence (all steps) for the PM role. CLAUDE.md is at ${REPO}/CLAUDE.md and is auto-loaded as the project file. Read every memory file listed in ${MEMORY_PATH}. Run: git -C ${REPO} fetch origin main --quiet. Run: git -C ${REPO} worktree list AND gh issue list --label in-progress — warn me if any in-progress issue has no corresponding worktree. Walk through every leftover PR you authored (gh pr list --author @me --state open). Resume from product/review-state.md. Do the stale-claim cleanup (in-progress issues with no linked open PR and a claim comment older than 1 hour: comment to confirm, or remove label if already asked once). Only after all of that is complete, schedule the recurring PM cycle by invoking:

/loop ${PM_POLL_MINUTES}m Act as product manager for ${SLUG}. At the start of every cycle, run: git -C ${REPO} fetch origin main --quiet to keep the remote refs current. Then: (1) check for new open PRs and recently merged PRs since the last review state saved in product/review-state.md, (2) check for new or updated files in docs/, (3) review anything new — read the diff/doc, comment on open PRs if there are concerns or questions, create GitHub issues for follow-ups after merges, update product/backlog.md with findings. Save the latest reviewed PR number and latest main commit SHA to product/review-state.md after each cycle so the next cycle knows where to pick up. If nothing is new, say so briefly and wait.
PROMPT

  cat > "/tmp/${SLUG}-dev.txt" << PROMPT
SESSION STARTUP — before invoking /loop below, perform the full CLAUDE.md §Session startup sequence (all steps) for the Dev role. CLAUDE.md is at ${REPO}/CLAUDE.md and is auto-loaded as the project file. Read every memory file listed in ${MEMORY_PATH}. Verify your worktree exists at ${REPO_DEV} (run: git -C ${REPO} worktree list). LOCAL-WORK-FIRST: in your worktree run \`git status -s\` and \`git log @{u}..HEAD --oneline\` — if there are uncommitted tracked-file changes or commits on a non-main branch with no remote PR, finish that work first (commit, run tests, push, /submit-pr) before anything else. Then walk through every leftover PR you authored (gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName): BEHIND → fetch+rebase+force-push; failing CI → investigate, fix, force-push; BLOCKED waiting on PM → comment and move on; otherwise leave for auto-merge. Only after the worktree is clean AND every leftover PR has been accounted for, schedule the recurring Dev work loop by invoking:

/loop ${DEV_POLL_MINUTES}m You are a Dev session for ${SLUG}. Follow the Dev role rules in CLAUDE.md. Every cycle, follow this order strictly: (1) FIRST check your own open PRs — run: gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName — for each PR: if BEHIND rebase and force-push; if CI failing investigate and fix; if merged remove the in-progress label from its issue. Only after all your open PRs are handled, move to (2): pick the highest-priority unclaimed bug or feat issue (no in-progress label), claim it, and work it to completion — regression test first, fix, full test suite, PR with auto-merge enabled. If no unclaimed issues exist, enter bug-hunt mode: scan backend/routers/ for missing bounds checks, missing .exists() guards, and unhandled edge cases — file one bug issue, immediately claim and fix it, then repeat.
PROMPT

  cat > "/tmp/${SLUG}-uiux.txt" << PROMPT
SESSION STARTUP — before invoking /loop below, perform the full CLAUDE.md §Session startup sequence (all steps) for the UI/UX Dev role. CLAUDE.md is at ${REPO}/CLAUDE.md and is auto-loaded as the project file. Read every memory file listed in ${MEMORY_PATH}. Verify your worktree exists at ${REPO_UIUX} (run: git -C ${REPO} worktree list). LOCAL-WORK-FIRST: in your worktree run \`git status -s\` and \`git log @{u}..HEAD --oneline\` — if there are uncommitted tracked-file changes or commits on a non-main branch with no remote PR, finish that work first (commit, run tests, push, /submit-pr) before anything else. Then walk through every leftover PR you authored (gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName): BEHIND → fetch+rebase+force-push; failing CI → investigate, fix, force-push; BLOCKED waiting on PM → comment and move on; otherwise leave for auto-merge. Only after the worktree is clean AND every leftover PR has been accounted for, schedule the recurring UI/UX work loop by invoking:

/loop ${UIUX_POLL_MINUTES}m You are the UI/UX Dev for ${SLUG}. Follow the UI/UX Dev role rules in CLAUDE.md. Every cycle, follow this order strictly: (1) FIRST check your own open PRs — run: gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName — for each PR: if BEHIND rebase and force-push; if CI failing investigate and fix; if merged remove the in-progress label from its issue. Only after all your open PRs are handled, move to (2): pick the highest-priority unclaimed ux or ui issue (no in-progress label), claim it, and work it to completion — test first, implement, PR. If no unclaimed ux/ui issues exist, run a broad UX/UI audit: look for real usability problems a user would notice — confusing flows, missing feedback, broken layouts, accessibility gaps (missing aria-label, role="status", role="dialog"), touch targets under 44px, empty states without CTAs, inconsistent styling, copy problems — file one ux or ui issue, immediately claim and fix it, then repeat.
PROMPT

  cat > "/tmp/${SLUG}-arch.txt" << PROMPT
SESSION STARTUP — before invoking /loop below, perform the full CLAUDE.md §Session startup sequence (all steps) for the Architect role. CLAUDE.md is at ${REPO}/CLAUDE.md and is auto-loaded as the project file. Read every memory file listed in ${MEMORY_PATH}. Verify your worktree exists at ${REPO_ARCH} (run: git -C ${REPO} worktree list). LOCAL-WORK-FIRST: in your worktree run \`git status -s\` and \`git log @{u}..HEAD --oneline\` — if there are uncommitted tracked-file changes or commits on a non-main branch with no remote PR, finish that work first (commit, run tests, push, /submit-pr) before anything else. Then walk through every leftover PR you authored (gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName): BEHIND → fetch+rebase+force-push; failing CI → investigate, fix, force-push; BLOCKED waiting on PM → comment and move on; otherwise leave for auto-merge. Only after the worktree is clean AND every leftover PR has been accounted for, schedule the recurring Architect work loop by invoking:

/loop ${ARCH_POLL_MINUTES}m You are the Architect for ${SLUG}. Follow the Architect role rules in CLAUDE.md. Every cycle, follow this order strictly: (1) FIRST check your own open PRs — run: gh pr list --author @me --state open --json number,title,mergeStateStatus,headRefName — for each PR: if BEHIND rebase and force-push; if CI failing investigate and fix; if merged remove the in-progress label from its issue. Only after all your open PRs are handled, move to (2): pick the highest-priority unclaimed architecture issue (no in-progress label), claim it, and work it following the appropriate path (design doc PR first for Path B complex features). If no architecture issues exist, identify the highest-value unimplemented feature by reviewing docs/FEATURES.md and the open issue list — file a new architecture issue, claim it, and begin a design doc. Do not implement without PM sign-off on the design doc.
PROMPT
}

# Launch a single-window role
# Usage: start_window <name> <prompt_file> <model> [workdir]
start_window() {
  local name="$1"
  local prompt_file="$2"
  local model="$3"
  local workdir="${4:-$REPO}"
  tmux new-window -t "${SESSION}:" -n "$name"
  tmux send-keys -t "${SESSION}:${name}" \
    "cd '$workdir' && $CLAUDE_BASE --model '$model' \"\$(cat '$prompt_file')\"" Enter
}

# ── stop ──────────────────────────────────────────────────────────────────────

cmd_stop() {
  running || { echo "Session '$SESSION' is not running."; exit 0; }
  echo "Sending Ctrl+C then Ctrl+D to all panes..."
  while IFS= read -r pane_id; do
    tmux send-keys -t "$pane_id" C-c 2>/dev/null || true
  done < <(tmux list-panes -a -t "$SESSION" -F "#{pane_id}" 2>/dev/null)
  sleep 1
  while IFS= read -r pane_id; do
    tmux send-keys -t "$pane_id" C-d 2>/dev/null || true
  done < <(tmux list-panes -a -t "$SESSION" -F "#{pane_id}" 2>/dev/null)
  sleep 2
  if running; then
    echo "Force-killing session..."
    tmux kill-session -t "$SESSION"
  fi
  echo "Session '$SESSION' stopped."
}

# ── overview ──────────────────────────────────────────────────────────────────

cmd_overview() {
  running || die "Session '$SESSION' is not running — start it first."
  if tmux list-windows -t "$SESSION" -F "#{window_name}" 2>/dev/null | grep -q "^overview$"; then
    tmux select-window -t "${SESSION}:overview"
    echo "Switched to existing overview window."
    exit 0
  fi
  echo "Creating overview window..."
  tmux rename-window -t "${SESSION}:pm" "overview"
  for role in dev uiux arch; do
    if tmux list-windows -t "$SESSION" -F "#{window_name}" 2>/dev/null | grep -q "^${role}$"; then
      tmux join-pane -s "${SESSION}:${role}.0" -t "${SESSION}:overview"
    fi
  done
  tmux select-layout -t "${SESSION}:overview" tiled
  tmux set-option -t "${SESSION}" pane-border-status top
  tmux set-option -t "${SESSION}" pane-border-format \
    " #{?#{==:#{pane_index},0},PM,#{?#{==:#{pane_index},1},Dev,#{?#{==:#{pane_index},2},UI/UX,Arch}}} "
  tmux select-pane -t "${SESSION}:overview.0"
  echo "Overview ready — all roles in 2×2 grid."
  echo "  Run: bash scripts/start-roles.sh restore   ← spread back to separate windows"
}

# ── restore ───────────────────────────────────────────────────────────────────

cmd_restore() {
  running || die "Session '$SESSION' is not running."
  if ! tmux list-windows -t "$SESSION" -F "#{window_name}" 2>/dev/null | grep -q "^overview$"; then
    echo "No overview window found — roles are already in separate windows."
    exit 0
  fi
  echo "Restoring roles to separate windows..."
  # Capture all pane IDs up front — breaking panes shifts indices, so we must
  # target by stable pane ID, not by positional index.
  local pane_ids
  mapfile -t pane_ids < <(tmux list-panes -t "${SESSION}:overview" -F "#{pane_id}")
  local names=("pm" "dev" "uiux" "arch")
  for i in "${!pane_ids[@]}"; do
    tmux break-pane -s "${pane_ids[$i]}" -d -n "${names[$i]}" 2>/dev/null || \
      { tmux break-pane -s "${pane_ids[$i]}" -d && \
        tmux rename-window -t "${SESSION}:$(tmux display-message -p -t "${pane_ids[$i]}" '#{window_index}')" "${names[$i]}" 2>/dev/null || true; }
  done
  tmux set-option -t "${SESSION}" pane-border-status off
  tmux select-window -t "${SESSION}:pm"
  echo "Roles restored: pm / dev / uiux / arch"
}

# ── Route subcommands ─────────────────────────────────────────────────────────

case "$SUBCOMMAND" in
  help)
    cat <<EOF
Usage: bash scripts/start-roles.sh [--repo <path>] [subcommand] [--bypass]

Subcommands:
  (none)              Start all 4 roles in separate tmux windows
  overview            Collapse roles into a 2×2 grid (all panes in one window)
  restore             Spread the 2×2 grid back to separate windows
  stop                Gracefully stop the session
  restart [--bypass]  Stop then start fresh
  dev2    [--bypass]  Add a second Dev window to a running session
  --help | -h | help  Show this help

Flags:
  --repo <path>  Repo root (default: parent of this script — $DEFAULT_REPO)
  --bypass       Pass --dangerously-skip-permissions to every claude invocation

Repo:    $REPO
Session: $SESSION

Worktrees:
  PM    $REPO          (main checkout)
  Dev   $REPO_DEV
  UIUX  $REPO_UIUX
  Arch  $REPO_ARCH

Models:
  PM      $MODEL_PM
  Dev     $MODEL_DEV
  UI/UX   $MODEL_UIUX
  Arch    $MODEL_ARCH

Idle-recovery cadences (fixed cron via /loop — re-enters role if stalled):
  PM      ${PM_POLL_MINUTES} min  (bumped to 2 min when dev2 added)
  Dev     ${DEV_POLL_MINUTES} min
  UI/UX   ${UIUX_POLL_MINUTES} min
  Arch    ${ARCH_POLL_MINUTES} min
  Edit *_POLL_MINUTES near the top of this script and restart to change.

Quick reference:
  Attach to session:   tmux attach -t $SESSION
  Switch windows:      Ctrl-b n/p  (next/prev)  or  Ctrl-b w  (visual picker)
  Collapse to grid:    bash scripts/start-roles.sh overview
  Restore to windows:  bash scripts/start-roles.sh restore
  Stop all roles:      bash scripts/start-roles.sh stop
  Restart all roles:   bash scripts/start-roles.sh restart
EOF
    exit 0
    ;;
  stop)
    cmd_stop
    exit 0
    ;;
  restart)
    cmd_stop
    # fall through to full startup below
    ;;
  overview)
    cmd_overview
    exit 0
    ;;
  restore)
    cmd_restore
    exit 0
    ;;
  dev2)
    running || die "Session '$SESSION' not running — start it first."
    # Bump PM cadence: 4 code roles are active, PM should poll every 2 min.
    PM_POLL_MINUTES=2
    write_prompts
    ensure_worktree "$REPO_DEV"
    start_window "dev2" "/tmp/${SLUG}-dev.txt" "$MODEL_DEV" "$REPO_DEV"
    echo "Added dev2 window to session '$SESSION'."
    echo "Switch to it:  tmux select-window -t ${SESSION}:dev2"
    echo ""
    echo "⚠  PM is still running at its original cadence. To pick up the new"
    echo "   ${PM_POLL_MINUTES}-min cron interval, restart PM:"
    echo "     tmux kill-window -t ${SESSION}:pm"
    echo "     tmux new-window -t ${SESSION}: -n pm 'cd ${REPO} && ${CLAUDE_BASE} --model ${MODEL_PM} \"\$(cat /tmp/${SLUG}-pm.txt)\"'"
    echo "   Or simpler: bash scripts/start-roles.sh restart"
    exit 0
    ;;
esac

# ── Full startup ──────────────────────────────────────────────────────────────

check_deps

echo "Repo:    $REPO"
echo "Session: $SESSION"
echo ""
echo "Checking worktrees..."
git -C "$REPO" worktree list

echo ""
echo "Starting tmux session '$SESSION'..."

if running; then
  tmux kill-session -t "$SESSION"
  echo "(killed existing session)"
fi

write_prompts

# Ensure each code role has its own worktree (creates from origin/main if missing)
ensure_worktree "$REPO_DEV"
ensure_worktree "$REPO_UIUX"
ensure_worktree "$REPO_ARCH"

# Four separate windows — PM in main repo, code roles each in their own worktree
tmux new-session -d -s "$SESSION" -n "pm"   -x 220 -y 50
tmux send-keys -t "${SESSION}:pm" \
  "cd '$REPO' && $CLAUDE_BASE --model '$MODEL_PM' \"\$(cat '/tmp/${SLUG}-pm.txt')\"" Enter

start_window "dev"  "/tmp/${SLUG}-dev.txt"  "$MODEL_DEV"  "$REPO_DEV"
start_window "uiux" "/tmp/${SLUG}-uiux.txt" "$MODEL_UIUX" "$REPO_UIUX"
start_window "arch" "/tmp/${SLUG}-arch.txt" "$MODEL_ARCH" "$REPO_ARCH"

tmux select-window -t "${SESSION}:pm"

echo ""
echo "All 4 roles started in session '$SESSION'."
echo ""
echo "  Windows:  pm | dev | uiux | arch"
echo ""
echo "  Models:   pm=$MODEL_PM"
echo "            dev=$MODEL_DEV"
echo "            uiux=$MODEL_UIUX"
echo "            arch=$MODEL_ARCH"
echo ""
echo "  Attach:          tmux attach -t $SESSION"
echo "  Switch windows:  C-a p/n  (or C-a w for visual picker)"
echo "  Overview pane:   bash scripts/start-roles.sh overview"
echo "  Stop:            bash scripts/start-roles.sh stop"
echo "  Restart:         bash scripts/start-roles.sh restart"
echo "  Add Dev2:        bash scripts/start-roles.sh dev2"
