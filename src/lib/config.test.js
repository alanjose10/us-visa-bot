import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRefreshDelayRange, parseBlacklistDates } from './config.js';

test('defaults to 20-60s when nothing is set', () => {
  assert.deepEqual(resolveRefreshDelayRange({}), { minRefreshDelay: 20, maxRefreshDelay: 60, error: null });
});

test('falls back to a fixed delay when only REFRESH_DELAY is set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ REFRESH_DELAY: '5' }),
    { minRefreshDelay: 5, maxRefreshDelay: 5, error: null }
  );
});

test('uses MIN/MAX_REFRESH_DELAY when both are set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '15', MAX_REFRESH_DELAY: '45' }),
    { minRefreshDelay: 15, maxRefreshDelay: 45, error: null }
  );
});

test('mirrors MIN_REFRESH_DELAY into max when only min is set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '25' }),
    { minRefreshDelay: 25, maxRefreshDelay: 25, error: null }
  );
});

test('mirrors MAX_REFRESH_DELAY into min when only max is set', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ MAX_REFRESH_DELAY: '35' }),
    { minRefreshDelay: 35, maxRefreshDelay: 35, error: null }
  );
});

test('MIN/MAX_REFRESH_DELAY takes priority over legacy REFRESH_DELAY', () => {
  assert.deepEqual(
    resolveRefreshDelayRange({ REFRESH_DELAY: '3', MIN_REFRESH_DELAY: '20', MAX_REFRESH_DELAY: '60' }),
    { minRefreshDelay: 20, maxRefreshDelay: 60, error: null }
  );
});

test('reports an error when MIN_REFRESH_DELAY is non-numeric', () => {
  const result = resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '20s', MAX_REFRESH_DELAY: '60' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /MIN_REFRESH_DELAY/);
});

test('reports an error when MAX_REFRESH_DELAY is non-numeric', () => {
  const result = resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '20', MAX_REFRESH_DELAY: 'oops' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /MAX_REFRESH_DELAY/);
});

test('reports an error when MIN_REFRESH_DELAY is negative', () => {
  const result = resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '-5', MAX_REFRESH_DELAY: '60' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /MIN_REFRESH_DELAY/);
});

test('reports an error when MAX_REFRESH_DELAY is zero', () => {
  const result = resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '20', MAX_REFRESH_DELAY: '0' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /MAX_REFRESH_DELAY/);
});

test('reports an error when MIN_REFRESH_DELAY is greater than MAX_REFRESH_DELAY', () => {
  const result = resolveRefreshDelayRange({ MIN_REFRESH_DELAY: '90', MAX_REFRESH_DELAY: '30' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /MIN_REFRESH_DELAY/);
  assert.match(result.error, /MAX_REFRESH_DELAY/);
});

test('reports an error when legacy REFRESH_DELAY is non-numeric', () => {
  const result = resolveRefreshDelayRange({ REFRESH_DELAY: 'twenty' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /REFRESH_DELAY/);
});

test('reports an error when legacy REFRESH_DELAY is negative', () => {
  const result = resolveRefreshDelayRange({ REFRESH_DELAY: '-10' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /REFRESH_DELAY/);
});

test('reports an error when legacy REFRESH_DELAY is zero', () => {
  const result = resolveRefreshDelayRange({ REFRESH_DELAY: '0' });
  assert.ok(result.error, 'expected an error to be reported');
  assert.match(result.error, /REFRESH_DELAY/);
});

test('parseBlacklistDates returns an empty array when unset', () => {
  assert.deepEqual(parseBlacklistDates(undefined), []);
});

test('parseBlacklistDates returns an empty array for an empty string', () => {
  assert.deepEqual(parseBlacklistDates(''), []);
});

test('parseBlacklistDates splits and trims a comma-separated list', () => {
  assert.deepEqual(parseBlacklistDates('2026-09-01, 2026-09-05 ,2026-09-08'), [
    '2026-09-01',
    '2026-09-05',
    '2026-09-08'
  ]);
});

test('parseBlacklistDates drops empty entries from stray commas', () => {
  assert.deepEqual(parseBlacklistDates('2026-09-01,,2026-09-05,'), ['2026-09-01', '2026-09-05']);
});

test('parseBlacklistDates handles a single date', () => {
  assert.deepEqual(parseBlacklistDates('2026-09-01'), ['2026-09-01']);
});
