# Secret pattern catalogue

Regex patterns grouped by provider, with a shape example and severity.
Mirror of `lib/patterns.js` — keep in sync when adding patterns.

Severity rules:
- **BLOCK** — high-confidence real secret. Match → refuse commit.
- **WARN** — pattern matches but could be a placeholder / public sample /
  test fixture. Surface for human review.

---

## AWS

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `aws-access-key` | BLOCK | `\b(AKIA\|ASIA\|ABIA\|ACCA)[A-Z0-9]{16}\b` | `AKIAIOSFODNN7EXAMPLE` |
| `aws-secret`     | BLOCK | `aws(.{0,20})?(secret\|access)?(.{0,20})?['"][A-Za-z0-9/+=]{40}['"]` | `aws_secret_access_key="wJalrXUt..."` |

Notes: AKIA = long-lived user keys; ASIA = STS temp; ABIA = bearer; ACCA =
context key. All start with 4 letters + 16 [A-Z0-9].

## GitHub

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `gh-pat-classic` | BLOCK | `\bghp_[A-Za-z0-9]{36}\b` | `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `gh-pat-fine`    | BLOCK | `\bgithub_pat_[A-Za-z0-9_]{82}\b` | `github_pat_11AAA...` (82 chars after prefix) |
| `gh-oauth`       | BLOCK | `\bgho_[A-Za-z0-9]{36}\b` | `gho_...` |
| `gh-app-s2s`     | BLOCK | `\b(ghs\|ghu)_[A-Za-z0-9]{36}\b` | `ghs_...`, `ghu_...` |
| `gh-refresh`     | BLOCK | `\bghr_[A-Za-z0-9]{36}\b` | `ghr_...` |

Reference: <https://github.blog/security/application-security/behind-githubs-new-authentication-token-formats/>

## Anthropic / OpenAI

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `anthropic-key` | BLOCK | `\bsk-ant-(api\|admin)\d{2}-[A-Za-z0-9_-]{40,}\b` | `sk-ant-api03-...` |
| `openai-proj`   | BLOCK | `\bsk-proj-[A-Za-z0-9_-]{40,}\b` | `sk-proj-...` |
| `openai-key`    | BLOCK | `\bsk-(?!ant-\|proj-\|test_\|live_)[A-Za-z0-9]{32,}\b` | `sk-...` (legacy / org keys) |

## Google / GCP

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `gcp-api-key` | BLOCK | `\bAIza[0-9A-Za-z_-]{35}\b` | `AIzaSyA...` |
| `gcp-sa-json` | BLOCK | `"type"\s*:\s*"service_account"` | JSON service-account key file |
| `gcp-oauth`   | BLOCK | `\bGOCSPX-[A-Za-z0-9_-]{28}\b` | `GOCSPX-...` |

## Slack

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `slack-token`   | BLOCK | `\bxox[abprs]-[A-Za-z0-9-]{10,}\b` | `xoxb-...` |
| `slack-webhook` | BLOCK | `https://hooks\.slack\.com/services/T[A-Z0-9]+/B[A-Z0-9]+/[A-Za-z0-9]+` | `https://hooks.slack.com/services/T.../B.../...` |

## Stripe

| Pattern id | Severity | Regex | Shape example |
|---|---|---|---|
| `stripe-live`       | BLOCK | `\bsk_live_[A-Za-z0-9]{24,}\b` | `sk_live_...` |
| `stripe-restricted` | BLOCK | `\brk_live_[A-Za-z0-9]{24,}\b` | `rk_live_...` |
| `stripe-test`       | WARN  | `\bsk_test_[A-Za-z0-9]{24,}\b` | `sk_test_...` (often in test fixtures, but still leaks integration setup) |

## Other providers

| Pattern id | Severity | Regex |
|---|---|---|
| `npm-token`    | BLOCK | `\bnpm_[A-Za-z0-9]{36}\b` |
| `do-pat`       | BLOCK | `\bdop_v1_[a-f0-9]{64}\b` |
| `hf-token`     | BLOCK | `\bhf_[A-Za-z0-9]{34}\b` |
| `azure-conn`   | BLOCK | `DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{40,}` |
| `mongodb-uri`  | BLOCK | `\bmongodb(\+srv)?://[^:\s]+:[^@\s]+@[^\s'"`]+` |
| `postgres-uri` | BLOCK | `\bpostgres(ql)?://[^:\s]+:[^@\s]+@[^\s'"`]+` |

## Private keys

| Pattern id | Severity | Regex |
|---|---|---|
| `private-key` | BLOCK | `-----BEGIN (RSA \|EC \|DSA \|OPENSSH \|PGP \|ENCRYPTED )?PRIVATE KEY-----` |

## Generic (lower confidence)

| Pattern id | Severity | Notes |
|---|---|---|
| `jwt` | WARN | three base64 segments separated by `.` — often public test fixtures, sometimes real session tokens |
| `generic-secret` | WARN, `--strict` only | `password \| passwd \| pwd \| secret \| token \| api_key \| auth_token = "..."` — high false-positive rate |

## Placeholder heuristic

Before reporting any finding, check if the line looks like a placeholder.
Match against any of these → downgrade to WARN (or drop):

- `your[_-]?(api[_-]?)?key[_-]?here`
- `xxx+`
- `changeme`
- `placeholder`
- `<[A-Z_]+>` (e.g. `<YOUR_API_KEY>`)
- `\b(example|sample|dummy|fake|test)\b`

## Adding a new pattern

1. Add entry to `lib/patterns.js` with stable `id`, `label`, `severity`,
   `regex`.
2. Add row to the relevant table above.
3. Add a fixture line to `test/scan.test.js` so future changes don't
   silently break detection.
4. If the regex is high false-positive, mark `strictOnly: true` and
   document the trade-off in the description.
