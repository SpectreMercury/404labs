# 404labs

A growing collection of agent skills installable into **55+ AI coding
CLIs** via the [Vercel Labs `skills`](https://github.com/vercel-labs/skills)
ecosystem — Claude Code, OpenAI Codex, Google Antigravity, Moonshot Kimi,
Cursor, OpenCode, Gemini CLI, Cline, Roo, Windsurf, and more. Each skill
lives in its own subdirectory with a `SKILL.md` at the root; skills with
a runtime also ship as npm packages with a built-in installer for the
four most common targets.

## Skills

| Skill | What it does | npm package |
|---|---|---|
| [securitycheck](./securitycheck) | Pre-commit secret-leak gate: `.gitignore` audit, sensitive-file check, diff content scan for API keys, tokens, private keys, DB URIs. | [`@404labs/securitycheck`](https://www.npmjs.com/package/@404labs/securitycheck) |
| [portguard](./portguard) | Stable per-project localhost port assignment for AI-built apps: skips `3000/3001`, checks occupancy, and prevents stopped projects' ports from being reused accidentally. | [`@404labs/portguard`](https://www.npmjs.com/package/@404labs/portguard) |

## Installing a skill

**Recommended — via the [Vercel Labs `skills`
CLI](https://github.com/vercel-labs/skills)** (55+ supported agent CLIs;
auto-detects which one you have):

```bash
npx skills add SpectreMercury/404labs --skill <skill-name>            # current agent
npx skills add SpectreMercury/404labs --skill <skill-name> -g         # global install
npx skills add SpectreMercury/404labs --skill <skill-name> --all      # all agents
npx skills add SpectreMercury/404labs --skill <skill-name> -a codex   # specific agents
```

**Alternative — via the skill's own npm package** (skills that ship one;
covers Claude Code, OpenAI Codex, Google Antigravity, Moonshot Kimi):

```bash
npx @404labs/<skill-name> install                # auto-detect
npx @404labs/<skill-name> install --target all   # install for all 4 supported
npx @404labs/<skill-name> install --list-targets # see all options
```

### Through host CLIs for unsupported targets

- **Zhipu GLM** — no first-party skill loader; distribute via
  [GLM-skills / clawhub](https://github.com/zai-org/GLM-skills)
- **MiniMax** — use the
  [MiniMax-AI/skills](https://github.com/MiniMax-AI/skills) marketplace
  (which redistributes into Claude Code / Cursor)

## Repo layout

```
404labs/
├── README.md
├── LICENSE
├── .gitignore
└── <skill-name>/
    ├── SKILL.md          # canonical instruction file (loaded by Claude)
    ├── agents/           # optional UI metadata for agent skill lists
    ├── references/       # extra docs the skill points the agent at
    ├── package.json      # if the skill ships a CLI
    ├── bin/  lib/  test/ # CLI source, where applicable
    └── README.md         # human-readable docs for the package
```

## License

MIT — see [LICENSE](LICENSE).
