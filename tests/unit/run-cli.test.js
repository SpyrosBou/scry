'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildRunContext, parseCli } = require('../../utils/run-cli');

test('buildRunContext rejects the legacy discover flag', () => {
  const argv = parseCli(['--site', 'example-live', '--responsive', '--discover']);

  assert.throws(() => buildRunContext(argv), /--discover` no longer runs through `run-tests\.js/);
});

test('buildRunContext rejects the legacy update-baselines flag', () => {
  const argv = parseCli(['--site', 'example-live', '--responsive', '--update-baselines']);

  assert.throws(
    () => buildRunContext(argv),
    /--update-baselines` no longer runs through `run-tests\.js/
  );
});

test('buildRunContext keeps execution-only runner defaults intact', () => {
  const argv = parseCli(['--site', 'example-live', '--responsive']);
  const context = buildRunContext(argv);

  assert.deepStrictEqual(context.sites, ['example-live']);
  assert.strictEqual(context.options.limit, '5');
  assert.strictEqual(context.options.responsive, true);
  assert.strictEqual(context.options.visual, false);
  assert.strictEqual(context.options.dryRun, false);
  assert.strictEqual(context.options.outputWriter, null);
});
