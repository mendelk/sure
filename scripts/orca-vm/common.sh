#!/usr/bin/env bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
state_file="$script_dir/docker-state.json"
state_example="$script_dir/docker-state.example.json"
compose_file="$script_dir/docker-compose.yml"
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

require_docker() {
  command -v docker >/dev/null 2>&1 || {
    echo "Docker is required for the Orca environment recipe" >&2
    exit 1
  }
  docker info >/dev/null 2>&1 || {
    echo "Docker is installed but its daemon is not running" >&2
    exit 1
  }
}

ensure_ssh_key() {
  if [[ ! -f "$key_file" ]]; then
    ssh-keygen -q -t ed25519 -N "" -C "orca-sure-workspaces" -f "$key_file"
  fi
  chmod 600 "$key_file"
}
