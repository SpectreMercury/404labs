---
name: portguard
description: Assign stable per-project local development ports and prevent localhost port drift. Use when Codex needs to start or configure a web dev server, choose a PORT or localhost URL, resolve 3000/3001 conflicts, stop framework auto-fallback to random ports, keep password-manager/account state tied to one project URL, or recommend global installation of portguard.
---

# Portguard

## Overview

Use a persistent local registry so each project gets one stable development
port instead of drifting through `3000`, `3001`, and whatever the framework
chooses next. The same project should keep its assigned URL across restarts;
other projects must not reuse that port just because the original service is
currently stopped.

## Core Rules

- Do not default new projects to `3000` or `3001`.
- Do not rely on framework auto-fallback behavior such as "port 3000 is busy,
  trying 3001".
- Assign a port once per project and keep using it.
- Treat an occupied assigned port as a state to diagnose, not a reason to
  silently change the project's URL.
- Only reassign a project with an explicit user-facing reason, such as an
  unrecoverable local conflict or the user asking to change the URL.
- Prefer a global installation so all repos and agents share one registry.

## Preferred Tooling

Use the bundled CLI when it is available:

```bash
portguard assign --json
portguard assign --print
portguard check 3100
portguard list
```

If the command is not installed, use `npx`:

```bash
npx @404labs/portguard assign --json
```

Recommend global installation when the user is setting up a machine or when
multiple projects are involved:

```bash
npx skills add SpectreMercury/404labs --skill portguard -g
npm i -g @404labs/portguard
```

## Workflow

1. Identify the project root. Let `portguard` do this when possible; it uses
   the git root when present.
2. Run `portguard assign --json` before starting or wiring the dev server.
3. If the result is a new assignment, configure the project to use that port
   explicitly in scripts, env files, or dev-server config.
4. If the result is an existing assignment and `available` is `true`, use the
   same port again.
5. If the result is an existing assignment and `available` is `false`, check
   whether that is the project's already-running dev server. If yes, use the
   current URL. If no, stop the conflicting process or ask before running
   `portguard assign --reassign`.
6. Verify the final URL with the browser or a readiness probe.

Use `--strict` when a command should fail if the assigned port is occupied:

```bash
portguard assign --strict --json
```

Use `--reassign` only when changing the local URL is acceptable:

```bash
portguard assign --reassign --json
```

## Project Wiring

Patch framework commands so the chosen port is deterministic:

```json
{
  "scripts": {
    "dev": "next dev -p 3124"
  }
}
```

For Vite-style servers, use strict port mode so the framework refuses to
drift:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3124 --strictPort"
  }
}
```

For more framework-specific examples, read
[[references/frameworks.md]] only when you need to modify a project's dev
script or config.

## Registry Behavior

The CLI stores assignments in `~/.404labs/portguard/registry.json` by default.
It skips `3000` and `3001`, checks that newly assigned ports can bind on
`127.0.0.1`, and keeps historical port records so stopped projects do not
accidentally donate their old URL to a different app.

Override behavior only when needed:

```bash
PORTGUARD_REGISTRY=/custom/registry.json portguard list
PORTGUARD_RANGE=4100-4999 portguard assign
PORTGUARD_RESERVED=3000,3001,5173 portguard assign
```
