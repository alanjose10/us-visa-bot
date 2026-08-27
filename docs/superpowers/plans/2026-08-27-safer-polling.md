# Safer Polling (Jitter + Backoff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bot's fixed 3-second polling interval and immediate-retry-on-error behavior with randomized (jittered) polling, occasional longer human-like pauses, and exponential backoff on errors — to reduce the chance of rate-limiting/flagging on `ais.usvisa-info.com`.

**Architecture:** Three small, independently testable pieces feed into the existing command loop in `src/commands/bot.js`: (1) pure timing helpers in `src/lib/utils.js` (random range, random int, exponential backoff calculation), (2) a pure env-parsing function in `src/lib/config.js` that resolves the min/max polling delay from environment variables with backward-compatible fallback, and (3) the wiring of both into the existing `while (true)` loop and `catch` block in `botCommand`. No new dependencies.

**Tech Stack:** Node.js (ESM), Node's built-in test runner (`node:test` + `node:assert/strict`) — zero new dependencies. Requires Node 18+ to run tests (bumping the effective floor from the README's current "Node.js 16+").

## Global Constraints

- No new npm dependencies — use Node's built-in `node:test` and `node:assert/strict` only.
- Preserve backward compatibility: an existing `.env` with only `REFRESH_DELAY` set must keep working (fixed-delay behavior, no jitter) rather than silently switching to a random range.
- Default polling range (when nothing is set): `MIN_REFRESH_DELAY=20`, `MAX_REFRESH_DELAY=60` (seconds).
- Long pause: every random 30–50 checks, sleep a random 300–900 seconds (5–15 min).
- Error backoff: exponential starting at 30s, doubling per consecutive failure, capped at 1800s (30 min); resets to 0 after any successful login.
- Follow existing code style: ES modules, `log()` from `src/lib/utils.js` for all status output, no console.log directly in business logic (config's `validateConfig` is the sole pre-existing exception — leave it as-is).

---

## File Structure

- **Modify `src/lib/utils.js`** — add three pure helpers: `randomInRange(min, max)`, `randomInt(min, max)`, `computeBackoffDelay(attempt, baseSeconds, capSeconds)`. Keep existing `sleep`, `log`, `isSocketHangupError` untouched.
- **Create `src/lib/utils.test.js`** — unit tests for the three new helpers.
- **Modify `src/lib/config.js`** — add exported pure function `resolveRefreshDelayRange(env)`; wire it into `getConfig()`, replacing the old single `refreshDelay` field with `minRefreshDelay`/`maxRefreshDelay`.
- **Create `src/lib/config.test.js`** — unit tests for `resolveRefreshDelayRange`.
- **Modify `src/commands/bot.js`** — replace the fixed `sleep(config.refreshDelay)` call with jittered delay + periodic long pause; replace the fixed/immediate retry in `catch` with exponential backoff, tracked via a `consecutiveFailures` counter threaded through the existing recursive retry (`options.consecutiveFailures`).
- **Modify `.env.example`** — document `MIN_REFRESH_DELAY`/`MAX_REFRESH_DELAY`, mark `REFRESH_DELAY` as legacy/fallback-only.
- **Modify `README.md`** — update the configuration table and "How It Behaves" section to describe jittered polling, long pauses, and backoff.
- **Modify `package.json`** — set `"test": "node --test src"` and add `"engines": { "node": ">=18" }`.

---

### Task 1: Timing/backoff pure helpers

**Files:**
- Modify: `src/lib/utils.js`
- Test: `src/lib/utils.test.js` (create)

**Interfaces:**
- Produces: `randomInRange(min: number, max: number): number` — random float in `[min, max]`.
- Produces: `randomInt(min: number, max: number): number` — random integer in `[min, max]` inclusive.
- Produces: `computeBackoffDelay(attempt: number, baseSeconds: number, capSeconds: number): number` — `baseSeconds * 2^(attempt-1)`, capped at `capSeconds`. `attempt` is 1-indexed (first failure = attempt 1).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/utils.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInRange, randomInt, computeBackoffDelay } from './utils.js';

test('randomInRange returns values within [min, max]', () => {
  for (let i = 0; i < 200; i++) {
    const value = randomInRange(10, 20);
    assert.ok(value >= 10 && value <= 20, `expected ${value} to be within [10, 20]`);
  }
});

test('randomInRange handles a degenerate range', () => {
  assert.equal(randomInRange(5, 5), 5);
});

test('randomInt returns integers within [min, max] inclusive and covers the range', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const value = randomInt(1, 3);
    assert.ok(Number.isInteger(value), `expected ${value} to be an integer`);
    assert.ok(value >= 1 && value <= 3, `expected ${value} to be within [1, 3]`);
    seen.add(value);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});

