'use strict';

// High-confidence secret patterns. Each entry:
//   id          stable identifier
//   label       human-readable name
//   severity    BLOCK = real-looking secret, WARN = could be placeholder/test fixture
//   regex       single-line matcher
//   strictOnly  if true, only matched with --strict (high false-positive rate)
//
// References:
//   AWS:    https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html
//   GitHub: https://github.blog/security/application-security/behind-githubs-new-authentication-token-formats/
//   GCP:    https://cloud.google.com/docs/authentication/api-keys

const PATTERNS = [
  // ---------- AWS ----------
  { id: 'aws-access-key',  label: 'AWS Access Key ID',          severity: 'BLOCK',
    regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/ },
  { id: 'aws-secret',      label: 'AWS Secret Access Key',      severity: 'BLOCK',
    regex: /aws(?:.{0,20})?(?:secret|access)?(?:.{0,20})?['"][A-Za-z0-9/+=]{40}['"]/i },

  // ---------- GitHub ----------
  { id: 'gh-pat-classic',  label: 'GitHub PAT (classic)',       severity: 'BLOCK',
    regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { id: 'gh-pat-fine',     label: 'GitHub fine-grained PAT',    severity: 'BLOCK',
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { id: 'gh-oauth',        label: 'GitHub OAuth token',         severity: 'BLOCK',
    regex: /\bgho_[A-Za-z0-9]{36}\b/ },
  { id: 'gh-app-s2s',      label: 'GitHub App server-to-server token', severity: 'BLOCK',
    regex: /\b(?:ghs|ghu)_[A-Za-z0-9]{36}\b/ },
  { id: 'gh-refresh',      label: 'GitHub refresh token',       severity: 'BLOCK',
    regex: /\bghr_[A-Za-z0-9]{36}\b/ },

  // ---------- OpenAI / Anthropic ----------
  { id: 'anthropic-key',   label: 'Anthropic API key',          severity: 'BLOCK',
    regex: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}\b/ },
  { id: 'openai-proj',     label: 'OpenAI project key',         severity: 'BLOCK',
    regex: /\bsk-proj-[A-Za-z0-9_-]{40,}\b/ },
  { id: 'openai-key',      label: 'OpenAI API key',             severity: 'BLOCK',
    regex: /\bsk-(?!ant-|proj-|test_|live_)[A-Za-z0-9]{32,}\b/ },

  // ---------- Google / GCP ----------
  { id: 'gcp-api-key',     label: 'Google API key',             severity: 'BLOCK',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'gcp-sa-json',     label: 'GCP service account JSON',   severity: 'BLOCK',
    regex: /"type"\s*:\s*"service_account"/ },
  { id: 'gcp-oauth',       label: 'Google OAuth client secret', severity: 'BLOCK',
    regex: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/ },

  // ---------- Slack ----------
  { id: 'slack-token',     label: 'Slack token',                severity: 'BLOCK',
    regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'slack-webhook',   label: 'Slack incoming webhook',     severity: 'BLOCK',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/ },

  // ---------- Stripe ----------
  { id: 'stripe-live',     label: 'Stripe live secret key',     severity: 'BLOCK',
    regex: /\bsk_live_[A-Za-z0-9]{24,}\b/ },
  { id: 'stripe-restricted', label: 'Stripe restricted key',    severity: 'BLOCK',
    regex: /\brk_live_[A-Za-z0-9]{24,}\b/ },
  { id: 'stripe-test',     label: 'Stripe test key',            severity: 'WARN',
    regex: /\bsk_test_[A-Za-z0-9]{24,}\b/ },

  // ---------- Other providers ----------
  { id: 'npm-token',       label: 'npm token',                  severity: 'BLOCK',
    regex: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'do-pat',          label: 'DigitalOcean PAT',           severity: 'BLOCK',
    regex: /\bdop_v1_[a-f0-9]{64}\b/ },
  { id: 'hf-token',        label: 'HuggingFace token',          severity: 'BLOCK',
    regex: /\bhf_[A-Za-z0-9]{34}\b/ },
  { id: 'azure-conn',      label: 'Azure storage connection string', severity: 'BLOCK',
    regex: /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{40,}/ },
  { id: 'mongodb-uri',     label: 'MongoDB connection URI with credentials', severity: 'BLOCK',
    regex: /\bmongodb(?:\+srv)?:\/\/[^:\s]+:[^@\s]+@[^\s'"`]+/ },
  { id: 'postgres-uri',    label: 'Postgres connection URI with credentials', severity: 'BLOCK',
    regex: /\bpostgres(?:ql)?:\/\/[^:\s]+:[^@\s]+@[^\s'"`]+/ },

  // ---------- Private keys ----------
  { id: 'private-key',     label: 'Private key block (PEM)',    severity: 'BLOCK',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/ },

  // ---------- Generic (lower confidence) ----------
  { id: 'jwt',             label: 'JWT-shaped token',           severity: 'WARN',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { id: 'generic-secret',  label: 'Generic credential assignment', severity: 'WARN', strictOnly: true,
    regex: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|auth[_-]?token)\s*['"]?\s*[:=]\s*['"][^'"\s]{8,}['"]/i },
];

// Lines containing any of these are treated as placeholders and skipped.
const PLACEHOLDER_HINTS = [
  /your[_-]?(api[_-]?)?key[_-]?here/i,
  /xxx+/i,
  /changeme/i,
  /placeholder/i,
  /<[A-Z_]+>/,            // <YOUR_KEY>
  /\b(example|sample|dummy|fake|test)\b/i,
];

function looksLikePlaceholder(content) {
  return PLACEHOLDER_HINTS.some((h) => h.test(content));
}

module.exports = { PATTERNS, looksLikePlaceholder };
