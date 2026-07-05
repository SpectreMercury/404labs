'use strict';

const assert = require('node:assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  assignPort,
  checkPort,
  listAssignments,
  readRegistry,
  releaseProject,
} = require('../lib/registry');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function withServer(fn) {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('assignPort skips 3000 and 3001 by default even when available', async () => {
  const tmp = tempDir('pg-reserved-');
  try {
    const project = mkdirp(path.join(tmp, 'app'));
    const registryPath = path.join(tmp, 'registry.json');
    const result = await assignPort({
      projectPath: project,
      registryPath,
      range: '3000-3002',
      gitRoot: false,
      isPortAvailable: async () => true,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.port, 3002);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assignPort keeps one stable port for repeated project runs', async () => {
  const tmp = tempDir('pg-stable-');
  try {
    const project = mkdirp(path.join(tmp, 'app'));
    const registryPath = path.join(tmp, 'registry.json');
    const first = await assignPort({
      projectPath: project,
      registryPath,
      range: '4100-4105',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const second = await assignPort({
      projectPath: project,
      registryPath,
      range: '4100-4105',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    assert.strictEqual(first.port, second.port);
    assert.strictEqual(second.source, 'existing');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assignPort does not reuse a stopped project port for another project', async () => {
  const tmp = tempDir('pg-no-reuse-');
  try {
    const registryPath = path.join(tmp, 'registry.json');
    const one = await assignPort({
      projectPath: mkdirp(path.join(tmp, 'one')),
      registryPath,
      range: '4200-4205',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const two = await assignPort({
      projectPath: mkdirp(path.join(tmp, 'two')),
      registryPath,
      range: '4200-4205',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    assert.strictEqual(one.port, 4200);
    assert.strictEqual(two.port, 4201);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assignPort reports occupied existing ports without drifting', async () => {
  const tmp = tempDir('pg-occupied-');
  try {
    const project = mkdirp(path.join(tmp, 'app'));
    const registryPath = path.join(tmp, 'registry.json');
    const first = await assignPort({
      projectPath: project,
      registryPath,
      range: '4300-4305',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const second = await assignPort({
      projectPath: project,
      registryPath,
      range: '4300-4305',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => false,
    });
    const strict = await assignPort({
      projectPath: project,
      registryPath,
      range: '4300-4305',
      gitRoot: false,
      reservedPorts: '',
      strict: true,
      isPortAvailable: async () => false,
    });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.available, false);
    assert.strictEqual(second.port, first.port);
    assert.strictEqual(strict.ok, false);
    assert.strictEqual(strict.code, 'assigned_port_occupied');
    assert.strictEqual(strict.port, first.port);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('assignPort only changes stable URL with explicit reassign', async () => {
  const tmp = tempDir('pg-reassign-');
  try {
    const project = mkdirp(path.join(tmp, 'app'));
    const registryPath = path.join(tmp, 'registry.json');
    const first = await assignPort({
      projectPath: project,
      registryPath,
      range: '4400-4405',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const second = await assignPort({
      projectPath: project,
      registryPath,
      range: '4400-4405',
      gitRoot: false,
      reservedPorts: '',
      reassign: true,
      isPortAvailable: async () => true,
    });
    const registry = readRegistry(registryPath);
    assert.strictEqual(second.previousPort, first.port);
    assert.strictEqual(second.port, 4401);
    assert.strictEqual(registry.ports[String(first.port)].status, 'superseded');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('releaseProject retires the port instead of making it reusable', async () => {
  const tmp = tempDir('pg-release-');
  try {
    const registryPath = path.join(tmp, 'registry.json');
    const project = mkdirp(path.join(tmp, 'app'));
    const first = await assignPort({
      projectPath: project,
      registryPath,
      range: '4500-4502',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const released = releaseProject({ projectPath: project, registryPath, gitRoot: false });
    const second = await assignPort({
      projectPath: mkdirp(path.join(tmp, 'other')),
      registryPath,
      range: '4500-4502',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    assert.strictEqual(released.ok, true);
    assert.strictEqual(released.port, first.port);
    assert.strictEqual(second.port, 4501);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('checkPort detects an occupied local TCP port', async () => {
  await withServer(async (port) => {
    const result = await checkPort({ port });
    assert.strictEqual(result.available, false);
    assert.strictEqual(result.status, 'occupied');
  });
});

test('listAssignments returns active assignments sorted by port', async () => {
  const tmp = tempDir('pg-list-');
  try {
    const registryPath = path.join(tmp, 'registry.json');
    await assignPort({
      projectPath: mkdirp(path.join(tmp, 'a')),
      registryPath,
      range: '4600-4605',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    await assignPort({
      projectPath: mkdirp(path.join(tmp, 'b')),
      registryPath,
      range: '4600-4605',
      gitRoot: false,
      reservedPorts: '',
      isPortAvailable: async () => true,
    });
    const rows = listAssignments({ registryPath });
    assert.deepStrictEqual(rows.map((row) => row.port), [4600, 4601]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
