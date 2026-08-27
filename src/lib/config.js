import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_MIN_REFRESH_DELAY = 20;
const DEFAULT_MAX_REFRESH_DELAY = 60;

function describeRefreshDelayError(minRefreshDelay, maxRefreshDelay, source) {
  const invalid = [];

  if (!Number.isFinite(minRefreshDelay) || minRefreshDelay <= 0) {
    invalid.push(`${source.min}=${JSON.stringify(source.minRaw)} (resolved to ${minRefreshDelay})`);
  }

  if (!Number.isFinite(maxRefreshDelay) || maxRefreshDelay <= 0) {
    invalid.push(`${source.max}=${JSON.stringify(source.maxRaw)} (resolved to ${maxRefreshDelay})`);
  }

  if (invalid.length > 0) {
    return `Invalid refresh delay value(s): ${invalid.join(', ')}. Expected a positive number of seconds.`;
  }

  if (minRefreshDelay > maxRefreshDelay) {
    return `Invalid refresh delay range: ${source.min} (${minRefreshDelay}) must not be greater than ${source.max} (${maxRefreshDelay}).`;
  }

  return null;
}

export function resolveRefreshDelayRange(env) {
  const explicitMin = env.MIN_REFRESH_DELAY;
  const explicitMax = env.MAX_REFRESH_DELAY;

  if (explicitMin || explicitMax) {
    const minRefreshDelay = Number(explicitMin || explicitMax);
    const maxRefreshDelay = Number(explicitMax || explicitMin);
    const error = describeRefreshDelayError(minRefreshDelay, maxRefreshDelay, {
      min: 'MIN_REFRESH_DELAY',
      max: 'MAX_REFRESH_DELAY',
      minRaw: explicitMin ?? explicitMax,
      maxRaw: explicitMax ?? explicitMin
    });

    return { minRefreshDelay, maxRefreshDelay, error };
  }

  if (env.REFRESH_DELAY) {
    const fixed = Number(env.REFRESH_DELAY);
    const error = describeRefreshDelayError(fixed, fixed, {
      min: 'REFRESH_DELAY',
      max: 'REFRESH_DELAY',
      minRaw: env.REFRESH_DELAY,
      maxRaw: env.REFRESH_DELAY
    });

    return { minRefreshDelay: fixed, maxRefreshDelay: fixed, error };
  }

  return {
    minRefreshDelay: DEFAULT_MIN_REFRESH_DELAY,
    maxRefreshDelay: DEFAULT_MAX_REFRESH_DELAY,
    error: null
  };
}

export function parseBlacklistDates(raw) {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(date => date.trim())
    .filter(date => date.length > 0);
}

export function getConfig() {
  const { minRefreshDelay, maxRefreshDelay, error: refreshDelayError } = resolveRefreshDelayRange(process.env);

  if (refreshDelayError) {
    console.error(refreshDelayError);
    process.exit(1);
  }

  const config = {
    email: process.env.EMAIL,
    password: process.env.PASSWORD,
    scheduleId: process.env.SCHEDULE_ID,
    facilityId: process.env.FACILITY_ID,
    countryCode: process.env.COUNTRY_CODE,
    minRefreshDelay,
    maxRefreshDelay,
    blacklistDates: parseBlacklistDates(process.env.BLACKLIST_DATES)
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
