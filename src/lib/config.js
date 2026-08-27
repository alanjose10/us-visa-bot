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
