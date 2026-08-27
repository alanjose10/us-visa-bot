# Docker Compose Setup — Design

## Purpose

Let the bot run as a long-lived background container instead of a foreground `node` process, using Docker Compose. No behavior change to the bot itself — this is packaging only.

## Components

### Dockerfile

Single-stage build, no build step (plain ESM JS, no bundler/TypeScript):

- Base image: `node:20-alpine` — satisfies `package.json`'s `engines.node >= 18`, small image, well-known LTS.
- Copy `package.json` + `package-lock.json` first, run `npm ci --omit=dev` (leverages Docker layer caching — dependency install only reruns when lockfile changes).
- Copy the rest of the source (`src/`).
- Run as a non-root user (Node's official images ship a built-in `node` user — use `USER node`).
- No `ENTRYPOINT`/`CMD` baked in beyond a sane default (`node src/index.js`); Compose's `command:` overrides it with the actual args per run.

### `.dockerignore`

Excludes: `node_modules`, `.git`, `.env`, `docs/`, `.claude/`, `.worktrees/`, `*.md` (README not needed at runtime).

### `docker-compose.yml`

One service, `bot`:

- `build: .`
- `restart: unless-stopped` — the bot is meant to run continuously; this survives host reboots and container crashes without manual intervention.
- `env_file: .env` — injects `EMAIL`, `PASSWORD`, `COUNTRY_CODE`, `SCHEDULE_ID`, `FACILITY_ID`, `MIN_REFRESH_DELAY`, `MAX_REFRESH_DELAY` directly into the container's environment. `.env` is never copied into the image (excluded via `.dockerignore`); it only exists on the host and is read by Compose at container-start time. The app's own `dotenv.config()` call becomes a no-op inside the container (no local `.env` file to find), which is fine — `process.env` is already populated by Compose, and `dotenv` doesn't overwrite existing env vars or error when its target file is missing.
- `command:` — shell form, so optional CLI args/flags can cleanly disappear when unset:
  ```yaml
  command: >
    sh -c "node src/index.js bot -c ${CURRENT_DATE} -t \"${TARGET_DATE}\" -m \"${MIN_DATE}\" ${DRY_RUN_FLAG}"
  ```
  `${VAR}` here is Compose's own substitution syntax, resolved once from the project-root `.env` at `docker compose up` time (a separate mechanism from the container's runtime environment, though it reads the same file). The resulting string is what actually runs inside the container via `/bin/sh -c`.

  - `${CURRENT_DATE}` is required (the bot's `-c` flag is required) — if unset, Compose substitutes an empty string and the bot's own CLI validation will reject it with a clear commander error, which is an acceptable failure mode (visible in `docker compose logs`).
  - `-t "${TARGET_DATE}"` / `-m "${MIN_DATE}"` are **quoted** — when unset, this passes an empty-string *value* to `-t`/`-m`, which the app already treats as "no constraint" (falsy check in `src/commands/bot.js`). Verified directly against the built CLI.
  - `${DRY_RUN_FLAG}` is **unquoted** — when unset, this contributes zero arguments after `/bin/sh` word-splits the resolved command string, so `--dry-run` is completely absent from argv (not an empty string arg, which commander would reject as an unexpected positional argument — confirmed empirically: passing a stray empty string causes `error: too many arguments for 'bot'`). When set to `DRY_RUN_FLAG=--dry-run` in `.env`, it's word-split into exactly one token and passed through normally.

### `.env.example` additions

Append to the existing file:
```
# Current booked appointment date (required) - passed as the bot's -c flag
CURRENT_DATE=2026-06-15

# Target date to stop at (optional) - passed as the bot's -t flag. Leave blank for no target.
TARGET_DATE=

# Minimum acceptable date (optional) - passed as the bot's -m flag. Leave blank for no minimum.
MIN_DATE=

# Set to --dry-run to only log what would be booked without actually booking. Leave blank for real runs.
DRY_RUN_FLAG=
```

### Logging

No extra logging configuration — rely on Docker's default JSON log driver and `docker compose logs -f bot` for tailing. This is a personal, single-instance tool; log rotation/shipping is out of scope.

### Volumes

None. The bot writes nothing to disk (no cache, no session persistence across restarts — it re-logs-in on every start).

## Non-goals

- No multi-stage build (nothing to compile/bundle).
- No orchestration beyond a single Compose service (no separate log-shipping container, no reverse proxy — this isn't a web service).
- No change to `src/` application code — this is purely a packaging/deployment addition.

## Open risk (informational, not blocking)

If `CURRENT_DATE` is left unset in `.env`, the container will crash-loop under `restart: unless-stopped` (commander exits non-zero on the missing required arg, Compose restarts it, same failure repeats). This is the same failure mode as running the CLI directly without `-c` today — not a regression — but worth noting since a crash-looping container is a little more opaque to notice than a CLI that exits with a visible error under a human's eyes. Docker's default restart backoff (capped exponential) prevents this from being a tight loop.
