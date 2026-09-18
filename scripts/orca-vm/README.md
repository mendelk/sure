# Orca container environment

This recipe creates one Compose project per Git worktree using Docker or rootless Podman. Each app
bind-mounts its worktree at `/workspace`, so Ruby, ERB, JavaScript, and CSS changes are reflected
without rebuilding the image. Worktrees have isolated app, Redis, Selenium, and bundle services
while sharing one persistent Postgres database and its data.

The app container runs `bin/setup` and starts `bin/dev` automatically, including Rails development
reloading and the Tailwind watcher. During setup it loads a deterministic sample dataset when
`user@example.com` is absent; sign in with `user@example.com` and `Password1!`. Re-running setup
preserves existing data and skips sample generation once that demo user exists. Workspace creation
waits for Rails to respond before reporting success. The create hook reports the browser address as
`railsUrl`. Ports bind to `127.0.0.1` for local execution; over SSH they bind to the SSH server
address. Override that interface with `ORCA_PUBLISH_HOST`. Destroying a workspace removes its
isolated services and volumes but leaves the shared Postgres service and
`sure-orca-shared-postgres` volume intact.

On the gradual frontend branch, `bin/dev` also runs `npm run spa:watch`. Vite rebuilds
`app/assets/builds/spa.js` whenever React or TypeScript source under `app/javascript/spa` changes,
and Rails serves the rebuilt bundle from the same `railsUrl`.

## First-time setup

1. Start Docker/OrbStack, or install rootless Podman with Podman Compose.
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

Run the create hook from a worktree to start or refresh that worktree's deterministic Compose project:

```sh
./scripts/orca-vm/docker-create.sh
```

All worktrees use the same logical `postgres` database. Schema changes and data mutations are therefore
visible to every running worktree immediately.

Orca reads `environmentRecipes` from `orca.yaml` on the repository's primary branch. Static doctor
works from any checkout, but **Docker Devcontainer** appears in the workspace picker only after these
recipe files are committed and merged to the primary branch.