test('computeBackoffDelay doubles from base on each successive attempt', () => {
  assert.equal(computeBackoffDelay(1, 30, 1800), 30);
  assert.equal(computeBackoffDelay(2, 30, 1800), 60);
  assert.equal(computeBackoffDelay(3, 30, 1800), 120);
  assert.equal(computeBackoffDelay(4, 30, 1800), 240);
});

test('computeBackoffDelay caps at the maximum', () => {
  assert.equal(computeBackoffDelay(10, 30, 1800), 1800);
  assert.equal(computeBackoffDelay(100, 30, 1800), 1800);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/utils.test.js`
Expected: FAIL — `randomInRange`, `randomInt`, `computeBackoffDelay` are not exported from `./utils.js` (SyntaxError or "is not a function").

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/utils.js` (keep the existing three functions above unchanged):

```js
export function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randomInt(min, max) {
  return Math.floor(randomInRange(min, max + 1));
}

export function computeBackoffDelay(attempt, baseSeconds, capSeconds) {
  const delay = baseSeconds * (2 ** (attempt - 1));
  return Math.min(delay, capSeconds);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/utils.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils.js src/lib/utils.test.js
git commit -m "feat: add jitter and backoff timing helpers"
```

---

### Task 2: Configurable polling delay range

**Files:**
- Modify: `src/lib/config.js`
- Test: `src/lib/config.test.js` (create)

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `resolveRefreshDelayRange(env: object): { minRefreshDelay: number, maxRefreshDelay: number }`.
- Produces: `getConfig()` return value gains `minRefreshDelay` and `maxRefreshDelay` fields; the old `refreshDelay` field is removed (nothing else in the codebase reads it after Task 3).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefreshDelayRange } from './config.js';

test('defaults to 20-60s when nothing is set', () => {
  assert.deepEqual(resolveRefreshDelayRange({}), { minRefreshDelay: 20, maxRefreshDelay: 60 });
});

test('falls back to a fixed delay when only REFRESH_DELAY is set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ REFRESH_DELAY: '5' }),
    { minRefreshDelay: 5, maxRefreshDelay: 5 }
  );
});

test('uses MIN/MAX_REFRESH_DELAY when both are set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '15', MAX_REFRESH_DELAY: '45' }),
    { minRefreshDelay: 15, maxRefreshDelay: 45 }
  );
});

test('mirrors MIN_REFRESH_DELAY into max when only min is set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '25' }),
    { minRefreshDelay: 25, maxRefreshDelay: 25 }
  );
});

test('MIN/MAX_REFRESH_DELAY takes priority over legacy REFRESH_DELAY', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ REFRESH_DELAY: '3', MIN_REFRESH_DELAY: '20', MAX_REFRESH_DELAY: '60' }),
    { minRefreshDelay: 20, maxRefreshDelay: 60 }
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/lib/config.test.js`
Expected: FAIL — `resolveRefreshDelayRange` is not exported from `./config.js`.

- [ ] **Step 3: Implement `resolveRefreshDelayRange` and wire it into `getConfig`**

Replace the full contents of `src/lib/config.js` with:

```js
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_MIN_REFRESH_DELAY = 20;
const DEFAULT_MAX_REFRESH_DELAY = 60;

export function resolveRefreshDelayRange(env) {
  const explicitMin = env.MIN_REFRESH_DELAY;
  const explicitMax = env.MAX_REFRESH_DELAY;

  if (explicitMin || explicitMax) {
    return {
      minRefreshDelay: Number(explicitMin || explicitMax),
      maxRefreshDelay: Number(explicitMax || explicitMin)
    };
  }

  if (env.REFRESH_DELAY) {
    const fixed = Number(env.REFRESH_DELAY);
    return { minRefreshDelay: fixed, maxRefreshDelay: fixed };
  }

  return { minRefreshDelay: DEFAULT_MIN_REFRESH_DELAY, maxRefreshDelay: DEFAULT_MAX_REFRESH_DELAY };
}

export function getConfig() {
  const { minRefreshDelay, maxRefreshDelay } = resolveRefreshDelayRange(process.env);

  const config = {
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
    scheduleId: process.env.SCHEDULE_ID,
    facilityId: process.env.FACILITY_ID,
    countryCode: process.env.COUNTRY_CODE,
    minRefreshDelay,
    maxRefreshDelay
  };

  validateConfig(config);
  return config;
}

