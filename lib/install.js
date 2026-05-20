'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function install() {
  const skillSrc = path.resolve(__dirname, '..', 'skill');
  const claudeSkillsDir = path.join(os.homedir(), '.claude', 'skills');
  const dest = path.join(claudeSkillsDir, 'securitycheck');

  if (!fs.existsSync(skillSrc)) {
    process.stderr.write('securitycheck: skill/ not found in package — broken install?\n');
    process.exit(2);
  }

  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  copyRecursive(skillSrc, dest);

  process.stdout.write(`✔ Installed Claude Code skill to ${dest}\n`);
  process.stdout.write(`  Restart Claude Code so the skill index picks it up.\n`);
  process.stdout.write(`  Trigger it by saying "scan for secrets" or "review before commit".\n`);
}

module.exports = { install };
