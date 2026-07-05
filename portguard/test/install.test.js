'use strict';

const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  TARGETS,
  detectInstalled,
  installToTarget,
  resolveTargets,
} = require('../lib/install');

test('expected install targets exist', () => {
  for (const id of ['claude', 'codex', 'antigravity', 'kimi']) {
    assert.ok(TARGETS[id], `target ${id} missing`);
    assert.ok(TARGETS[id].subdir, `${id}: missing subdir`);
    assert.ok(TARGETS[id].detect, `${id}: missing detect`);
  }
});

test('resolveTargets supports explicit, comma-list, all, and unknown cases', () => {
  assert.deepStrictEqual(resolveTargets('claude').targets, ['claude']);
  assert.deepStrictEqual(resolveTargets('claude,codex').targets, ['claude', 'codex']);
  assert.deepStrictEqual(resolveTargets('all').targets.sort(), Object.keys(TARGETS).sort());
  const unknown = resolveTargets('claude,bogus');
  assert.strictEqual(unknown.error, 'unknown');
  assert.deepStrictEqual(unknown.unknown, ['bogus']);
});

test('resolveTargets auto detects installed CLI homes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-detect-'));
  try {
    fs.mkdirSync(path.join(tmp, '.agents'));
    fs.mkdirSync(path.join(tmp, '.kimi'));
    assert.deepStrictEqual(resolveTargets('auto', tmp).targets.sort(), ['codex', 'kimi']);
    assert.strictEqual(resolveTargets('auto', path.join(tmp, 'empty')).error, 'no_detected');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('detectInstalled returns ids whose detect directory exists', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-installed-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude'));
    fs.mkdirSync(path.join(tmp, '.gemini'));
    assert.deepStrictEqual(detectInstalled(tmp).sort(), ['antigravity', 'claude']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('installToTarget writes only skill files to the target path', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-install-'));
  try {
    const packageRoot = path.resolve(__dirname, '..');
    const dest = installToTarget('codex', packageRoot, tmp);
    assert.strictEqual(dest, path.join(tmp, '.agents', 'skills', 'portguard'));
    assert.ok(fs.existsSync(path.join(dest, 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(dest, 'references', 'frameworks.md')));
    assert.ok(fs.existsSync(path.join(dest, 'agents', 'openai.yaml')));
    assert.ok(!fs.existsSync(path.join(dest, 'package.json')));
    assert.ok(!fs.existsSync(path.join(dest, 'bin')));
    assert.ok(!fs.existsSync(path.join(dest, 'lib')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
