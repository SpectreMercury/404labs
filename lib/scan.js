'use strict';

const { execSync } = require('child_process');
const { PATTERNS, looksLikePlaceholder } = require('./patterns');
const { auditGitignore, sensitiveFilesStaged } = require('./gitignore');

function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getDiff({ all }) {
  const cmd = all ? 'git diff -U0' : 'git diff --cached -U0';
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Parse a unified diff and yield { file, line, content } for each added line.
function parseAddedLines(diff) {
  const out = [];
  let file = null;
  let lineNum = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4);
      file = p.startsWith('b/') ? p.slice(2) : p;
      continue;
    }
    if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      lineNum = m ? parseInt(m[1], 10) : 0;
      continue;
    }
    if (raw.startsWith('+++') || raw.startsWith('---')) continue;
    if (raw.startsWith('+')) {
      out.push({ file, line: lineNum, content: raw.slice(1) });
      lineNum++;
    } else if (raw.startsWith('-') || raw.startsWith('\\')) {
      // removed line or "\ No newline at end of file"
    } else {
      lineNum++;
    }
  }
  return out;
}

function scanContent(addedLines, { strict }) {
  const findings = [];
  for (const { file, line, content } of addedLines) {
    for (const p of PATTERNS) {
      if (p.strictOnly && !strict) continue;
      if (!p.regex.test(content)) continue;
      const severity = looksLikePlaceholder(content) ? 'WARN' : p.severity;
      findings.push({
        type: 'content',
        severity,
        patternId: p.id,
        patternLabel: p.label,
        file,
        line,
        excerpt: truncate(content.trim(), 120),
      });
    }
  }
  return findings;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function colorize(enabled) {
  if (!enabled) return new Proxy({}, { get: () => (s) => s });
  return {
    red:    (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    green:  (s) => `\x1b[32m${s}\x1b[0m`,
    cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
    bold:   (s) => `\x1b[1m${s}\x1b[0m`,
    dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  };
}

function printReport({ findings, blockCount, warnCount, gitignoreExists, color }) {
  const c = colorize(color);
  const lines = [];

  lines.push(c.bold('securitycheck — pre-commit scan'));
  lines.push('');
  lines.push(`  .gitignore:      ${gitignoreExists ? c.green('present') : c.red('MISSING')}`);
  lines.push(`  BLOCK findings:  ${blockCount > 0 ? c.red(String(blockCount)) : c.green('0')}`);
  lines.push(`  WARN findings:   ${warnCount > 0 ? c.yellow(String(warnCount)) : c.green('0')}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push(c.green('  ✔ Clean. Safe to commit.'));
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  const byType = { block: [], warn: [] };
  for (const f of findings) {
    (f.severity === 'BLOCK' ? byType.block : byType.warn).push(f);
  }

  if (byType.block.length) {
    lines.push(c.red(c.bold('  BLOCK — do not commit:')));
    for (const f of byType.block) lines.push(formatFinding(f, c));
    lines.push('');
  }
  if (byType.warn.length) {
    lines.push(c.yellow(c.bold('  WARN — verify these manually:')));
    for (const f of byType.warn) lines.push(formatFinding(f, c));
    lines.push('');
  }

  if (blockCount > 0) {
    lines.push(c.red('  ✗ ' + blockCount + ' blocking finding(s). Refusing to commit.'));
    lines.push(c.dim('    Bypass (NOT recommended): SECURITYCHECK_SKIP=1 git commit ...'));
  } else {
    lines.push(c.yellow('  ! ' + warnCount + ' warning(s). Review before committing.'));
  }

  process.stdout.write(lines.join('\n') + '\n');
}

function formatFinding(f, c) {
  if (f.type === 'gitignore-missing' || f.type === 'gitignore-incomplete') {
    return `    • ${f.message}\n      ${c.dim('Fix:')} ${f.fix}`;
  }
  if (f.type === 'tracked-sensitive') {
    return `    • ${f.message}\n      ${c.dim('Fix:')} ${f.fix}`;
  }
  if (f.type === 'staged-sensitive') {
    return `    • ${c.bold(f.file)} — staged sensitive file\n      ${c.dim('Fix:')} git restore --staged "${f.file}" && add to .gitignore`;
  }
  if (f.type === 'content') {
    return `    • ${c.bold(f.file)}:${f.line} — ${f.patternLabel} [${f.patternId}]\n      ${c.dim(f.excerpt)}`;
  }
  return `    • ${JSON.stringify(f)}`;
}

function scan(flags = {}) {
  const opts = {
    all: !!flags.all,
    strict: !!flags.strict,
    json: !!flags.json,
    color: flags.color !== false,
    skipIgnore: !!flags.skipIgnore,
    skipFiles: !!flags.skipFiles,
    skipContent: !!flags.skipContent,
  };

  if (process.env.SECURITYCHECK_SKIP === '1') {
    if (!opts.json) process.stderr.write('securitycheck: SECURITYCHECK_SKIP=1, skipping scan\n');
    return { blockCount: 0, warnCount: 0, findings: [] };
  }

  if (!isGitRepo()) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: 'not a git repository' }) + '\n');
    } else {
      process.stderr.write('securitycheck: not a git repository\n');
    }
    process.exit(2);
  }

  const findings = [];
  let gitignoreExists = true;

  // Phase 1 — gitignore audit
  if (!opts.skipIgnore) {
    const giReport = auditGitignore();
    gitignoreExists = giReport.exists;
    findings.push(...giReport.findings);
  }

  // Phase 2 — staged sensitive files
  if (!opts.skipFiles) {
    const sens = sensitiveFilesStaged({ all: opts.all });
    for (const file of sens) {
      findings.push({
        type: 'staged-sensitive',
        severity: 'BLOCK',
        file,
        message: `Sensitive file is staged for commit: ${file}`,
      });
    }
  }

  // Phase 3 — diff content scan
  if (!opts.skipContent) {
    const diff = getDiff({ all: opts.all });
    const added = parseAddedLines(diff);
    findings.push(...scanContent(added, opts));
  }

  const blockCount = findings.filter((f) => f.severity === 'BLOCK').length;
  const warnCount  = findings.filter((f) => f.severity === 'WARN').length;

  if (opts.json) {
    process.stdout.write(JSON.stringify({ blockCount, warnCount, gitignoreExists, findings }, null, 2) + '\n');
  } else {
    printReport({ findings, blockCount, warnCount, gitignoreExists, color: opts.color });
  }

  return { blockCount, warnCount, findings };
}

module.exports = {
  scan,
  // exported for tests
  parseAddedLines,
  scanContent,
};
