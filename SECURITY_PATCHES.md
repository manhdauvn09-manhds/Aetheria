# Security Patches — Aetheria

**Last Updated:** 2026-05-08

## Current Dependency Status

### Critical Dependencies (Monitored)

| Package | Current | Latest Patch | Status | CVEs |
|---------|---------|--------------|--------|------|
| fastify | 5.1.0 | 5.1.x | ✅ Safe | None known |
| @trpc/server | 10.45.2 | 10.45.x | ✅ Safe | None known |
| ioredis | 5.4.1 | 5.4.x | ✅ Safe | None known |
| zod | 3.23.8 | 3.23.x | ✅ Safe | None known |
| jose | 5.9.6 | 5.9.x | ✅ Safe | None known |
| @fastify/cors | 10.0.1 | 10.0.x | ✅ Safe | None known |
| @fastify/helmet | 12.0.1 | 12.0.x | ✅ Safe | None known |
| @fastify/rate-limit | 10.2.1 | 10.2.x | ✅ Safe | None known |

## Checking for Security Updates

### 1. Manual Audit (Recommended)

```bash
# Check for vulnerabilities in current dependencies
pnpm audit

# Output format:
# - If vulnerabilities: Shows count + severity + fix instructions
# - If clean: "0 vulnerabilities found"
```

### 2. Automated Security Scan

```bash
# Use npm's built-in security audit
pnpm audit --audit-level=moderate

# This will error if moderate+ vulnerabilities found
# Safe to run in CI/CD pipeline
```

### 3. Update Only Patches

```bash
# Update patch versions only (e.g., 5.1.0 → 5.1.x)
pnpm update --depth 3

# To apply ONLY patch updates:
pnpm update --patch

# This respects ^version constraints and only installs newer patches
```

## Safe Update Process

### Step 1: Check Audit
```bash
pnpm audit
```
- If `0 vulnerabilities`: ✅ No action needed
- If vulnerabilities: Review severity + affected packages

### Step 2: Identify Patch Updates
```bash
# See available updates (respects version constraints)
pnpm outdated
```
- Column "New" shows available versions
- Only update if "New" is same major.minor (e.g., 5.1.0 → 5.1.5)

### Step 3: Apply Patches
```bash
pnpm update --patch
```

### Step 4: Verify No Breaking Changes
```bash
# Run tests + typecheck
pnpm typecheck
pnpm lint
pnpm test
```

### Step 5: Commit & Deploy
```bash
git add pnpm-lock.yaml package.json
git commit -m "chore: apply security patches"
```

## Monitoring Strategy

### Weekly: Check Audit
```bash
# In CI/CD: run `pnpm audit --audit-level=moderate`
# Fails if moderate+ vulnerabilities detected
```

### Monthly: Review Outdated
```bash
# See which packages have patches available
pnpm outdated
```

### Quarterly: Major Version Review
```bash
# Check if major versions have security-relevant changes
# Only after comprehensive testing
```

## Known Issues

- **fastify 5.1.0**: No known CVEs as of 2026-05-08
- **@trpc/server 10.45.2**: No known CVEs as of 2026-05-08
- **ioredis 5.4.1**: No known CVEs as of 2026-05-08
- **zod 3.23.8**: No known CVEs as of 2026-05-08

## Rollback Plan

If patch update breaks something:

```bash
# Revert package.json changes
git checkout pnpm-lock.yaml package.json

# Reinstall
pnpm install

# Commit revert
git commit -m "Revert: security patches caused regression"
```

## Next Steps

1. Run `pnpm audit` in terminal
2. If vulnerabilities found: Update only affected packages (patch-level)
3. If clean: Review this file monthly
4. Set up CI/CD check: `pnpm audit --audit-level=moderate`
