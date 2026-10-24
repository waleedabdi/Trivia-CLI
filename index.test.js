const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  getDurationSetting,
  getPerformanceMessage,
  getScore,
  isValidAnswer,
  normalizeAnswer,
} = require('./index');

test('normalizes answers by trimming whitespace and ignoring case', () => {
  assert.equal(normalizeAnswer('  b '), 'B');
});

test('accepts only answer choices A through D', () => {
  assert.equal(isValidAnswer('A'), true);
  assert.equal(isValidAnswer('D'), true);
  assert.equal(isValidAnswer('E'), false);
  assert.equal(isValidAnswer(''), false);
});

test('returns feedback for perfect, passing, partial, and zero scores', () => {
  assert.match(getPerformanceMessage(5, 5), /Perfect/);
  assert.match(getPerformanceMessage(3, 5), /Nice work/);
  assert.match(getPerformanceMessage(2, 5), /Good effort/);
  assert.match(getPerformanceMessage(1, 5), /Good effort/);
  assert.match(getPerformanceMessage(0, 5), /clean slate/i);
  assert.match(getPerformanceMessage(0, 0), /No questions were answered/);
});

test('uses valid timer values and falls back for invalid parameters', () => {
  assert.equal(getDurationSetting('8', 15), 8);
  assert.equal(getDurationSetting('1.5', 15), 1.5);
  assert.equal(getDurationSetting('0', 15), 15);
  assert.equal(getDurationSetting('-3', 15), 15);
  assert.equal(getDurationSetting('not-a-number', 15), 15);
  assert.equal(getDurationSetting(undefined, 120), 120);
});

test('calculates the score from stored question results', () => {
  const results = [
    { correct: true },
    { correct: false },
    { correct: true },
  ];

  assert.equal(getScore(results), 2);
  assert.equal(getScore([]), 0);
});

test('uses piped answers even when they arrive before later questions are shown', () => {
  const result = spawnSync(process.execPath, [require.resolve('./index')], {
    encoding: 'utf8',
    input: 'B\nC\nB\nA\nD\n',
    env: {
      ...process.env,
      TRIVIA_TIME_LIMIT_SECONDS: '1',
      TRIVIA_GAME_DURATION_SECONDS: '10',
    },
    timeout: 5000,
  });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Final score: 5\/5 answered/);
  assert.match(result.stdout, /Perfect round/);
});