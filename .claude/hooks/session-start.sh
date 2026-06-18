#!/bin/bash
set -euo pipefail

# Pineflow SessionStart hook
# Installs root + infra dependencies so Claude Code on the web can run the
# verification loop (npm run build, infra npm run verify, npm audit) without
# any manual setup. See CLAUDE.md / docs/agent-collaboration.md.

# Only run in the remote (Claude Code on the web) environment. Local sessions
# manage their own dependencies.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$PROJECT_DIR"

echo "[pineflow] Installing root dependencies..."
npm install --no-audit --no-fund

echo "[pineflow] Installing infra (CDK) dependencies..."
( cd infra && npm install --no-audit --no-fund )

echo "[pineflow] Dependency setup complete."
