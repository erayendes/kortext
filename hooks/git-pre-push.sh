#!/usr/bin/env bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Git pre-push adapter.

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [ -L "$SCRIPT_PATH" ]; do
    LINK_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
    LINK_TARGET="$(readlink "$SCRIPT_PATH")"
    case "$LINK_TARGET" in
        /*) SCRIPT_PATH="$LINK_TARGET" ;;
        *) SCRIPT_PATH="$LINK_DIR/$LINK_TARGET" ;;
    esac
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
"$SCRIPT_DIR/branch-guard.sh"
