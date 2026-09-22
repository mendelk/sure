#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_container_engine
ensure_state

payload="$(cat)"
project_name="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.recipeResult?.userData?.resourceId ?? "")' "$payload")"
ssh_port="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.recipeResult?.userData?.sshPort ?? ""))' "$payload")"
worktree_path="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.recipeResult?.userData?.worktreePath ?? "")' "$payload")"
publish_host="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.recipeResult?.userData?.publishHost ?? "127.0.0.1")' "$payload")"

[[ -n "$project_name" ]] || {
  echo "No Compose project name in lifecycle payload" >&2
  exit 1
}

export ORCA_IMAGE="${ORCA_IMAGE:-$(state_value image)}"
export ORCA_SSH_PUBLIC_KEY="unused-during-destroy"
export ORCA_WORKTREE_PATH="${worktree_path:-$repo_root}"
export ORCA_PUBLISH_HOST="$publish_host"

# shellcheck disable=SC2086
compose --project-name "$project_name" $(compose_files_args) down --volumes >&2
if [[ -n "$ssh_port" ]]; then
  ssh-keygen -R "[$publish_host]:$ssh_port" >/dev/null 2>&1 || true
fi
