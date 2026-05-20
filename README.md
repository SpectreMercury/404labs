# securitycheck

> Block API keys, tokens, `.env` files, and private keys from leaking into
> git. Ships as a **Claude Code skill** and a standalone **CLI / git hook**.

After the GitHub OAuth-token compromise in early 2026, "my repo is private"
stopped being a credible secrets-management strategy. Any secret committed
to a repo — public or private — should be considered compromised the moment
it enters `.git/objects`. `securitycheck` runs before commits land so it
never gets that far.

---

## What it does

Three phases, always run all three:

1. **`.gitignore` audit** — verifies the file exists and covers `.env`,
   `*.pem`, `*.key`, SSH keys, `.aws/`, service-account JSON. Flags any
   sensitive file that's already tracked (a `.gitignore` rule does not
   retroactively untrack).
2. **Staged-file check** — refuses to commit a `.env`, private key, or
   credential file, regardless of content.
3. **Diff content scan** — applies ~30 provider-specific regexes to the
   staged diff. Catches AWS, GitHub, OpenAI, Anthropic, Google, Slack,
   Stripe, npm, DigitalOcean, HuggingFace, Azure, MongoDB/Postgres URIs,
   PEM private key blocks, JWT, and generic `password=...` assignments
   (under `--strict`).

Findings come back as **BLOCK** (exit 1, refuse commit) or **WARN** (looks
like a placeholder or public sample — human verifies).

---

## Install

### As a Claude Code skill

```bash
npx securitycheck install
```

This copies the skill to `~/.claude/skills/securitycheck/`. Restart Claude
Code so the skill index picks it up. Claude will then run
`securitycheck scan` automatically before any commit, push, or PR — and
will fall back to a manual review if the CLI isn't on PATH.

### As a one-off CLI

```bash
npx securitycheck scan          # scan the staged diff
npx securitycheck scan --strict # also generic password=... heuristics
npx securitycheck scan --all    # scan working tree, not just staged
npx securitycheck scan --json   # machine-readable output
```

### As a git pre-commit hook (no dependencies)

```bash
npx securitycheck hook > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### With Husky

```bash
npm install -D husky securitycheck
npx husky init
echo 'npx securitycheck scan' > .husky/pre-commit
```

### With lefthook

```yaml
# lefthook.yml
pre-commit:
  commands:
    securitycheck:
      run: npx securitycheck scan
```

---

## Output

```
securitycheck — pre-commit scan

  .gitignore:      present
  BLOCK findings:  2
  WARN findings:   1

  BLOCK — do not commit:
    • src/config.ts:14 — Anthropic API key [anthropic-key]
      const key = "sk-ant-api03-AbCdEf...";
    • .env — staged sensitive file
      Fix: git restore --staged ".env" && add to .gitignore

  WARN — verify these manually:
    • tests/fixtures/token.js:3 — JWT-shaped token [jwt]
      const t = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM...";

  ✗ 2 blocking finding(s). Refusing to commit.
    Bypass (NOT recommended): SECURITYCHECK_SKIP=1 git commit ...
```

JSON mode (`--json`) emits the same data as a single JSON object — see
`test/scan.test.js` for the shape.

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean, or WARN-only |
| `1` | One or more BLOCK findings |
| `2` | Usage error or not a git repository |

---

## What it catches

Full catalogue in [skill/references/secret-patterns.md](skill/references/secret-patterns.md).
Highlights:

| Provider | Token shape |
|---|---|
| AWS | `AKIA…`, `ASIA…`, `aws_secret_access_key="…"` |
| GitHub | `ghp_…`, `github_pat_…`, `gho_…`, `ghs_…`, `ghu_…`, `ghr_…` |
| Anthropic | `sk-ant-api03-…`, `sk-ant-admin01-…` |
| OpenAI | `sk-…`, `sk-proj-…` |
| Google | `AIza…`, `GOCSPX-…`, `"type": "service_account"` |
| Slack | `xoxb-…`, `xoxp-…`, `hooks.slack.com/services/…` |
| Stripe | `sk_live_…`, `rk_live_…`, `sk_test_…` (WARN) |
| npm / HF / DO | `npm_…`, `hf_…`, `dop_v1_…` |
| Azure | `DefaultEndpointsProtocol=…;AccountKey=…` |
| Databases | `mongodb://user:pass@…`, `postgres://user:pass@…` |
| Private keys | `-----BEGIN (RSA\|EC\|OPENSSH\|PGP) PRIVATE KEY-----` |
| Generic | `password=`, `secret=`, `api_key=` (`--strict` only) |

Placeholder-like strings (`YOUR_API_KEY`, `xxx`, `changeme`, `<API_KEY>`)
are auto-downgraded to WARN.

---

## When a real secret is found

If the secret has ever been committed (not just staged), unstaging is not
enough. In order:

1. **Rotate at the provider immediately.** Assume it's already compromised.
2. **Remove from history** — `git filter-repo --path <file> --invert-paths`
   or BFG. Squashing in a PR does not remove the blob.
3. **Force-push.** Coordinate with collaborators; this rewrites shared
   history.
4. **Add the path to `.gitignore`** so it can't come back.

Order matters. Cleaning a still-valid key buys nothing — the attacker
already has it cached.

---

## Configuration

No config file. Behaviour is controlled by CLI flags:

```
--all         Scan working tree, not just staged diff
--strict      Enable lower-confidence heuristics (more false positives)
--json        Machine-readable output
--no-color    Disable ANSI colors
--no-ignore   Skip the .gitignore audit
--no-files    Skip the sensitive-file presence check
--no-content  Skip the diff content scan
```

Environment:

- `SECURITYCHECK_SKIP=1` — bypass entirely. Intended for emergencies only;
  the output makes the bypass visible in CI logs.

---

## FAQ

**Why not use `gitleaks` / `trufflehog`?**
Use them too if you can — they're battle-tested. `securitycheck` is
zero-config, has no Go/Python dependency, and ships as a Claude Code skill
so the agent inside your editor checks before you do. If a repo already
runs `gitleaks` in CI, this is a strictly local belt-and-suspenders.

**False positives?**
Three guards: provider-specific prefixes (we don't match `sk-` generically;
we require `sk-proj-` / `sk-ant-` / 32+ chars and not a Stripe prefix); a
placeholder heuristic that downgrades `YOUR_API_KEY`/`xxx`/`changeme`; and
a `--strict` opt-in for the lossy generic `password=` rule.

**False negatives?**
Yes, by design. We don't do entropy scanning in v0.1 — it has too many
false positives without per-language tuning. Add provider-specific patterns
via PR; see [`skill/references/secret-patterns.md`](skill/references/secret-patterns.md).

**Why ship a Claude Code skill at all?**
Because the agent writing your code is also the one most likely to paste a
secret into it. Wiring `securitycheck` into the agent's pre-commit
workflow closes that loop before the commit reaches your git index.

---

## Roadmap

- [ ] Entropy-based detection (opt-in, per-file-type tuned)
- [ ] `gitleaks`-compatible config file consumption
- [ ] Pre-push hook variant that scans the full pushed range
- [ ] GitHub Action wrapper
- [ ] Per-project pattern overrides via `.securitycheck.json`

---

## License

MIT — see [LICENSE](LICENSE).
