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
# PM:    Sonnet — nuanced design reviews, PR comments, issue triage
# Dev:   Sonnet — code generation and test writing
# UX:    Haiku  — formulaic audit work (emoji→SVG, aria-label, touch targets)
# Arch:  Opus   — deep reasoning for design docs and cross-cutting decisions

MODEL_PM="claude-sonnet-4-6"
MODEL_DEV="claude-sonnet-4-6"
MODEL_UIUX="claude-haiku-4-5-20251001"
MODEL_ARCH="claude-opus-4-7"

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

# Overlay CLAUDE.md from origin/main into a worktree so the session starts with
# the latest rules regardless of which branch the worktree is currently on.
sync_claude_md() {
  local wt="$1"
  git -C "$wt" fetch origin main --quiet 2>/dev/null || true
  git -C "$wt" checkout origin/main -- CLAUDE.md 2>/dev/null || true
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
/loop Act as product manager for ${SLUG}. Every cycle: (1) check for new open PRs and recently merged PRs since the last review state saved in product/review-state.md, (2) check for new or updated files in docs/, (3) review anything new — read the diff/doc, comment on open PRs if there are concerns or questions, create GitHub issues for follow-ups after merges, update product/backlog.md with findings. Save the latest reviewed PR number and latest main commit SHA to product/review-state.md after each cycle so the next cycle knows where to pick up. If nothing is new, say so briefly and wait.
PROMPT

  cat > "/tmp/${SLUG}-dev.txt" << PROMPT
You are a Dev session for ${SLUG}. Read CLAUDE.md at ${REPO}/CLAUDE.md and follow the Dev role rules exactly. Read all memory files listed in ${MEMORY_PATH}. Then start immediately: verify your worktree exists (git -C ${REPO} worktree list), pick the highest-priority unclaimed bug or feat issue (no in-progress label), claim it, and work it to completion — regression test first, fix, full test suite, PR with auto-merge enabled. After each PR merges, pick the next issue without waiting for me. If no unclaimed issues exist, enter bug-hunt mode as defined in CLAUDE.md: scan backend/routers/ for missing bounds checks, missing .exists() guards, and unhandled edge cases — file one bug issue, immediately claim and fix it, then repeat.
PROMPT

  cat > "/tmp/${SLUG}-uiux.txt" << PROMPT
You are the UI/UX Dev for ${SLUG}. Read CLAUDE.md at ${REPO}/CLAUDE.md and follow the UI/UX Dev role rules. Read all memory files listed in ${MEMORY_PATH}. Then start immediately: verify your worktree exists (git -C ${REPO} worktree list), pick the highest-priority unclaimed ux or ui issue (no in-progress label), claim it, and work it to completion — test first, implement, PR. After each PR merges, pick the next issue without waiting for me. If no unclaimed ux/ui issues exist, run a UX audit as defined in CLAUDE.md: scan frontend components for emoji icons, missing aria-labels, touch targets under 44px, hardcoded hex colors — file one ux issue, immediately claim and fix it, then repeat.
PROMPT

  cat > "/tmp/${SLUG}-arch.txt" << PROMPT
You are the Architect for ${SLUG}. Read CLAUDE.md at ${REPO}/CLAUDE.md and follow the Architect role rules. Read all memory files listed in ${MEMORY_PATH}. Then start immediately: verify your worktree exists (git -C ${REPO} worktree list), pick the highest-priority unclaimed architecture issue (no in-progress label), claim it, and work it following the appropriate path (design doc PR first for Path B complex features). After each task completes, pick the next without waiting for me. If no architecture issues exist, identify the highest-value unimplemented feature by reviewing docs/FEATURES.md and the open issue list — file a new architecture issue, claim it, and begin a design doc. Do not implement without PM sign-off on the design doc.
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
  tmux break-pane -t "${SESSION}:overview.0" -d -n "pm"
  tmux break-pane -t "${SESSION}:overview.0" -d -n "dev"
  tmux break-pane -t "${SESSION}:overview.0" -d -n "uiux"
  tmux rename-window -t "${SESSION}:overview" "arch"
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
  overview            Collapse roles into a 2×2 overview pane
  restore             Spread overview panes back to separate windows
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
    write_prompts
    ensure_worktree "$REPO_DEV"
    sync_claude_md "$REPO_DEV"
    start_window "dev2" "/tmp/${SLUG}-dev.txt" "$MODEL_DEV" "$REPO_DEV"
    echo "Added dev2 window to session '$SESSION'."
    echo "Switch to it:  tmux select-window -t ${SESSION}:dev2"
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

# Sync CLAUDE.md from origin/main into each worktree so roles see the latest rules
echo "Syncing CLAUDE.md from origin/main to code-role worktrees..."
sync_claude_md "$REPO_DEV"
sync_claude_md "$REPO_UIUX"
sync_claude_md "$REPO_ARCH"

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
