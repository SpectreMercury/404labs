---
name: securitycheck
description: Pre-commit secret-leak gate. Use before any git commit, push, or PR. Audits .gitignore for sensitive paths, checks no .env / key / credential files are staged, and scans the staged diff for hardcoded secrets (AWS, GitHub, OpenAI, Anthropic, Google, Slack, Stripe, npm, private keys, database URIs, JWT). Triggers on "commit", "push", "ready to ship", "open a PR", "scan for secrets", "any leaks".
metadata:
  type: workflow
---

# securitycheck

You are the last gate before code leaves the developer's laptop. Run on
every commit, even when not asked. The cost of a false positive is fifteen
seconds; the cost of a leaked production key is whatever you have to pay
the people whose data went with it.

## When to run

**Automatically, without being asked**, when the user is about to:

- `git commit` / `git push`
- open a pull request or share a patch
- say "ship it", "I'm done", "ready to merge", "let's deploy"

**On request**: "scan for secrets", "any leaks?", "check before I push",
"is the .gitignore right".

## Prefer the bundled CLI when present

If `securitycheck` is installed (npm package), run it instead of
re-implementing the scan in shell:

```bash
npx securitycheck scan          # staged diff, default
npx securitycheck scan --strict # also generic heuristics
npx securitycheck scan --json   # machine-readable
```

Exit code 1 means BLOCK. Parse the report and surface findings to the user.
Only fall back to manual shell-based scanning (below) if the CLI is not
available.

## Procedure — three phases, always run all three

A passing earlier phase does not let you skip later ones. Secrets hide in
different layers.

### Phase 1 — `.gitignore` audit

a. Confirm `.gitignore` exists at repo root. If missing, STOP and offer to
   generate one from [[references/gitignore-essentials.md]] before
   anything else.
b. Confirm it covers the per-stack essentials in
   [[references/gitignore-essentials.md]]. Universal minimums:
   `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `.aws/`,
   `service-account*.json`, `.netrc`, `.npmrc`.
c. Run `git ls-files` and flag any **already-tracked** file that matches a
   sensitive pattern. A `.gitignore` entry does not retroactively untrack;
   the user needs `git rm --cached <file>` and a follow-up commit. If that
   file ever held a real secret, it must also be rotated — git history
   keeps the old contents.

### Phase 2 — staged sensitive file presence

Check the staged set (`git diff --cached --name-only`) for files that
should never be committed:

- `.env`, `.env.local`, `.env.production`, `.env.*` (allow `*.example`,
  `*.sample`, `*.template`, `*.dist`)
- `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`
- `id_rsa*`, `id_ed25519*`, `id_ecdsa*`
- `service-account*.json`, `firebase-adminsdk*.json`, `gcp-key*.json`
- `credentials`, `credentials.json`, `.aws/credentials`, `.netrc`,
  `.npmrc`, `.pypirc`
- database dumps `*.sql`, `*.dump`, `*.sqlite`, `*.db` — WARN, not BLOCK
  (often legitimate)

Tell the user how to unstage: `git restore --staged <file>` and add the
path to `.gitignore`.

### Phase 3 — staged diff content scan

Scan the diff being committed, not the whole working tree (too noisy):

```bash
git diff --cached -U0
```

Apply the regex catalogue in [[references/secret-patterns.md]]. High-signal
patterns to always check:

- AWS Access Key — `AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}`
- AWS Secret — 40-char base64 next to `aws_secret`/`aws_access`
- GitHub PAT — `ghp_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{82}`
- GitHub OAuth / App / refresh — `gho_`, `ghs_`, `ghu_`, `ghr_` + 36 chars
- OpenAI — `sk-...` (excluding `sk-ant-`, `sk-proj-`, `sk-test_`)
- OpenAI project — `sk-proj-[A-Za-z0-9_-]{40,}`
- Anthropic — `sk-ant-(api|admin)\d{2}-[A-Za-z0-9_-]{40,}`
- Google API key — `AIza[0-9A-Za-z_-]{35}`
- GCP service account — `"type": "service_account"`
- Slack token / webhook — `xox[abprs]-...`, `hooks.slack.com/services/...`
- Stripe — `sk_live_`, `rk_live_` (BLOCK); `sk_test_` (WARN)
- npm — `npm_[A-Za-z0-9]{36}`
- DigitalOcean — `dop_v1_[a-f0-9]{64}`
- HuggingFace — `hf_[A-Za-z0-9]{34}`
- Azure storage — `AccountKey=[base64]{40,}` inside a connection string
- Database URIs with creds — `mongodb://user:pass@`, `postgres://user:pass@`
- Private keys — `-----BEGIN (RSA|EC|DSA|OPENSSH|PGP|ENCRYPTED) PRIVATE KEY-----`
- JWT — three base64 segments separated by dots (WARN; often test fixtures)

For generic `password=...` / `token=...` assignments: do **not** auto-block
on regex alone. Read the surrounding code and judge — placeholder string
(`YOUR_KEY_HERE`, `xxx`, `changeme`, `<API_KEY>`), test fixture, comment,
or a real value? State your reasoning out loud.

## Reporting

Use this exact structure so the user can scan results quickly:

```
## securitycheck — pre-commit scan

  .gitignore:      <present | MISSING>
  BLOCK findings:  <n>
  WARN findings:   <n>

### BLOCK — do not commit
  • <file>:<line> — <pattern label> [<pattern id>]
    <one-line excerpt>
    Fix: <command or action>

### WARN — verify manually
  • ...
```

Severity rules:

- **BLOCK** — real-looking key, private key block, staged `.env`, AWS/GCP
  credential file, tracked sensitive file. Refuse to proceed; tell the user
  not to push.
- **WARN** — pattern matched but content reads like a placeholder, test
  fixture, or JWT that could be a public sample. Ask the user to confirm.
- **INFO** — `.gitignore` lacks an entry that isn't currently leaking but
  would (preventative).

## When you find a real leak

If a real secret matches in the diff and has **ever been committed**
(not just staged), unstaging is not enough. Tell the user:

1. **Rotate the secret immediately** at the provider — AWS console,
   GitHub settings, OpenAI dashboard, Stripe dashboard, etc. Assume it is
   already compromised: the moment it landed in `.git/objects`, any
   process on the machine — and any future clone of the repo — could
   read it.
2. Purge from history: `git filter-repo --path <file> --invert-paths`
   (preferred) or BFG Repo-Cleaner. Squashing in a PR does NOT remove
   the blob from history.
3. Force-push. Warn the user this rewrites shared history and must be
   coordinated with collaborators.
4. Add the path to `.gitignore` so it cannot return.

**Order matters**: rotate first, then clean. Cleaning a still-valid key
buys nothing — the attacker already has it cached.

## What this skill is NOT

- Not a replacement for `gitleaks` / `trufflehog`. If the repo configures
  one, run that and parse its output instead of re-implementing.
- Not a SAST tool — it does not look for SQLi, XSS, command injection.
- Not a dependency scanner — use `npm audit`, `pip-audit`, `cargo audit`.

## References

- [[references/secret-patterns.md]] — full regex catalogue, grouped by
  provider, with examples of what each token shape looks like
- [[references/gitignore-essentials.md]] — minimum `.gitignore` per stack
  (Node, Python, Go, Rust, Java, Ruby, generic) + how to handle
  files that are already tracked
