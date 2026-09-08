# Orca Docker environment

This recipe creates one Docker Compose project per local Git worktree. Each app bind-mounts its worktree
at `/workspace`, so local code changes are reflected immediately. Worktrees have isolated app, Redis,
Selenium, and bundle services while sharing one persistent Postgres database and its data.

The app container runs `bin/setup` and starts `bin/dev` automatically. Workspace creation waits for
Rails to respond before reporting success. Destroying a workspace removes its isolated services and
volumes but leaves the shared Postgres service and `sure-orca-shared-postgres` volume intact.

The `web` service runs the alternate frontend (`apps/web`, TanStack Start) as a `vite dev` server on
the same bind-mounted worktree, so code changes hot-reload (HMR) without rebuilding anything. It
publishes a loopback port (reported as `webPort` by the create hook) and proxies to Rails through the
`app` service internally (`SURE_API_ORIGIN=http://app:3000`). First boot runs
`pnpm install --frozen-lockfile` inside the container (a few minutes cold; the shared
`sure-orca-shared-pnpm-store` volume makes later worktrees fast). The container's `node_modules` is
isolated in a volume, so the host checkout's `node_modules` is never modified.

File watching works out of the box on OrbStack and Linux. On Docker Desktop for Mac/Windows, host
file events don't reach the container — set `SURE_WEB_USEPOLLING=1` when running the create hook to
switch to filesystem polling.

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

Run the create hook from a worktree to start or refresh that worktree's deterministic Docker project:

```sh
./scripts/orca-vm/docker-create.sh
```

All worktrees use the same logical `postgres` database. Schema changes and data mutations are therefore
visible to every running worktree immediately.

Orca reads `environmentRecipes` from `orca.yaml` on the repository's primary branch. Static doctor
works from any checkout, but **Docker Devcontainer** appears in the workspace picker only after these
recipe files are committed and merged to the primary branch.
