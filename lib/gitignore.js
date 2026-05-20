'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Minimum entries we expect every .gitignore to cover, regardless of stack.
const ESSENTIAL_ENTRIES = [
  { test: (g) => /^\.env(\.|$|\*)/m.test(g),               hint: '.env / .env.*' },
  { test: (g) => /\*\.pem/m.test(g) || /\.pem/m.test(g),   hint: '*.pem' },
  { test: (g) => /\*\.key/m.test(g) || /\.key/m.test(g),   hint: '*.key' },
  { test: (g) => /id_rsa|id_ed25519/.test(g),              hint: 'id_rsa* / id_ed25519*' },
  { test: (g) => /\.aws/.test(g),                          hint: '.aws/' },
];

// Files that should never be tracked. Matched against basename and full path.
const SENSITIVE_FILE_PATTERNS = [
  /^\.env(?!\.example|\.sample|\.template|\.dist)(\..+)?$/,
  /\.pem$/,
  /(^|\/)id_rsa(\..*)?$/,
  /(^|\/)id_ed25519(\..*)?$/,
  /(^|\/)id_ecdsa(\..*)?$/,
  /(^|\/).*\.key$/,
  /(^|\/).*\.p12$/,
  /(^|\/).*\.pfx$/,
  /(^|\/)service-account.*\.json$/,
  /(^|\/)firebase-adminsdk.*\.json$/,
  /(^|\/)gcp-key.*\.json$/,
  /(^|\/)credentials(\.json)?$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)\.aws\/credentials$/,
];

function isSensitiveFile(filepath) {
  const base = path.basename(filepath);
  return SENSITIVE_FILE_PATTERNS.some((p) => p.test(filepath) || p.test(base));
}

function auditGitignore() {
  const findings = [];
  let content = '';
  let exists = false;

  try {
    content = fs.readFileSync('.gitignore', 'utf8');
    exists = true;
  } catch {
    findings.push({
      type: 'gitignore-missing',
      severity: 'BLOCK',
      message: 'No .gitignore at repo root',
      fix: 'Create one. See https://github.com/github/gitignore for stack templates.',
    });
    return { exists: false, findings };
  }

  for (const entry of ESSENTIAL_ENTRIES) {
    if (!entry.test(content)) {
      findings.push({
        type: 'gitignore-incomplete',
        severity: 'WARN',
        message: `.gitignore is missing an entry for ${entry.hint}`,
        fix: `Add a rule covering ${entry.hint} to .gitignore.`,
      });
    }
  }

  // Files already tracked that look sensitive: still leaking until git rm --cached'd.
  try {
    const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const file of tracked) {
      if (isSensitiveFile(file)) {
        findings.push({
          type: 'tracked-sensitive',
          severity: 'BLOCK',
          file,
          message: `Sensitive file already tracked in git: ${file}`,
          fix: `git rm --cached "${file}" && commit. Also add it to .gitignore. If the file ever held a real secret, rotate it.`,
        });
      }
    }
  } catch {
    // ignore: not a git repo or git unavailable
  }

  return { exists, findings };
}

function sensitiveFilesStaged({ all = false } = {}) {
  try {
    const cmd = all
      ? 'git status --porcelain'
      : 'git diff --cached --name-only';
    const raw = execSync(cmd, { encoding: 'utf8' });
    const files = raw
      .split('\n')
      .map((line) => (all ? line.slice(3) : line))
      .filter(Boolean);
    return files.filter(isSensitiveFile);
  } catch {
    return [];
  }
}

module.exports = {
  auditGitignore,
  sensitiveFilesStaged,
  isSensitiveFile,
  SENSITIVE_FILE_PATTERNS,
};
