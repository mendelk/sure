#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_container_engine
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
workspace_slug="$(printf '%s' "$worktree_name" | tr '[:upper:]_.' '[:lower:]--' | tr -cd 'a-z0-9-' | sed -E 's/^-+|-+$//g' | cut -c1-32)"
[[ -n "$workspace_slug" ]] || workspace_slug="workspace"
proxy_route_id="sure-$worktree_hash"
shared_project_name="sure-orca-shared"
publish_host="$(resolve_publish_host)"
connect_host="$publish_host"
[[ "$connect_host" == "0.0.0.0" ]] && connect_host="127.0.0.1"
proxy_port="${ORCA_PROXY_PORT:-$(state_value proxyPort)}"
proxy_port="${proxy_port:-8080}"
[[ "$proxy_port" =~ ^[0-9]+$ ]] && (( proxy_port > 0 && proxy_port <= 65535 )) || {
  echo "ORCA proxy port must be an integer between 1 and 65535" >&2
  exit 1
}
proxy_base_domain="${ORCA_PROXY_BASE_DOMAIN:-$(state_value proxyBaseDomain)}"
if [[ -z "$proxy_base_domain" ]]; then
  if [[ "$connect_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    proxy_base_domain="${connect_host//./-}.sslip.io"
  else
    echo "Set ORCA_PROXY_BASE_DOMAIN when the publish host is not an IPv4 address" >&2
    exit 1
  fi
fi
[[ "$proxy_base_domain" =~ ^[A-Za-z0-9.-]+$ ]] || {
  echo "ORCA proxy base domain contains unsupported characters" >&2
  exit 1
}
workspace_host="$workspace_slug-$worktree_hash.$proxy_base_domain"
proxy_route_file="$proxy_config_dir/$proxy_route_id.yml"

container image inspect "$image" >/dev/null 2>&1 || {
  echo "Workspace image $image is missing; run docker-base-build.sh first" >&2
  exit 1
}

# Warn when the worktree's Gemfile.lock has drifted from the gems baked into
# the image. The pre-baked gems still seed the bundle volume, so boot remains
# fast; bundle install at startup only applies the small delta on top.
baked_lock_hash="$(container run --rm --entrypoint cat "$image" /etc/sure-gemfile-lock.sha256 2>/dev/null | awk '{print $1}')"
worktree_lock_hash="$(sha256sum "$worktree_path/Gemfile.lock" 2>/dev/null | awk '{print $1}')"
if [[ -n "$baked_lock_hash" && -n "$worktree_lock_hash" && "$baked_lock_hash" != "$worktree_lock_hash" ]]; then
  echo "Note: Gemfile.lock differs from the one baked into $image;" >&2
  echo "startup will install the changed gems (rebuild the image with ./scripts/orca-vm/docker-base-build.sh to re-bake)." >&2
fi

export ORCA_IMAGE="$image"
export ORCA_SSH_PUBLIC_KEY
ORCA_SSH_PUBLIC_KEY="$(cat "$key_file.pub")"
export ORCA_WORKTREE_PATH="$worktree_path"
export ORCA_PUBLISH_HOST="$publish_host"
export ORCA_PROXY_CONFIG_DIR="$proxy_config_dir"
export ORCA_PROXY_PORT="$proxy_port"
export ORCA_SKIP_YJIT="${ORCA_SKIP_YJIT:-1}"
mkdir -p "$proxy_config_dir"
compose --project-name "$proxy_project_name" --file "$proxy_compose_file" up --detach >&2

cleanup_on_error() {
  if [[ "$?" -ne 0 ]]; then
    rm -f "$proxy_route_file"
    # shellcheck disable=SC2086
    compose --project-name "$project_name" $(compose_files_args) down --volumes >/dev/null 2>&1 || true
  fi
}
trap cleanup_on_error EXIT

container volume inspect sure-orca-shared-postgres >/dev/null 2>&1 || container volume create sure-orca-shared-postgres >/dev/null
container volume inspect sure-orca-shared-npm-cache >/dev/null 2>&1 || container volume create sure-orca-shared-npm-cache >/dev/null
compose --project-name "$shared_project_name" --file "$shared_compose_file" up --detach >&2

db_container_id="$(compose_container_id "$shared_project_name" db || true)"
[[ -n "$db_container_id" ]] || {
  echo "The shared Postgres container did not start" >&2
  exit 1
}

db_ready=0
for _ in $(seq 1 60); do
  if container exec "$db_container_id" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 1
done
if [[ "$db_ready" -ne 1 ]]; then
  echo "Shared Postgres did not become ready within 60 seconds" >&2
  container logs --tail 100 "$db_container_id" >&2 || true
  exit 1
fi
    # shellcheck disable=SC2086
    compose --project-name "$project_name" $(compose_files_args) up --detach >&2

container_id="$(compose_container_id "$project_name" app || true)"
[[ -n "$container_id" ]] || {
  echo "The workspace app container did not start" >&2
  exit 1
}

ssh_port="$(published_port "$container_id" 22 || true)"
rails_port="$(published_port "$container_id" 3000 || true)"
[[ -n "$ssh_port" ]] || {
  echo "$container_engine did not publish the workspace SSH port" >&2
  exit 1
}
[[ -n "$rails_port" ]] || {
  echo "$container_engine did not publish the Rails port" >&2
  exit 1
}

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ssh-keygen -R "[$connect_host]:$ssh_port" >/dev/null 2>&1 || true
for _ in $(seq 1 30); do
  if ssh-keyscan -p "$ssh_port" "$connect_host" >> "$HOME/.ssh/known_hosts" 2>/dev/null; then
    break
  fi
  sleep 0.25
done

ssh -i "$key_file" -p "$ssh_port" \
  -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  "$ssh_username@$connect_host" 'test -d /workspace && ruby --version && node --version' >&2

for _ in $(seq 1 300); do
  http_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://$connect_host:$rails_port" || true)"
  if [[ "$http_code" != "000" ]]; then
    break
  fi

  if container exec "$container_id" test -f /tmp/sure-workspace.exit; then
    echo "Workspace startup failed:" >&2
    container exec "$container_id" tail -n 100 /tmp/sure-workspace.log >&2
    exit 1
  fi
  sleep 1
done

if [[ "${http_code:-000}" == "000" ]]; then
  echo "Rails did not become ready on port $rails_port within 5 minutes" >&2
  container exec "$container_id" tail -n 100 /tmp/sure-workspace.log >&2
  exit 1
fi

route_tmp="${proxy_route_file}.tmp.$$"
cat >"$route_tmp" <<EOF
http:
  routers:
    $proxy_route_id:
      entryPoints:
        - web
      rule: 'Host(\`$workspace_host\`)'
      service: $proxy_route_id
  services:
    $proxy_route_id:
      loadBalancer:
        servers:
          - url: http://$connect_host:$rails_port
EOF
mv "$route_tmp" "$proxy_route_file"

proxy_ready=0
for _ in $(seq 1 30); do
  http_code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 \
    --header "Host: $workspace_host" "http://$connect_host:$proxy_port" || true)"
  if [[ "$http_code" != "000" && "$http_code" != "404" ]]; then
    proxy_ready=1
    break
  fi
  sleep 0.25
done
if [[ "$proxy_ready" -ne 1 ]]; then
  echo "Workspace route $workspace_host did not become ready through Traefik" >&2
  proxy_container_id="$(compose_container_id "$proxy_project_name" proxy || true)"
  [[ -z "$proxy_container_id" ]] || container logs --tail 100 "$proxy_container_id" >&2 || true
  exit 1
fi

node -e '
  const [
    root,
    port,
    user,
    key,
    project,
    image,
    railsPort,
    proxyPort,
    railsUrl,
    proxyHost,
    proxyRouteId,
    worktreePath,
    sharedProject,
    engine,
    host
  ] = process.argv.slice(1);
  console.log(JSON.stringify({
    schemaVersion: 1,
    connection: {
      type: "ssh",
      projectRoot: root,
      target: {
        label: project,
        host,
        port: Number(port),
        username: user,
        identityFile: key,
        identitiesOnly: true,
        relayGracePeriodSeconds: 0
      }
    },
    userData: {
      provider: `${engine}-compose`,
      resourceId: project,
      image,
      containerEngine: engine,
      publishHost: host,
      sshPort: Number(port),
      railsPort: Number(railsPort),
      proxyPort: Number(proxyPort),
      railsUrl,
      proxyHost,
      proxyRouteId,
      worktreePath,
      sharedProject
    }
  }));
' "$project_root" "$ssh_port" "$ssh_username" "$key_file" "$project_name" "$image" \
  "$rails_port" "$proxy_port" "http://$workspace_host:$proxy_port" "$workspace_host" \
  "$proxy_route_id" "$worktree_path" "$shared_project_name" "$container_engine" "$connect_host"

trap - EXIT
