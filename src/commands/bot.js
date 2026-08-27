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
