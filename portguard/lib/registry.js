'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const DEFAULT_RANGE = { start: 3100, end: 3999 };
const DEFAULT_RESERVED_PORTS = [3000, 3001];
const DEFAULT_HOST = '127.0.0.1';

function defaultRegistryPath(home = os.homedir()) {
  return process.env.PORTGUARD_REGISTRY || path.join(home, '.404labs', 'portguard', 'registry.json');
}

function emptyRegistry() {
  return {
    version: 1,
    projects: {},
    ports: {},
  };
}

function normalizeRegistry(data) {
  const normalized = data && typeof data === 'object' ? data : emptyRegistry();
  if (normalized.version !== 1) normalized.version = 1;
  if (!normalized.projects || typeof normalized.projects !== 'object') normalized.projects = {};
  if (!normalized.ports || typeof normalized.ports !== 'object') normalized.ports = {};
  return normalized;
}

function readRegistry(registryPath = defaultRegistryPath()) {
  if (!fs.existsSync(registryPath)) return emptyRegistry();
  const raw = fs.readFileSync(registryPath, 'utf8');
  if (!raw.trim()) return emptyRegistry();
  return normalizeRegistry(JSON.parse(raw));
}

function writeRegistry(registryPath, data) {
  const normalized = normalizeRegistry(data);
  normalized.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const tmp = `${registryPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`);
  fs.renameSync(tmp, registryPath);
}

function parseRange(raw) {
  if (!raw) {
    raw = process.env.PORTGUARD_RANGE || `${DEFAULT_RANGE.start}-${DEFAULT_RANGE.end}`;
  }
  if (typeof raw === 'object' && Number.isInteger(raw.start) && Number.isInteger(raw.end)) {
    return validateRange(raw.start, raw.end);
  }
  const match = String(raw).trim().match(/^(\d{1,5})\s*[-:]\s*(\d{1,5})$/);
  if (!match) throw new Error(`invalid port range: ${raw}`);
  return validateRange(Number(match[1]), Number(match[2]));
}

function validateRange(start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) {
    throw new Error(`invalid port range: ${start}-${end}`);
  }
  return { start, end };
}

function parsePortList(raw) {
  if (raw === undefined || raw === null) raw = process.env.PORTGUARD_RESERVED || DEFAULT_RESERVED_PORTS.join(',');
  if (Array.isArray(raw)) return new Set(raw.map(Number).filter(Number.isInteger));
  const text = String(raw).trim();
  if (!text) return new Set();
  const ports = text.split(',').map((part) => Number(part.trim())).filter(Number.isInteger);
  for (const port of ports) {
    if (port < 1 || port > 65535) throw new Error(`invalid reserved port: ${port}`);
  }
  return new Set(ports);
}

function canonicalPath(inputPath) {
  const resolved = path.resolve(inputPath || process.cwd());
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function resolveProjectRoot(projectPath = process.cwd(), { gitRoot = true } = {}) {
  const resolved = canonicalPath(projectPath);
  if (!gitRoot) return resolved;
  try {
    const root = childProcess.execFileSync('git', ['-C', resolved, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (root) return canonicalPath(root);
  } catch {
    // Non-git projects still get a stable path key.
  }
  return resolved;
}

function projectName(root, explicitName) {
  const raw = explicitName || path.basename(root) || 'project';
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function canBind(port, host = DEFAULT_HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const finish = (available, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ available, error });
    };
    const timer = setTimeout(() => {
      server.close(() => finish(false, new Error('timeout')));
    }, 1000);
    server.once('error', (error) => finish(false, error));
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => finish(true));
    });
    server.unref();
  });
}

async function defaultIsPortAvailable(port, host = DEFAULT_HOST) {
  const result = await canBind(port, host);
  return result.available;
}

async function checkPort({ port, host = DEFAULT_HOST, isPortAvailable = defaultIsPortAvailable }) {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`invalid port: ${port}`);
  }
  const available = await isPortAvailable(parsed, host);
  return {
    port: parsed,
    host,
    available,
    status: available ? 'free' : 'occupied',
  };
}

function portWasEverUsed(data, port) {
  return Boolean(data.ports[String(port)]);
}

