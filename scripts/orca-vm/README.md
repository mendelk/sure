# Orca Docker environment

This recipe creates one disposable Docker Compose project per Orca workspace. It reuses the Sure
devcontainer image and service topology, then adds SSH for Orca's direct connection. After Orca imports
the workspace, the container installs dependencies, prepares the database, and starts `bin/dev`.

## First-time setup

1. Start Docker or OrbStack.
2. Build the reusable base image:

   ```sh
   ./scripts/orca-vm/docker-base-build.sh
   ```

3. Validate the lifecycle without creating an Orca workspace:

   ```sh
   orca vm recipe doctor docker-devcontainer --repo-path "$PWD" --provision --json
   ```

The generated state and SSH key under this directory are gitignored. Re-run the build when the
devcontainer dependencies change.

Orca reads `environmentRecipes` from `orca.yaml` on the repository's primary branch. Static doctor
works from any checkout, but **Docker Devcontainer** appears in the workspace picker only after these
recipe files are committed and merged to the primary branch.