function validateConfig(config) {
  const required = ['email', 'password', 'scheduleId', 'facilityId', 'countryCode'];
  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.map(k => k.toUpperCase()).join(', ')}`);
    process.exit(1);
  }
}

export function getBaseUri(countryCode) {
  return `https://ais.usvisa-info.com/en-${countryCode}/niv`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/lib/config.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.js src/lib/config.test.js
git commit -m "feat: resolve polling delay as a configurable min/max range"
```

---

### Task 3: Wire jitter, long pauses, and exponential backoff into the bot loop

**Files:**
- Modify: `src/commands/bot.js`

**Interfaces:**
- Consumes: `randomInRange`, `randomInt`, `computeBackoffDelay` from `src/lib/utils.js` (Task 1); `config.minRefreshDelay` / `config.maxRefreshDelay` from `src/lib/config.js` (Task 2).
- Produces: no new exports — `botCommand(options)` keeps its existing signature and CLI behavior, only its internal timing changes. `options.consecutiveFailures` is a new internal field threaded through the existing recursive retry call; callers outside this file never need to pass it (defaults to `0`).

- [ ] **Step 1: Replace `src/commands/bot.js` with the updated implementation**

There's no meaningful unit test for this file's orchestration (it's an infinite loop driving live HTTP calls through `Bot`/`VisaHttpClient`), so this task is verified manually in Step 2 instead of TDD. Replace the full contents of `src/commands/bot.js` with:

```js
import { Bot } from '../lib/bot.js';
import { getConfig } from '../lib/config.js';
import { log, sleep, isSocketHangupError, randomInRange, randomInt, computeBackoffDelay } from '../lib/utils.js';

const BACKOFF_BASE_SECONDS = 30;
const BACKOFF_CAP_SECONDS = 1800; // 30 minutes
const LONG_PAUSE_MIN_CHECKS = 30;
const LONG_PAUSE_MAX_CHECKS = 50;
const LONG_PAUSE_MIN_SECONDS = 300; // 5 minutes
const LONG_PAUSE_MAX_SECONDS = 900; // 15 minutes

