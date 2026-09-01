#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_docker
ensure_state

image="${ORCA_IMAGE:-$(state_value image)}"
devcontainer_image="${image%:*}-base:${image##*:}"

echo "Building the existing Sure devcontainer image as $devcontainer_image" >&2
docker build --file "$repo_root/.devcontainer/Dockerfile" --tag "$devcontainer_image" "$repo_root" >&2

echo "Adding SSH and automatic app startup as $image" >&2
docker build \
  --build-arg "BASE_IMAGE=$devcontainer_image" \
  --file "$repo_root/.devcontainer/Dockerfile.orca" \
  --tag "$image" \
  "$repo_root" >&2

docker image inspect "$image" >/dev/null
state_set image "$image"
cat "$state_file"
