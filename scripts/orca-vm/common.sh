#!/usr/bin/env bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
state_file="$script_dir/docker-state.json"
state_example="$script_dir/docker-state.example.json"
compose_file="$script_dir/docker-compose.yml"
shared_compose_file="$script_dir/docker-compose.shared.yml"
key_file="$script_dir/id_ed25519"

ensure_state() {
  if [[ ! -f "$state_file" ]]; then
    cp "$state_example" "$state_file"
  fi
}

state_value() {
  node -e '
    const fs = require("node:fs");
    const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const value = state[process.argv[2]];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  ' "$state_file" "$1"
}

state_set() {
  node -e '
    const fs = require("node:fs");
    const [file, key, value] = process.argv.slice(1);
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    state[key] = value;
    fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(`${file}.tmp`, file);
  ' "$state_file" "$1" "$2"
}

select_container_engine() {
  if [[ -n "${ORCA_CONTAINER_ENGINE:-}" ]]; then
    command -v "$ORCA_CONTAINER_ENGINE" >/dev/null 2>&1 || return 1
    "$ORCA_CONTAINER_ENGINE" info >/dev/null 2>&1 || return 1
    container_engine="$ORCA_CONTAINER_ENGINE"
    return 0
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    container_engine="docker"
    return 0
  fi

  if command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
    container_engine="podman"
    return 0
  fi

  return 1
}

require_container_engine() {
  select_container_engine || {
    echo "Docker or rootless Podman is required for the Orca environment recipe" >&2
    exit 1
  }

  if [[ "$container_engine" == "podman" ]] \
    && ! command -v podman-compose >/dev/null 2>&1 \
    && ! podman compose version >/dev/null 2>&1; then
    echo "Podman Compose is required for the Orca environment recipe" >&2
    exit 1
  fi
}

container() {
  "$container_engine" "$@"
}

compose() {
  if [[ "$container_engine" == "docker" ]]; then
    docker compose "$@"
  elif command -v podman-compose >/dev/null 2>&1; then
    podman-compose "$@"
  else
    podman compose "$@"
  fi
}

resolve_publish_host() {
  local configured_host="${ORCA_PUBLISH_HOST:-$(state_value publishHost)}"
  local _client_ip _client_port ssh_server_ip _server_port

  if [[ -n "$configured_host" ]]; then
    printf '%s' "$configured_host"
    return
  fi

  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    read -r _client_ip _client_port ssh_server_ip _server_port <<<"$SSH_CONNECTION"
    if [[ -n "$ssh_server_ip" ]]; then
      printf '%s' "$ssh_server_ip"
      return
    fi
  fi

  printf '127.0.0.1'
}

published_port() {
  local container_id="$1"
  local container_port="$2"
  local binding=""
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] && binding="$line"
  done < <(container port "$container_id" "${container_port}/tcp" 2>/dev/null)

  [[ -n "$binding" ]] || return 1
  printf '%s' "${binding##*:}"
}
compose_container_id() {
  local project_name="$1"
  local service_name="$2"
  local container_id=""
  local line

  while IFS= read -r line; do
    [[ -n "$line" ]] && container_id="$line"
  done < <(
    container ps --all \
      --filter "label=com.docker.compose.project=$project_name" \
      --filter "label=com.docker.compose.service=$service_name" \
      --format '{{.ID}}'
  )

  [[ -n "$container_id" ]] || return 1
  printf '%s' "$container_id"
}


ensure_ssh_key() {
  if [[ ! -f "$key_file" ]]; then
    ssh-keygen -q -t ed25519 -N "" -C "orca-sure-workspaces" -f "$key_file"
  fi
  chmod 600 "$key_file"
}
