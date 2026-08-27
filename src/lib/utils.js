export function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function log(message) {
  console.log(`[${new Date().toISOString()}]`, message);
}

export function isSocketHangupError(err) {
  return err.code === 'ECONNRESET' ||
         err.code === 'ENOTFOUND' ||
         err.code === 'ETIMEDOUT' ||
         err.message.includes('socket hang up') ||
         err.message.includes('network') ||
         err.message.includes('connection');
}

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