#!/bin/bash
# Verification script to ensure all required files exist and structure is correct

set -e

echo "🔍 Verifying TeleMab Broadcast Platform structure..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

checks_passed=0
checks_failed=0

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((checks_passed++))
  else
    echo -e "${RED}✗${NC} $1 (MISSING)"
    ((checks_failed++))
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1/"
    ((checks_passed++))
  else
    echo -e "${RED}✗${NC} $1/ (MISSING)"
    ((checks_failed++))
  fi
}

echo "📦 Checking package files..."
check_file "package.json"
check_file "tsconfig.json"
check_file "jest.config.js"
check_file ".eslintrc.js"
check_file ".prettierrc.json"
check_file ".gitignore"
check_file "Makefile"
check_file "docker-compose.dev.yml"
check_file "README.md"
check_file "IMPLEMENTATION_GUIDE.md"
echo ""

echo "📚 Checking Platform Core libraries..."
check_dir "services/platform-core/libs/config"
check_file "services/platform-core/libs/config/package.json"
check_file "services/platform-core/libs/config/src/index.ts"

check_dir "services/platform-core/libs/logging"
check_file "services/platform-core/libs/logging/package.json"
check_file "services/platform-core/libs/logging/src/index.ts"

check_dir "services/platform-core/libs/events"
check_file "services/platform-core/libs/events/package.json"
check_file "services/platform-core/libs/events/src/index.ts"

check_dir "services/platform-core/libs/monitoring"
check_file "services/platform-core/libs/monitoring/package.json"
check_file "services/platform-core/libs/monitoring/src/index.ts"

check_dir "services/platform-core/libs/auth"
check_file "services/platform-core/libs/auth/package.json"
check_file "services/platform-core/libs/auth/src/index.ts"
check_file "services/platform-core/libs/auth/tests/auth.test.ts"
echo ""

echo "🚀 Checking services..."
check_dir "services/auth-service"
check_file "services/auth-service/package.json"
check_file "services/auth-service/tsconfig.json"
check_file "services/auth-service/src/index.ts"
check_file "services/auth-service/Dockerfile"
echo ""

echo "🗄️  Checking database..."
check_dir "database/migrations"
check_file "database/migrations/001_init_auth.sql"
echo ""

echo "⚙️  Checking ops..."
check_dir "ops"
check_file "ops/prometheus.yml"
echo ""

echo "📊 Summary:"
echo -e "${GREEN}Passed:${NC} $checks_passed"
if [ $checks_failed -gt 0 ]; then
  echo -e "${RED}Failed:${NC} $checks_failed"
  exit 1
else
  echo -e "${GREEN}All checks passed! ✨${NC}"
  exit 0
fi
