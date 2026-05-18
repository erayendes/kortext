#!/usr/bin/env bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Git pre-commit adapter.

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
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"
kortext_load_config

cd "$KORTEXT_ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    exit 0
fi

STATUS=0
TMP_DIR="$(mktemp -d)"

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

while IFS= read -r -d '' FILE_PATH; do
    [ -n "$FILE_PATH" ] || continue
    [ -f "$FILE_PATH" ] || continue

    STAGED_COPY="$TMP_DIR/$(basename "$FILE_PATH")"
    if git show ":$FILE_PATH" > "$STAGED_COPY" 2>/dev/null; then
        if ! "$SCRIPT_DIR/secret-scanner.sh" --stdin "$FILE_PATH" < "$STAGED_COPY"; then
            STATUS=1
        fi
    fi

    if ! KORTEXT_FILE_PATH="$FILE_PATH" "$SCRIPT_DIR/lint-guard.sh"; then
        STATUS=1
    fi

    if ! KORTEXT_FILE_PATH="$FILE_PATH" "$SCRIPT_DIR/size-guard.sh"; then
        STATUS=1
    fi

    # Kritik dosyalar için anlık yedek al (snapshot-guard).
    # Bu dosyalar ajanlar arası bilgi devrinin omurgası; commit öncesi son
    # iyi-bilinen halini workspace/backups/ altına kopyalarız.
    case "$FILE_PATH" in
        workspace/memory/handover.md|\
        workspace/memory/decisions.md|\
        workspace/memory/learned.md|\
        workspace/memory/context/*|\
        workspace/references/*)
            KORTEXT_FILE_PATH="$FILE_PATH" "$SCRIPT_DIR/snapshot-guard.sh" || true
            ;;
    esac
done < <(kortext_staged_files)

if ! "$SCRIPT_DIR/backlog-sync-guard.sh"; then
    STATUS=1
fi

if ! "$SCRIPT_DIR/handover-guard.sh"; then
    STATUS=1
fi

exit "$STATUS"
