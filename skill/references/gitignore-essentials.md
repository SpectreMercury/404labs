# `.gitignore` essentials per stack

Minimum entries to keep secrets and local state out of git. Copy the
relevant block(s) when bootstrapping a new repo, or merge missing lines
into an existing `.gitignore`.

## Universal — every repo needs these

```gitignore
# Secrets
.env
.env.*
!.env.example
!.env.sample
!.env.template

# Keys & certs
*.pem
*.key
*.crt
*.p12
*.pfx
id_rsa
id_rsa.*
id_ed25519
id_ed25519.*
id_ecdsa
id_ecdsa.*

# Cloud creds
.aws/
.gcloud/
gcp-key*.json
service-account*.json
firebase-adminsdk*.json

# Auth files
.netrc
.npmrc
.pypirc
credentials
credentials.json

# OS / editor
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/settings.json.example
*.swp
```

## Node / TypeScript

```gitignore
node_modules/
dist/
build/
.next/
.nuxt/
out/
.cache/
coverage/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.turbo/
.vercel/
.env*.local
```

## Python

```gitignore
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
.eggs/
build/
dist/
.venv/
venv/
env/
.pytest_cache/
.mypy_cache/
.ruff_cache/
.tox/
htmlcov/
.coverage
.coverage.*
.python-version
```

## Go

```gitignore
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
bin/
go.work
go.work.sum
```

## Rust

```gitignore
target/
Cargo.lock     # libraries only — keep for binaries
**/*.rs.bk
*.pdb
```

## Java / Kotlin

```gitignore
*.class
*.jar
*.war
*.ear
target/
build/
.gradle/
out/
.idea/
*.iml
hs_err_pid*
```

## Ruby

```gitignore
*.gem
.bundle/
vendor/bundle/
log/
tmp/
.byebug_history
.rspec_status
coverage/
```

## Database / data

```gitignore
*.sqlite
*.sqlite3
*.db
*.dump
*.sql.gz
data/
dumps/
```

Note: not all `.sql` files are sensitive — schema migrations are fine.
Block dumps specifically.

## Docker / Kubernetes

```gitignore
*.env
docker-compose.override.yml
kubeconfig
.kube/
```

## What to do when sensitive files are already tracked

A `.gitignore` rule does **not** retroactively untrack a file. Steps:

```bash
# 1. Remove from the index, keep on disk
git rm --cached path/to/.env

# 2. Make sure it's ignored going forward
echo ".env" >> .gitignore

# 3. Commit the removal
git commit -m "chore: untrack .env, add to .gitignore"
```

This stops *future* leaks but the file's contents are still in git history.
If the file ever held a real secret, you must also:

1. **Rotate the secret at the provider** (AWS console, GitHub settings,
   etc.). Assume it is already compromised.
2. **Rewrite history** to remove the blob:
   ```bash
   # preferred — git-filter-repo
   git filter-repo --path path/to/.env --invert-paths

   # alternative — BFG Repo-Cleaner
   bfg --delete-files .env
   ```
3. Force-push and coordinate with collaborators — this rewrites shared
   history.

## Sanity-check command

After updating `.gitignore`, confirm there are no surprises in the index:

```bash
git ls-files | grep -E '(^|/)(\.env(\..+)?$|.*\.(pem|key|p12|pfx)$|id_rsa|id_ed25519|service-account.*\.json|credentials(\.json)?$|\.netrc$|\.npmrc$)'
```

Any output is a file you need to deal with.
