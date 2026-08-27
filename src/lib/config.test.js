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
