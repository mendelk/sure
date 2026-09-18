#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "$0")/common.sh"

require_container_engine
ensure_state

image="${ORCA_IMAGE:-$(state_value image)}"
devcontainer_image="${image%:*}-base:${image##*:}"
base_image_reference="$devcontainer_image"
if [[ "$container_engine" == "podman" && "$base_image_reference" != */* ]]; then
  base_image_reference="localhost/$base_image_reference"
fi


echo "Building the existing Sure devcontainer image as $devcontainer_image with $container_engine" >&2
container build --file "$repo_root/.devcontainer/Dockerfile" --tag "$devcontainer_image" "$repo_root" >&2

echo "Adding SSH and automatic app startup as $image" >&2
container build \
  --build-arg "BASE_IMAGE=$base_image_reference" \
  --file "$repo_root/.devcontainer/Dockerfile.orca" \
  --tag "$image" \
  "$repo_root" >&2

container image inspect "$image" >/dev/null
state_set image "$image"
cat "$state_file"