export async function botCommand(options) {
  const config = getConfig();
  const bot = new Bot(config, { dryRun: options.dryRun });
  let currentBookedDate = options.current;
  const targetDate = options.target;
  const minDate = options.min;
  let consecutiveFailures = options.consecutiveFailures || 0;
  let checksUntilLongPause = randomInt(LONG_PAUSE_MIN_CHECKS, LONG_PAUSE_MAX_CHECKS);

  log(`Initializing with current date ${currentBookedDate}`);

  if (options.dryRun) {
    log(`[DRY RUN MODE] Bot will only log what would be booked without actually booking`);
  }

  if (targetDate) {
    log(`Target date: ${targetDate}`);
  }

  if (minDate) {
    log(`Minimum date: ${minDate}`);
  }

  try {
    const sessionHeaders = await bot.initialize();
    consecutiveFailures = 0;

    while (true) {
      const availableDate = await bot.checkAvailableDate(
        sessionHeaders,
        currentBookedDate,
        minDate
      );

      if (availableDate) {
        const booked = await bot.bookAppointment(sessionHeaders, availableDate);

        if (booked) {
          currentBookedDate = availableDate;

          options = {
            ...options,
            current: currentBookedDate
          };

          if (targetDate && availableDate <= targetDate) {
            log(`Target date reached! Successfully booked appointment on ${availableDate}`);
            process.exit(0);
          }
        }
      }

      checksUntilLongPause -= 1;

      if (checksUntilLongPause <= 0) {
        const pauseSeconds = randomInRange(LONG_PAUSE_MIN_SECONDS, LONG_PAUSE_MAX_SECONDS);
        log(`Taking a longer pause: ${Math.round(pauseSeconds)}s`);
        await sleep(pauseSeconds);
        checksUntilLongPause = randomInt(LONG_PAUSE_MIN_CHECKS, LONG_PAUSE_MAX_CHECKS);
      } else {
        await sleep(randomInRange(config.minRefreshDelay, config.maxRefreshDelay));
      }
    }
  } catch (err) {
    consecutiveFailures += 1;
    const backoffSeconds = computeBackoffDelay(consecutiveFailures, BACKOFF_BASE_SECONDS, BACKOFF_CAP_SECONDS);

    if (isSocketHangupError(err)) {
      log(`Socket hangup error: ${err.message}. Retrying in ${backoffSeconds}s (failure #${consecutiveFailures})...`);
    } else {
      log(`Session/authentication error: ${err.message}. Retrying in ${backoffSeconds}s (failure #${consecutiveFailures})...`);
    }

    await sleep(backoffSeconds);
    return botCommand({ ...options, current: currentBookedDate, consecutiveFailures });
  }
}
```

- [ ] **Step 2: Manually verify with `--dry-run`**

This file drives live network calls in an infinite loop, so verify behavior by observation rather than an automated test:

1. Run with a deliberately tiny jitter range to see randomized delays quickly:
   `MIN_REFRESH_DELAY=1 MAX_REFRESH_DELAY=3 node src/index.js bot -c 2099-01-01 --dry-run`
   Expected: log lines show varying (non-identical) sleep gaps between checks, roughly 1-3s apart.
2. Stop it (Ctrl+C), then run with a bad password to trigger the error path:
   `PASSWORD=wrong-password node src/index.js bot -c 2099-01-01 --dry-run`
   Expected: log shows `Session/authentication error: ... Retrying in 30s (failure #1)`, then `... Retrying in 60s (failure #2)` on the next failure, doubling each time. Stop with Ctrl+C once doubling is confirmed (no need to wait for the 30-minute cap).
3. Confirm real credentials still work end-to-end: run without the bad password override and confirm login succeeds and normal polling resumes (`--dry-run` still on, so nothing gets booked).

- [ ] **Step 3: Commit**

```bash
git add src/commands/bot.js
git commit -m "feat: jittered polling, periodic long pauses, and exponential backoff on errors"
```

---

### Task 4: Documentation and test tooling

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: env var names introduced in Task 2 (`MIN_REFRESH_DELAY`, `MAX_REFRESH_DELAY`), behavior introduced in Task 3 (long pauses, backoff).
- Produces: nothing consumed by other tasks — this is documentation/tooling only.

- [ ] **Step 1: Update `.env.example`**

Replace the `REFRESH_DELAY` block at the end of `.env.example` (currently lines 21-22) with:

```
# Polling interval range in seconds - the bot waits a random amount of time in this
# range between checks, to avoid a robotic fixed-interval pattern. Defaults to 20-60s.
MIN_REFRESH_DELAY=20
MAX_REFRESH_DELAY=60

# Legacy fixed delay in seconds (optional). Only used as a fallback if MIN_REFRESH_DELAY
# and MAX_REFRESH_DELAY are both unset. Setting this alone disables randomized jitter.
# REFRESH_DELAY=3
```

- [ ] **Step 2: Update `README.md`**

In the Configuration `.env` example block, replace `REFRESH_DELAY=3` with:
```
MIN_REFRESH_DELAY=20
MAX_REFRESH_DELAY=60
```

In the configuration table, replace the `REFRESH_DELAY` row with two rows:
```
| `MIN_REFRESH_DELAY` | Minimum seconds between checks | Optional, defaults to 20 |
| `MAX_REFRESH_DELAY` | Maximum seconds between checks | Optional, defaults to 60 |
```

In the "How It Behaves" section, add a bullet after the existing "Check" bullet describing the new behavior:
```
- **Waits** a randomized delay between `MIN_REFRESH_DELAY` and `MAX_REFRESH_DELAY` seconds between checks (not a fixed interval), and periodically takes a longer 5-15 minute pause every 30-50 checks
- **Backs off** exponentially on login/session errors (starting at 30s, doubling up to a 30-minute cap) instead of retrying immediately
```

- [ ] **Step 3: Update `package.json`**

Change the `"test"` script and add an `engines` field:

```json
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test src",
    "lint": "echo \"No linter configured\"",
    "dev": "node src/index.js"
  },
```

Add (as a top-level key, e.g. after `"license"`):
```json
  "engines": {
    "node": ">=18"
  },
```

- [ ] **Step 4: Verify the test script runs both test files**

Run: `npm test`
Expected: PASS — output shows both `src/lib/utils.test.js` and `src/lib/config.test.js` ran, all 10 tests green, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md package.json
git commit -m "docs: document jittered polling and backoff configuration"
```

---

## Self-Review Notes

- **Spec coverage:** jitter interval (Task 2 config + Task 3 wiring) ✓, long/occasional pauses (Task 3) ✓, exponential backoff replacing immediate retry (Task 3) ✓, defaults 20-60s base / 30-50 checks / 5-15 min pause / 30s-30min backoff (all tasks, matching agreed numbers) ✓.
- **Placeholder scan:** no TBDs; all code blocks are complete and copy-pasteable.
- **Type consistency:** `resolveRefreshDelayRange` return shape (`{ minRefreshDelay, maxRefreshDelay }`) matches what `getConfig()` destructures in Task 2 and what `botCommand` reads (`config.minRefreshDelay` / `config.maxRefreshDelay`) in Task 3. `randomInRange`/`randomInt`/`computeBackoffDelay` signatures match their call sites in Task 3 exactly.
