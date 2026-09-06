#!/usr/bin/env bash
# Idempotent cleanup for a worktree's per-workspace Docker Compose project.
#
# Unlike docker-destroy.sh (which needs the recipe lifecycle payload on stdin
# and only runs in the picker "Run on" flow), this script recomputes the
# deterministic Compose project name from the worktree path — the same
# derivation as docker-create.sh — so it works as a repo archive hook and for
# manual runs. Safe when nothing is provisioned. Never touches the shared
# Postgres project or its volume.
#
# Usage:
#   ./scripts/orca-vm/docker-cleanup.sh [worktree-path]
#
# Worktree resolution: $1, then $ORCA_WORKTREE_PATH, then this script's own
# checkout (repo_root from common.sh), so it targets the right project no
# matter which directory invokes it — as long as the worktree still exists.
set -euo pipefail

source "$(dirname "$0")/common.sh"

worktree_path="${1:-${ORCA_WORKTREE_PATH:-$repo_root}}"
if [[ -d "$worktree_path" ]]; then
  worktree_path="$(cd "$worktree_path" && pwd)"
fi
worktree_name="$(basename "$worktree_path")"
worktree_hash="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0, 10))' "$worktree_path")"
project_name="sure-${worktree_name}-${worktree_hash}"
project_name="$(printf '%s' "$project_name" | tr '[:upper:].' '[:lower:]-' | tr -cd 'a-z0-9_-')"

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running; nothing to clean for project $project_name" >&2
  exit 0
fi

export ORCA_IMAGE="unused-during-cleanup"
export ORCA_SSH_PUBLIC_KEY="unused-during-cleanup"
export ORCA_WORKTREE_PATH="$worktree_path"

docker compose --project-name "$project_name" --file "$compose_file" down --volumes >&2 || true
echo "Cleaned Docker project $project_name (shared Postgres left intact)" >&2