async function findAvailablePort({ data, range, reservedPorts, host, isPortAvailable }) {
  for (let port = range.start; port <= range.end; port++) {
    if (reservedPorts.has(port)) continue;
    if (portWasEverUsed(data, port)) continue;
    if (await isPortAvailable(port, host)) return port;
  }
  return null;
}

async function assignPort(options = {}) {
  const registryPath = options.registryPath || defaultRegistryPath();
  const data = readRegistry(registryPath);
  const range = parseRange(options.range);
  const reservedPorts = parsePortList(options.reservedPorts);
  const host = options.host || DEFAULT_HOST;
  const isPortAvailable = options.isPortAvailable || defaultIsPortAvailable;
  const project = resolveProjectRoot(options.projectPath || process.cwd(), { gitRoot: options.gitRoot !== false });
  const name = projectName(project, options.name);
  const now = new Date().toISOString();
  const existing = data.projects[project];

  if (existing && !options.reassign) {
    const available = await isPortAvailable(existing.port, host);
    data.projects[project] = {
      ...existing,
      name: existing.name || name,
      host,
      lastCheckedAt: now,
      lastKnownAvailable: available,
      updatedAt: now,
    };
    writeRegistry(registryPath, data);
    return {
      ok: !(options.strict && !available),
      code: options.strict && !available ? 'assigned_port_occupied' : 'assigned',
      source: 'existing',
      project,
      name: data.projects[project].name,
      port: existing.port,
      host,
      url: `http://localhost:${existing.port}`,
      available,
      registryPath,
    };
  }

  let previousPort = null;
  if (existing && options.reassign) {
    previousPort = existing.port;
    const record = data.ports[String(previousPort)] || {};
    data.ports[String(previousPort)] = {
      ...record,
      project,
      name: record.name || existing.name || name,
      status: 'superseded',
      updatedAt: now,
      supersededAt: now,
    };
  }

  const port = await findAvailablePort({ data, range, reservedPorts, host, isPortAvailable });
  if (!port) {
    return {
      ok: false,
      code: 'no_available_port',
      project,
      name,
      range: `${range.start}-${range.end}`,
      host,
      registryPath,
    };
  }

  const assignedAt = existing && existing.assignedAt ? existing.assignedAt : now;
  data.projects[project] = {
    project,
    name,
    port,
    host,
    range: `${range.start}-${range.end}`,
    assignedAt,
    updatedAt: now,
    lastCheckedAt: now,
    lastKnownAvailable: true,
  };
  data.ports[String(port)] = {
    project,
    name,
    status: 'assigned',
    assignedAt: now,
    updatedAt: now,
  };
  writeRegistry(registryPath, data);

  return {
    ok: true,
    code: existing && options.reassign ? 'reassigned' : 'assigned',
    source: existing && options.reassign ? 'reassigned' : 'new',
    previousPort,
    project,
    name,
    port,
    host,
    url: `http://localhost:${port}`,
    available: true,
    registryPath,
  };
}

function listAssignments({ registryPath = defaultRegistryPath() } = {}) {
  const data = readRegistry(registryPath);
  return Object.values(data.projects)
    .sort((a, b) => a.port - b.port || a.project.localeCompare(b.project))
    .map((entry) => ({ ...entry, url: `http://localhost:${entry.port}` }));
}

function releaseProject(options = {}) {
  const registryPath = options.registryPath || defaultRegistryPath();
  const data = readRegistry(registryPath);
  const project = resolveProjectRoot(options.projectPath || process.cwd(), { gitRoot: options.gitRoot !== false });
  const existing = data.projects[project];
  if (!existing) {
    return { ok: false, code: 'not_assigned', project, registryPath };
  }
  const now = new Date().toISOString();
  const record = data.ports[String(existing.port)] || {};
  data.ports[String(existing.port)] = {
    ...record,
    project,
    name: existing.name,
    status: 'retired',
    updatedAt: now,
    retiredAt: now,
  };
  delete data.projects[project];
  writeRegistry(registryPath, data);
  return {
    ok: true,
    code: 'released',
    project,
    name: existing.name,
    port: existing.port,
    registryPath,
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_RANGE,
  DEFAULT_RESERVED_PORTS,
  assignPort,
  canBind,
  checkPort,
  defaultRegistryPath,
  listAssignments,
  parsePortList,
  parseRange,
  readRegistry,
  releaseProject,
  resolveProjectRoot,
  writeRegistry,
};
