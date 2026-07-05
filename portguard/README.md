# portguard

> Stable localhost ports for AI-built apps. Assign one durable port per
> project, skip the crowded `3000`/`3001` defaults, check occupancy, and stop
> framework auto-fallback from scrambling local accounts and password-manager
> entries.

AI coding agents often start every web app on `localhost:3000`, then drift to
`3001`, `3002`, or a random framework fallback when something is already
running. That makes browser profiles, OAuth callbacks, cookies, and password
managers point at the wrong project. `portguard` gives each project a stable
local URL and stores the assignment in a shared registry.

---

## What it does

`portguard` keeps a local registry at
`~/.404labs/portguard/registry.json`:

1. **Assigns once per project** - uses the git root when present, otherwise
   the current directory.
2. **Avoids common defaults** - skips `3000` and `3001` by default.
3. **Checks occupancy** - newly assigned ports must be bindable on
   `127.0.0.1`.
4. **Prevents silent reuse** - a port that belonged to one project is not
   given to another project just because the first server is stopped.
5. **Refuses silent drift** - an occupied existing assignment is reported;
   the URL changes only when you explicitly run `--reassign`.

---

## Install

### As an agent skill

**Recommended - global install via the
[Vercel Labs `skills` CLI](https://github.com/vercel-labs/skills)**
(supports 55+ agent CLIs and keeps this behavior available in every repo):

```bash
npx skills add SpectreMercury/404labs --skill portguard -g
```

Install to the current detected agent instead:

```bash
npx skills add SpectreMercury/404labs --skill portguard
```

Install to all detected/supported agents:

```bash
npx skills add SpectreMercury/404labs --skill portguard --all
```

### As a CLI

Install globally so all projects and agents share one command and one
registry:

```bash
npm i -g @404labs/portguard
```

Or use it through `npx`:

```bash
npx @404labs/portguard assign --json
```

### Built-in agent installer

The package can also copy the skill into common local agent folders:

```bash
npx @404labs/portguard install                      # auto-detect
npx @404labs/portguard install --target all         # install for all 4 supported
npx @404labs/portguard install --target claude,codex
npx @404labs/portguard install --list-targets
```

| Built-in target | CLI | Path |
|---|---|---|
| `claude` | Claude Code | `~/.claude/skills/portguard/` |
| `codex` | OpenAI Codex CLI | `~/.agents/skills/portguard/` |
| `antigravity` | Google Antigravity | `~/.gemini/antigravity/skills/portguard/` |
| `kimi` | Moonshot Kimi CLI | `~/.kimi/skills/portguard/` |

Restart your CLI after installing the skill so its index refreshes.

---

## Usage

Assign or read the current project's stable port:

```bash
portguard assign
```

Machine-readable output:

```bash
portguard assign --json
```

Print only the port for scripts:

```bash
PORT=$(portguard assign --print) npm run dev
```

Check whether a port is currently occupied:

```bash
portguard check 3124
```

List active assignments:

```bash
portguard list
```

Retire the current project's assignment without making the port reusable:

```bash
portguard release
```

Reassign only when you intentionally accept a new local URL:

```bash
portguard assign --reassign
```

Fail if the assigned port is occupied:

```bash
portguard assign --strict
```

---

## Example output

```text
portguard assignment

  project:  /Users/me/work/acme-dashboard
  name:     acme-dashboard
  port:     3104
  url:      http://localhost:3104
  source:   new
  status:   free
  registry: /Users/me/.404labs/portguard/registry.json

Use: PORT=3104 npm run dev
```

If the assigned port is occupied, `portguard` does not silently switch to a
new URL:

```text
status: occupied

The assigned port is occupied. If that is this project already running, keep
using it. If it is a different process, stop the conflict or run
`portguard assign --reassign` intentionally.
```

---

## Wire it into common frameworks

Next.js:

```json
{
  "scripts": {
    "dev": "next dev -p 3104"
  }
}
```

Vite:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3104 --strictPort"
  }
}
```

Astro:

```json
{
  "scripts": {
    "dev": "astro dev --host 127.0.0.1 --port 3104"
  }
}
```

More examples are in [references/frameworks.md](references/frameworks.md).

---

## Configuration

Flags:

```text
--project <path>      Project path. Default: current working directory.
--name <name>         Display name stored in the registry.
--range <start-end>   Search range. Default: 3100-3999.
--reserved <ports>    Comma list to skip. Default: 3000,3001.
--host <host>         Bind-check host. Default: 127.0.0.1.
--registry <path>     Registry file. Default: ~/.404labs/portguard/registry.json.
--json                Machine-readable output.
--print               Print only the assigned port.
--strict              Exit 1 if the existing assigned port is occupied.
--reassign            Explicitly move to a new never-used free port.
--no-git-root         Key the exact path instead of the git root.
```

Environment:

```bash
PORTGUARD_REGISTRY=/custom/registry.json portguard list
PORTGUARD_RANGE=4100-4999 portguard assign
PORTGUARD_RESERVED=3000,3001,5173 portguard assign
```

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Command succeeded; `check` found the port free |
| `1` | Occupied port, no available port, no assignment to release, or partial install failure |
| `2` | Usage/configuration error |

---

## License

MIT - see [LICENSE](LICENSE).
