# Docker Compose Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the bot run as a long-lived background container via Docker Compose, with no changes to application code.

**Architecture:** A single-stage `Dockerfile` builds a minimal `node:20-alpine` image running as a non-root user. A `docker-compose.yml` with one `bot` service builds that image, injects credentials/config via `env_file: .env`, and constructs the CLI invocation via a shell-form `command:` string so optional args (`-t`, `-m`) and the optional `--dry-run` flag cleanly vanish when their corresponding `.env` vars are unset — verified directly against `docker compose config` (see design spec).

**Tech Stack:** Docker, Docker Compose (Compose v2 spec — verified against installed `Docker Compose version v5.1.2`). No new npm dependencies, no changes to `src/`.

## Global Constraints

- No changes to any file under `src/` — this is packaging/deployment only.
- `.env` is never copied into the image — it's excluded via `.dockerignore` and only read by Compose at container-start time via `env_file:`.
- Base image: `node:20-alpine`.
- Container runs as a non-root user (`USER node` — Node's official images ship this user built in).
- `docker-compose.yml` service `bot`: `restart: unless-stopped`.
- The `command:` in `docker-compose.yml` must be exactly the verified shell-form pattern (quoted `-t`/`-m` values, unquoted `${DRY_RUN_FLAG}`) — do not simplify to a plain YAML list, since a stray empty-string positional argument makes commander fail with `error: too many arguments for 'bot'` (verified against the actual CLI).

---

## File Structure

- **Create `Dockerfile`** — single-stage build, installs prod deps only, copies `src/`, runs as non-root.
- **Create `.dockerignore`** — keeps `.env`, `node_modules`, git/docs metadata out of the build context.
- **Create `docker-compose.yml`** — one `bot` service wiring the image to `.env` and constructing the CLI command.
- **Modify `.env.example`** — append `CURRENT_DATE`, `TARGET_DATE`, `MIN_DATE`, `DRY_RUN_FLAG` with comments.

---

### Task 1: Dockerfile and build verification

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Produces: a buildable image tagged `us-visa-bot:test` for local verification (not pushed anywhere) exposing `node src/index.js` as its default command, overridden by Task 2's compose `command:`.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.git
.env
docs
.claude
.worktrees
*.md
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

USER node

CMD ["node", "src/index.js"]
```

- [ ] **Step 3: Build the image**

Run: `docker build -t us-visa-bot:test .`
Expected: build completes successfully (exit code 0), ending with `naming to docker.io/library/us-visa-bot:test` (or equivalent success output for the installed Docker version).

- [ ] **Step 4: Verify the container runs as non-root**

Run: `docker run --rm us-visa-bot:test whoami`
Expected: output is `node` (not `root`).

- [ ] **Step 5: Verify the app code actually executes and validates config**

Run: `docker run --rm us-visa-bot:test node src/index.js bot -c 2099-01-01`
Expected: stderr output `Missing required environment variables: EMAIL, PASSWORD, SCHEDULEID, FACILITYID, COUNTRYCODE` and non-zero exit code — this confirms the image runs the real CLI and reaches `getConfig()`'s validation (matches the behavior already verified locally against the un-containerized CLI).

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile for running the bot in a container"
```

---

### Task 2: docker-compose.yml and end-to-end verification

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the `Dockerfile` from Task 1 (referenced via `build: .`).
- Produces: `docker compose up`/`down` as the standard way to run/stop the bot; no other file depends on this task's output.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  bot:
    build: .
    restart: unless-stopped
    env_file: .env
    command: >
      sh -c "node src/index.js bot -c ${CURRENT_DATE} -t \"${TARGET_DATE}\" -m \"${MIN_DATE}\" ${DRY_RUN_FLAG}"
```

- [ ] **Step 2: Append new variables to `.env.example`**

Append to the end of the existing `.env.example`:

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

- [ ] **Step 3: Verify Compose resolves the command correctly with optional args unset**

Create a throwaway `.env` in the repo root (this file is already gitignored — confirm with `git check-ignore .env` before proceeding) with:
```
EMAIL=test@example.com
PASSWORD=testpass
COUNTRY_CODE=ca
SCHEDULE_ID=12345678
FACILITY_ID=44
CURRENT_DATE=2099-01-01
TARGET_DATE=
MIN_DATE=
DRY_RUN_FLAG=
```

Run: `docker compose config`
Expected: the `bot` service's resolved `command` is exactly:
```yaml
    command:
      - sh
      - -c
      - 'node src/index.js bot -c 2099-01-01 -t "" -m "" '
```

- [ ] **Step 4: Verify Compose resolves the command correctly with optional args set (including dry-run)**

Edit the throwaway `.env`, changing:
```
TARGET_DATE=2099-06-01
MIN_DATE=2099-02-01
DRY_RUN_FLAG=--dry-run
```

Run: `docker compose config`
Expected: the resolved `command` is exactly:
```yaml
    command:
      - sh
      - -c
      - node src/index.js bot -c 2099-01-01 -t "2099-06-01" -m "2099-02-01" --dry-run
```

- [ ] **Step 5: Verify a real `up`/`logs`/`down` cycle with dry-run enabled**

With the `.env` from Step 4 (dry-run enabled, dummy credentials) still in place:

Run: `docker compose up -d --build`
Expected: exit code 0, container starts.

Run: `sleep 3 && docker compose logs bot`
Expected: log lines include `Initializing with current date 2099-01-01`, `[DRY RUN MODE] Bot will only log what would be booked without actually booking`, `Target date: 2099-06-01`, `Minimum date: 2099-02-01`, and then a `Session/authentication error` or similar (dummy credentials will fail login against the real site — that's expected and fine, it confirms the full request path executes).

Run: `docker compose down`
Expected: container stops and is removed, exit code 0.

- [ ] **Step 6: Verify the blank-optional-args case also runs end-to-end**

Restore the `.env` from Step 3 (blank `TARGET_DATE`/`MIN_DATE`/`DRY_RUN_FLAG`).

Run: `docker compose up -d --build && sleep 3 && docker compose logs bot`
Expected: log lines include `Initializing with current date 2099-01-01`, no `[DRY RUN MODE]` line, no `Target date:` line, no `Minimum date:` line (all correctly omitted since their values were blank), followed by a login error same as Step 5.

Run: `docker compose down`

- [ ] **Step 7: Clean up the throwaway `.env` and verify it was never staged**

Run: `git status --short` — confirm `.env` does not appear (it's gitignored). Delete the throwaway `.env` file (`rm .env`) now that verification is complete, since it contains dummy-but-real-shaped credentials and shouldn't linger.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add docker-compose.yml for running the bot as a background service"
```

---

## Self-Review Notes

- **Spec coverage:** Dockerfile (non-root, node:20-alpine, no build step) ✓ Task 1. `.dockerignore` (excludes `.env`/node_modules/git/docs) ✓ Task 1. `docker-compose.yml` (`build`, `restart: unless-stopped`, `env_file`, shell-form command with verified quoting) ✓ Task 2. `.env.example` additions (`CURRENT_DATE`, `TARGET_DATE`, `MIN_DATE`, `DRY_RUN_FLAG`) ✓ Task 2. No volumes, no extra logging config, per design's explicit non-goals — correctly absent from both tasks.
- **Placeholder scan:** no TBDs; all file contents are complete and copy-pasteable; all verification commands include exact expected output, taken from commands actually run against this Docker/Compose installation during design verification (not guessed).
- **Type consistency:** N/A (no code interfaces between tasks) — the only cross-task dependency is Task 2's `build: .` referencing Task 1's `Dockerfile`, which is a fixed, unambiguous reference.
