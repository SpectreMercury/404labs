#!/usr/bin/env node
'use strict';

const { install } = require('../lib/install');
const {
  assignPort,
  checkPort,
  listAssignments,
  releaseProject,
} = require('../lib/registry');

const HELP = `portguard - stable local dev ports per project

Usage:
  portguard assign [flags]      Assign or read this project's stable port
  portguard check <port>        Check whether a port is available
  portguard list                List active project assignments
  portguard release [flags]     Retire this project's assignment
  portguard install [flags]     Install as an agent skill
  portguard --help              Show this help

Assign flags:
  --project <path>      Project path. Default: current working directory.
  --name <name>         Display name stored in the registry.
  --range <start-end>   Search range. Default: 3100-3999.
  --reserved <ports>    Comma list to skip. Default: 3000,3001.
  --host <host>         Bind-check host. Default: 127.0.0.1.
  --registry <path>     Registry file. Default: ~/.404labs/portguard/registry.json.
  --json                Machine-readable output.
  --print               Print only the assigned port.
  --strict              Exit 1 if the existing assigned port is occupied.
  --reassign            Explicitly move the project to a new never-used free port.
  --no-git-root         Key the exact path instead of the git root.

Install flags:
  --target <spec>       auto, all, or comma list: claude,codex,antigravity,kimi
  --list-targets        Print install targets and exit

Environment:
  PORTGUARD_REGISTRY    Override registry path
  PORTGUARD_RANGE       Override search range, e.g. 4100-4999
  PORTGUARD_RESERVED    Override reserved ports, e.g. 3000,3001,5173
`;

function hasFlag(argv, name) {
  return argv.includes(name);
}

function getFlagValue(argv, name) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === name) return argv[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function firstPositional(argv) {
  const valueFlags = new Set([
    '--host',
    '--name',
    '--port',
    '--project',
    '--range',
    '--registry',
    '--reserved',
    '--target',
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('-')) {
      if (valueFlags.has(arg) && i + 1 < argv.length && !argv[i + 1].startsWith('-')) i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printAssign(result) {
  if (!result.port) {
    process.stderr.write(
      `No available port found for ${result.project} in range ${result.range}.\n` +
      'Increase --range or retire unused assignments intentionally.\n'
    );
    return;
  }
  process.stdout.write('portguard assignment\n\n');
  process.stdout.write(`  project:  ${result.project}\n`);
  process.stdout.write(`  name:     ${result.name}\n`);
  process.stdout.write(`  port:     ${result.port}\n`);
  process.stdout.write(`  url:      ${result.url}\n`);
  process.stdout.write(`  source:   ${result.source}\n`);
  process.stdout.write(`  status:   ${result.available ? 'free' : 'occupied'}\n`);
  process.stdout.write(`  registry: ${result.registryPath}\n`);
  if (result.previousPort) process.stdout.write(`  previous: ${result.previousPort}\n`);

  if (!result.available) {
    process.stdout.write(
      '\nThe assigned port is occupied. If that is this project already running, keep using it.\n' +
      'If it is a different process, stop the conflict or run `portguard assign --reassign` intentionally.\n'
    );
  } else {
    process.stdout.write(`\nUse: PORT=${result.port} npm run dev\n`);
  }
}

function printCheck(result) {
  process.stdout.write(`portguard check\n\n  ${result.host}:${result.port}  ${result.status}\n`);
}

function printList(rows) {
  if (rows.length === 0) {
    process.stdout.write('No active portguard assignments.\n');
    return;
  }
  process.stdout.write('portguard assignments\n\n');
  for (const row of rows) {
    process.stdout.write(`  ${String(row.port).padEnd(5)} ${row.name.padEnd(24)} ${row.project}\n`);
  }
}

function parseAssignOptions(argv) {
  return {
    projectPath: getFlagValue(argv, '--project'),
    name: getFlagValue(argv, '--name'),
    range: getFlagValue(argv, '--range'),
    reservedPorts: getFlagValue(argv, '--reserved'),
    host: getFlagValue(argv, '--host'),
    registryPath: getFlagValue(argv, '--registry'),
    strict: hasFlag(argv, '--strict'),
    reassign: hasFlag(argv, '--reassign'),
    gitRoot: !hasFlag(argv, '--no-git-root'),
  };
}

function parseInstallFlags(argv) {
  return {
    target: getFlagValue(argv, '--target'),
    listTargets: hasFlag(argv, '--list-targets'),
  };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(HELP);
    return;
  }

  switch (cmd) {
    case 'assign': {
      const result = await assignPort(parseAssignOptions(rest));
      if (hasFlag(rest, '--json')) {
        printJson(result);
      } else if (hasFlag(rest, '--print')) {
        if (result.ok) process.stdout.write(`${result.port}\n`);
      } else {
        printAssign(result);
      }
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'check': {
      const port = getFlagValue(rest, '--port') || firstPositional(rest);
      const result = await checkPort({
        port,
        host: getFlagValue(rest, '--host'),
      });
      if (hasFlag(rest, '--json')) printJson(result);
      else printCheck(result);
      process.exit(result.available ? 0 : 1);
      break;
    }
    case 'list': {
      const rows = listAssignments({ registryPath: getFlagValue(rest, '--registry') });
      if (hasFlag(rest, '--json')) printJson(rows);
      else printList(rows);
      break;
    }
    case 'release': {
      const result = releaseProject({
        projectPath: getFlagValue(rest, '--project'),
        registryPath: getFlagValue(rest, '--registry'),
        gitRoot: !hasFlag(rest, '--no-git-root'),
      });
      if (hasFlag(rest, '--json')) printJson(result);
      else if (result.ok) process.stdout.write(`Released ${result.name} (${result.port}). The port remains retired and will not be reused automatically.\n`);
      else process.stderr.write(`No assignment found for ${result.project}\n`);
      process.exit(result.ok ? 0 : 1);
      break;
    }
    case 'install':
      install(parseInstallFlags(rest));
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
      process.exit(2);
  }
}

main().catch((error) => {
  process.stderr.write(`portguard: ${error.message}\n`);
  process.exit(2);
});
