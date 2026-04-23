#!/usr/bin/env bash
# start-roles.sh — launch all book-reader-ai roles in a single tmux session
#
# Usage:
#   bash scripts/start-roles.sh          # start all 4 roles
#   bash scripts/start-roles.sh dev2     # add a second Dev window to an existing session
#
# Requires: tmux, claude (Claude Code CLI), gh (GitHub CLI)

set -euo pipefail

REPO="/Users/alfmunny/Projects/AI/book-reader-ai"
SESSION="book-ai"
MEMORY_DIR="/Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md"

# ── helpers ──────────────────────────────────────────────────────────────────

die() { echo "ERROR: $*" >&2; exit 1; }

check_deps() {
  command -v tmux  >/dev/null 2>&1 || die "tmux not found — brew install tmux"
  command -v claude >/dev/null 2>&1 || die "claude CLI not found — install Claude Code"
  command -v gh    >/dev/null 2>&1 || die "gh not found — brew install gh"
  gh auth status   >/dev/null 2>&1 || die "gh not authenticated — run: gh auth login"
}

# Write prompt files to /tmp so tmux send-keys avoids quoting issues
write_prompts() {
  cat > /tmp/book-ai-pm.txt << 'PROMPT'
/loop Act as product manager for book-reader-ai. Every cycle: (1) check for new open PRs and recently merged PRs since the last review state saved in product/review-state.md, (2) check for new or updated files in docs/, (3) review anything new — read the diff/doc, comment on open PRs if there are concerns or questions, create GitHub issues for follow-ups after merges, update product/backlog.md with findings. Save the latest reviewed PR number and latest main commit SHA to product/review-state.md after each cycle so the next cycle knows where to pick up. If nothing is new, say so briefly and wait.
PROMPT

  cat > /tmp/book-ai-dev.txt << 'PROMPT'
You are a Dev session for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the Dev role rules exactly. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists (git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list), pick the highest-priority unclaimed bug or feat issue (no in-progress label), claim it, and work it to completion — regression test first, fix, full test suite, PR with auto-merge enabled. After each PR merges, pick the next issue without waiting for me. If no unclaimed issues exist, enter bug-hunt mode as defined in CLAUDE.md: scan backend/routers/ for missing bounds checks, missing .exists() guards, and unhandled edge cases — file one bug issue, immediately claim and fix it, then repeat.
PROMPT

  cat > /tmp/book-ai-uiux.txt << 'PROMPT'
You are the UI/UX Dev for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the UI/UX Dev role rules. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists (git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list), pick the highest-priority unclaimed ux or ui issue (no in-progress label), claim it, and work it to completion — test first, implement, PR. After each PR merges, pick the next issue without waiting for me. If no unclaimed ux/ui issues exist, run a UX audit as defined in CLAUDE.md: scan frontend components for emoji icons, missing aria-labels, touch targets under 44px, hardcoded hex colors — file one ux issue, immediately claim and fix it, then repeat.
PROMPT

  cat > /tmp/book-ai-arch.txt << 'PROMPT'
You are the Architect for book-reader-ai. Read CLAUDE.md at /Users/alfmunny/Projects/AI/book-reader-ai/CLAUDE.md and follow the Architect role rules. Read all memory files listed in /Users/alfmunny/.claude/projects/-Users-alfmunny-Projects-AI/memory/MEMORY.md. Then start immediately: verify your worktree exists (git -C /Users/alfmunny/Projects/AI/book-reader-ai worktree list), pick the highest-priority unclaimed architecture issue (no in-progress label), claim it, and work it following the appropriate path (design doc PR first for Path B complex features). After each task completes, pick the next without waiting for me. If no architecture issues exist, identify the highest-value unimplemented feature by reviewing docs/FEATURES.md and the open issue list — file a new architecture issue, claim it, and begin a design doc. Do not implement without PM sign-off on the design doc.
PROMPT
}

# Launch a named window and start claude with the given prompt file
start_window() {
  local window="$1"
  local prompt_file="$2"
  tmux new-window -t "${SESSION}:" -n "$window"
  # Use a wrapper so the prompt file is read at launch time, not at script write time
  tmux send-keys -t "${SESSION}:${window}" \
    "cd '$REPO' && claude \"\$(cat '$prompt_file')\"" Enter
}

# ── add-dev2 mode ─────────────────────────────────────────────────────────────

if [[ "${1:-}" == "dev2" ]]; then
  tmux has-session -t "$SESSION" 2>/dev/null || die "Session '$SESSION' not running — start it first without arguments"
  write_prompts
  start_window "dev2" "/tmp/book-ai-dev.txt"
  echo "Added dev2 window to session '$SESSION'"
  echo "Switch to it: tmux select-window -t ${SESSION}:dev2"
  exit 0
fi

# ── full startup ──────────────────────────────────────────────────────────────

check_deps

# Warn about missing worktrees (roles create their own branches, but base dirs help)
echo "Checking worktrees..."
git -C "$REPO" worktree list

echo ""
echo "Starting tmux session '$SESSION'..."

# Kill stale session if it exists
tmux kill-session -t "$SESSION" 2>/dev/null && echo "(killed existing session)"

write_prompts

# Create session — first window is PM
tmux new-session -d -s "$SESSION" -n "pm" -x 220 -y 50
tmux send-keys -t "${SESSION}:pm" \
  "cd '$REPO' && claude \"\$(cat /tmp/book-ai-pm.txt)\"" Enter

# Add remaining role windows
start_window "dev"  "/tmp/book-ai-dev.txt"
start_window "uiux" "/tmp/book-ai-uiux.txt"
start_window "arch" "/tmp/book-ai-arch.txt"

# Focus PM window
tmux select-window -t "${SESSION}:pm"

echo ""
echo "All roles started in tmux session '$SESSION'."
echo ""
echo "Attach:              tmux attach -t $SESSION"
echo "Switch windows:      Ctrl+b then window name or number"
echo "  Ctrl+b 0  →  pm"
echo "  Ctrl+b 1  →  dev"
echo "  Ctrl+b 2  →  uiux"
echo "  Ctrl+b 3  →  arch"
echo ""
echo "Add a second Dev:    bash scripts/start-roles.sh dev2"
echo "Stop everything:     tmux kill-session -t $SESSION"
