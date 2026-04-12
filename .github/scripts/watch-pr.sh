#!/usr/bin/env bash
# Watch a PR until it's actually MERGED, not just until checks pass.
#
# When branch protection requires "up to date with main" (strict: true),
# a PR whose checks pass can still be blocked from merging if another PR
# merged first and made the branch stale. This script detects that and
# auto-updates the branch, then waits for the new CI run to pass.
#
# Usage: .github/scripts/watch-pr.sh <PR_NUMBER>
# Exit codes:
#   0 = merged successfully
#   1 = checks failed
#   2 = invalid arguments / API error

set -euo pipefail

PR="${1:?Usage: watch-pr.sh <PR_NUMBER>}"
REPO="${GITHUB_REPOSITORY:-alfmunny/book-reader-ai}"
MAX_ROUNDS=5  # safety valve — don't loop forever

for round in $(seq 1 $MAX_ROUNDS); do
  echo "── Round $round: watching checks for PR #$PR ──"

  # Wait for all checks to finish
  if ! gh pr checks "$PR" --repo "$REPO" --watch 2>&1; then
    echo "✗ PR #$PR: checks failed."
    exit 1
  fi

  # Check if it actually merged
  STATE="$(gh pr view "$PR" --repo "$REPO" --json state -q '.state')"
  if [ "$STATE" = "MERGED" ]; then
    echo "✓ PR #$PR merged successfully."
    exit 0
  fi

  if [ "$STATE" = "CLOSED" ]; then
    echo "✗ PR #$PR was closed without merging."
    exit 1
  fi

  # Still OPEN — branch is probably stale. Update it.
  echo "⟳ PR #$PR: checks passed but not merged (branch likely stale). Updating branch…"
  if gh api "repos/$REPO/pulls/$PR/update-branch" --method PUT --silent 2>/dev/null; then
    echo "  Branch updated. Waiting for new CI run…"
    # Give GitHub a moment to register the new commit and start checks
    sleep 5
  else
    echo "  Branch update failed (may already be up-to-date or have conflicts)."
    echo "  Waiting 30s and checking again…"
    sleep 30
    # Check state one more time
    STATE="$(gh pr view "$PR" --repo "$REPO" --json state -q '.state')"
    if [ "$STATE" = "MERGED" ]; then
      echo "✓ PR #$PR merged successfully."
      exit 0
    fi
  fi
done

echo "⚠ PR #$PR: gave up after $MAX_ROUNDS rounds. Check manually."
exit 2
