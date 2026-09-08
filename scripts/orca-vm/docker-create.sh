#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_docker
ensure_state
ensure_ssh_key

image="${ORCA_IMAGE:-$(state_value image)}"
project_root="${ORCA_PROJECT_ROOT:-$(state_value projectRoot)}"
ssh_username="${ORCA_SSH_USERNAME:-$(state_value sshUsername)}"
worktree_path="${ORCA_WORKTREE_PATH:-$repo_root}"
worktree_path="$(cd "$worktree_path" && pwd)"
worktree_name="$(basename "$worktree_path")"
worktree_hash="$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0, 10))' "$worktree_path")"
project_name="sure-${worktree_name}-${worktree_hash}"
project_name="$(printf '%s' "$project_name" | tr '[:upper:].' '[:lower:]-' | tr -cd 'a-z0-9_-')"
shared_project_name="sure-orca-shared"

docker image inspect "$image" >/dev/null 2>&1 || {
  echo "Workspace image $image is missing; run docker-base-build.sh first" >&2
  exit 1
}

# Warn when the worktree's Gemfile.lock has drifted from the gems baked into
# the image. The pre-baked gems still seed the bundle volume, so boot remains
# fast; bundle install at startup only applies the small delta on top.
baked_lock_hash="$(docker run --rm --entrypoint cat "$image" /etc/sure-gemfile-lock.sha256 2>/dev/null | awk '{print $1}')"
worktree_lock_hash="$(sha256sum "$worktree_path/Gemfile.lock" 2>/dev/null | awk '{print $1}')"
if [[ -n "$baked_lock_hash" && -n "$worktree_lock_hash" && "$baked_lock_hash" != "$worktree_lock_hash" ]]; then
  echo "Note: Gemfile.lock differs from the one baked into $image;" >&2
  echo "startup will install the changed gems (rebuild the image with ./scripts/orca-vm/docker-base-build.sh to re-bake)." >&2
fi

export ORCA_IMAGE="$image"
export ORCA_SSH_PUBLIC_KEY
ORCA_SSH_PUBLIC_KEY="$(cat "$key_file.pub")"
export ORCA_WORKTREE_PATH="$worktree_path"

cleanup_on_error() {
  if [[ "$?" -ne 0 ]]; then
    docker compose --project-name "$project_name" --file "$compose_file" down --volumes >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_error EXIT

docker volume inspect sure-orca-shared-postgres >/dev/null 2>&1 || docker volume create sure-orca-shared-postgres >/dev/null
docker volume inspect sure-orca-shared-npm-cache >/dev/null 2>&1 || docker volume create sure-orca-shared-npm-cache >/dev/null
docker volume inspect sure-orca-shared-pnpm-store >/dev/null 2>&1 || docker volume create sure-orca-shared-pnpm-store >/dev/null
docker compose --project-name "$shared_project_name" --file "$shared_compose_file" up --detach --wait >&2
docker compose --project-name "$project_name" --file "$compose_file" up --detach >&2

container_id="$(docker compose --project-name "$project_name" --file "$compose_file" ps --quiet app)"
[[ -n "$container_id" ]] || {
  echo "The workspace app container did not start" >&2
  exit 1
}

ssh_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "22/tcp") 0).HostPort}}' "$container_id")"
rails_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}' "$container_id")"
web_container_id="$(docker compose --project-name "$project_name" --file "$compose_file" ps --quiet web)"
web_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5173/tcp") 0).HostPort}}' "$web_container_id" 2>/dev/null || true)"
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

for _ in $(seq 1 300); do
  http_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://127.0.0.1:$rails_port" || true)"
  if [[ "$http_code" != "000" ]]; then
    break
  fi

  if docker exec "$container_id" test -f /tmp/sure-workspace.exit; then
    echo "Workspace startup failed:" >&2
    docker exec "$container_id" tail -n 100 /tmp/sure-workspace.log >&2
    exit 1
  fi
  sleep 1
done

if [[ "${http_code:-000}" == "000" ]]; then
  echo "Rails did not become ready on port $rails_port within 5 minutes" >&2
  docker exec "$container_id" tail -n 100 /tmp/sure-workspace.log >&2
  exit 1
fi

# The web (frontend) dev server boots `vite dev` with HMR on the bind-mounted
# worktree. First boot runs pnpm install (cold: minutes; warm: seconds).
if [[ -n "$web_port" ]]; then
  web_ready=0
  for _ in $(seq 1 300); do
    web_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://127.0.0.1:$web_port" || true)"
    if [[ "$web_code" != "000" ]]; then
      web_ready=1
      break
    fi
    sleep 1
  done
  if [[ "$web_ready" -ne 1 ]]; then
    echo "The web dev server did not become ready on port $web_port within 5 minutes" >&2
    docker logs --tail 100 "$web_container_id" >&2 || true
    exit 1
  fi
else
  echo "Note: web service is not running; frontend dev server was not started" >&2
fi

node -e '
  const [root, port, user, key, project, image, railsPort, worktreePath, sharedProject, webPort] = process.argv.slice(1);
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
      railsPort: Number(railsPort),
      webPort: webPort ? Number(webPort) : null,
      worktreePath,
      sharedProject
    }
  }));
' "$project_root" "$ssh_port" "$ssh_username" "$key_file" "$project_name" "$image" "$rails_port" "$worktree_path" "$shared_project_name" "$web_port"

trap - EXIT
