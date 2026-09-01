#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_docker
ensure_state

payload="$(cat)"
project_name="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.recipeResult?.userData?.resourceId ?? "")' "$payload")"
ssh_port="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.recipeResult?.userData?.sshPort ?? ""))' "$payload")"
[[ -n "$project_name" ]] || {
  echo "No Docker Compose project name in lifecycle payload" >&2
  exit 1
}

export ORCA_IMAGE="${ORCA_IMAGE:-$(state_value image)}"
export ORCA_SSH_PUBLIC_KEY="unused-during-destroy"

docker compose --project-name "$project_name" --file "$compose_file" down --volumes >&2
if [[ -n "$ssh_port" ]]; then
  ssh-keygen -R "[127.0.0.1]:$ssh_port" >/dev/null 2>&1 || true
fi
