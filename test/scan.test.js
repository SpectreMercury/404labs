'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PATTERNS, looksLikePlaceholder } = require('../lib/patterns');
const { parseAddedLines, scanContent } = require('../lib/scan');
const { isSensitiveFile } = require('../lib/gitignore');

// ---------- pattern coverage ----------

const FIXTURES = [
  { id: 'aws-access-key',  line: 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"' },
  { id: 'gh-pat-classic',  line: 'export GH=ghp_abcdefghijklmnopqrstuvwxyz0123456789' },
  { id: 'gh-pat-fine',     line: 'token: github_pat_11AAAAAAA0' + 'a'.repeat(72) },
  { id: 'anthropic-key',   line: 'k = "sk-ant-api03-' + 'A'.repeat(80) + '"' },
  { id: 'openai-proj',     line: 'OPENAI=sk-proj-' + 'A'.repeat(60) },
  { id: 'gcp-api-key',     line: 'apiKey: "AIzaSy' + 'A'.repeat(33) + '"' },
  { id: 'gcp-sa-json',     line: '"type": "service_account",' },
  { id: 'slack-token',     line: 'SLACK=xoxb-1234567890-abcdefghij' },
  { id: 'slack-webhook',   line: 'url=https://hooks.slack.com/services/T0/B0/abcDEF' },
  { id: 'stripe-live',     line: 'STRIPE_SECRET=sk_live_' + 'A'.repeat(30) },
  { id: 'npm-token',       line: '//registry.npmjs.org/:_authToken=npm_' + 'A'.repeat(36) },
  { id: 'mongodb-uri',     line: 'MONGO=mongodb+srv://admin:Hunter2@cluster0.mongodb.net/db' },
  { id: 'private-key',     line: '-----BEGIN RSA PRIVATE KEY-----' },
  { id: 'jwt',             line: 'tok = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"' },
];

test('every fixture is detected by its declared pattern', () => {
  for (const fix of FIXTURES) {
    const p = PATTERNS.find((x) => x.id === fix.id);
    assert.ok(p, `pattern ${fix.id} missing from PATTERNS`);
    assert.match(fix.line, p.regex, `pattern ${fix.id} failed to match its fixture`);
  }
});

test('scanContent flags BLOCK-level secrets', () => {
  const added = [{ file: 'src/x.ts', line: 1, content: 'KEY="AKIAIOSFODNN7EXAMPLE"' }];
  const findings = scanContent(added, { strict: false });
  assert.ok(findings.some((f) => f.patternId === 'aws-access-key' && f.severity === 'BLOCK'));
});

test('strictOnly patterns require --strict', () => {
  const added = [{ file: 'a.js', line: 1, content: 'const password = "hunter2hunter2"' }];
  const off = scanContent(added, { strict: false });
  const on  = scanContent(added, { strict: true });
  assert.strictEqual(off.filter((f) => f.patternId === 'generic-secret').length, 0);
  assert.ok(on.some((f) => f.patternId === 'generic-secret'));
});

test('placeholder strings are downgraded to WARN', () => {
  // openai-key fixture but with placeholder hint
  const added = [{ file: 'a.js', line: 1, content: 'OPENAI="sk-YOUR_API_KEY_HERE' + 'a'.repeat(20) + '"' }];
  const findings = scanContent(added, { strict: false });
  for (const f of findings) {
    assert.strictEqual(f.severity, 'WARN', `expected WARN for placeholder, got ${f.severity}`);
  }
});

test('looksLikePlaceholder catches common placeholders', () => {
  assert.strictEqual(looksLikePlaceholder('key = "YOUR_API_KEY_HERE"'), true);
  assert.strictEqual(looksLikePlaceholder('key = "<YOUR_API_KEY>"'),    true);
  assert.strictEqual(looksLikePlaceholder('key = "changeme"'),          true);
  assert.strictEqual(looksLikePlaceholder('key = "real-looking-zzz"'),  false);
});

// ---------- diff parsing ----------

test('parseAddedLines extracts +lines with correct file and line number', () => {
  const diff = [
    'diff --git a/src/x.ts b/src/x.ts',
    '--- a/src/x.ts',
    '+++ b/src/x.ts',
    '@@ -10,0 +11,2 @@',
    '+const k = "hello";',
    '+const v = 42;',
  ].join('\n');
  const added = parseAddedLines(diff);
  assert.strictEqual(added.length, 2);
  assert.strictEqual(added[0].file, 'src/x.ts');
  assert.strictEqual(added[0].line, 11);
  assert.strictEqual(added[0].content, 'const k = "hello";');
  assert.strictEqual(added[1].line, 12);
});

// ---------- sensitive file detection ----------

test('isSensitiveFile recognises common dangerous paths', () => {
  assert.strictEqual(isSensitiveFile('.env'),                   true);
  assert.strictEqual(isSensitiveFile('.env.production'),        true);
  assert.strictEqual(isSensitiveFile('app/.env.local'),         true);
  assert.strictEqual(isSensitiveFile('certs/server.pem'),       true);
  assert.strictEqual(isSensitiveFile('certs/server.key'),       true);
  assert.strictEqual(isSensitiveFile('.ssh/id_rsa'),            true);
  assert.strictEqual(isSensitiveFile('config/service-account.json'), true);
  assert.strictEqual(isSensitiveFile('.aws/credentials'),       true);
});

test('isSensitiveFile allows clearly-safe placeholders', () => {
  assert.strictEqual(isSensitiveFile('.env.example'),  false);
  assert.strictEqual(isSensitiveFile('.env.sample'),   false);
  assert.strictEqual(isSensitiveFile('.env.template'), false);
  assert.strictEqual(isSensitiveFile('README.md'),     false);
  assert.strictEqual(isSensitiveFile('src/index.ts'),  false);
});
