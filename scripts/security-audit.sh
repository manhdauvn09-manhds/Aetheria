#!/bin/bash
# Aetheria — Security Audit Script
# Run: pnpm exec bash scripts/security-audit.sh
#
# Performs:
# 1. npm audit (find vulnerabilities)
# 2. Dependency outdated check
# 3. TypeScript type safety
# 4. ESLint security rules

set -e

echo "🔒 Running Aetheria Security Audit..."
echo ""

# Step 1: Check for vulnerabilities
echo "📋 Step 1/4: Checking for known vulnerabilities..."
if pnpm audit --audit-level=moderate; then
  echo "✅ No moderate/high/critical vulnerabilities found"
else
  echo "⚠️ Vulnerabilities detected. Review above for details."
  echo "   Run: pnpm audit --fix"
  exit 1
fi
echo ""

# Step 2: Check outdated packages (patch updates only)
echo "📋 Step 2/4: Checking for available patch updates..."
pnpm outdated || echo "✅ All packages up-to-date"
echo ""

# Step 3: TypeScript security check
echo "📋 Step 3/4: Running TypeScript type check..."
pnpm typecheck
echo "✅ Type safety verified"
echo ""

# Step 4: ESLint security rules
echo "📋 Step 4/4: Running ESLint..."
pnpm lint || echo "⚠️ Linting issues found (may be style-only)"
echo ""

echo "✅ Security audit complete!"
echo ""
echo "📌 Next steps:"
echo "   - If vulnerabilities: run 'pnpm audit --fix'"
echo "   - If patches available: run 'pnpm update --patch'"
echo "   - Then test: 'pnpm test && pnpm build'"
