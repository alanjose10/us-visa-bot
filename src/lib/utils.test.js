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
