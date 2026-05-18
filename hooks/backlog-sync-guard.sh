#!/usr/bin/env bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Backlog dashboard/item drift guard.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

cd "$KORTEXT_DIR"
python3 scripts/kortext-backlog-sync.py
