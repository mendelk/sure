#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_docker
ensure_state
ensure_ssh_key

image="${ORCA_IMAGE:-$(state_value image)}"
project_root="${ORCA_PROJECT_ROOT:-$(state_value projectRoot)}"
ssh_username="${ORCA_SSH_USERNAME:-$(state_value sshUsername)}"
recipe_id="${ORCA_RECIPE_ID:-docker-devcontainer}"
instance_id="${ORCA_VM_INSTANCE_ID:-$(date +%s)}"
project_name="orca-${recipe_id}-${instance_id}"
project_name="$(printf '%s' "$project_name" | tr '[:upper:].' '[:lower:]-' | tr -cd 'a-z0-9_-')"

docker image inspect "$image" >/dev/null 2>&1 || {
  echo "Workspace image $image is missing; run docker-base-build.sh first" >&2
  exit 1
}

export ORCA_IMAGE="$image"
export ORCA_SSH_PUBLIC_KEY
ORCA_SSH_PUBLIC_KEY="$(cat "$key_file.pub")"

cleanup_on_error() {
  if [[ "$?" -ne 0 ]]; then
    docker compose --project-name "$project_name" --file "$compose_file" down --volumes >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_error EXIT

docker compose --project-name "$project_name" --file "$compose_file" up --detach >&2

container_id="$(docker compose --project-name "$project_name" --file "$compose_file" ps --quiet app)"
[[ -n "$container_id" ]] || {
  echo "The workspace app container did not start" >&2
  exit 1
}

ssh_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "22/tcp") 0).HostPort}}' "$container_id")"
rails_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}' "$container_id")"
[[ -n "$ssh_port" ]] || {
  echo "Docker did not publish the workspace SSH port" >&2
  exit 1
}

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
for _ in $(seq 1 30); do
  if ssh-keyscan -p "$ssh_port" 127.0.0.1 >> "$HOME/.ssh/known_hosts" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

ssh -i "$key_file" -p "$ssh_port" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  "$ssh_username@127.0.0.1" 'test -d /workspace && ruby --version && node --version' >&2

node -e '
  const [root, port, user, key, project, image, railsPort] = process.argv.slice(1);
  console.log(JSON.stringify({
    schemaVersion: 1,
    connection: {
      type: "ssh",
      projectRoot: root,
      target: {
        label: project,
        host: "127.0.0.1",
        port: Number(port),
        username: user,
        identityFile: key,
        identitiesOnly: true,
        relayGracePeriodSeconds: 0
      }
    },
    userData: {
      provider: "local-docker",
      resourceId: project,
      image,
      sshPort: Number(port),
      railsPort: Number(railsPort)
    }
  }));
' "$project_root" "$ssh_port" "$ssh_username" "$key_file" "$project_name" "$image" "$rails_port"

trap - EXIT
