#!/usr/bin/env bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Done item requires handover guard.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

BACKLOG_DIR="$KORTEXT_WORKSPACE_DIR/memory/backlog"
HANDOVER_FILE="$KORTEXT_WORKSPACE_DIR/memory/handover.md"

[ -d "$BACKLOG_DIR" ] || exit 0
[ -f "$HANDOVER_FILE" ] || exit 0

STATUS=0
while IFS= read -r -d '' file_path; do
    [ -f "$file_path" ] || continue
    if grep -q '^> \*\*Status:\*\* Done' "$file_path"; then
        item_id="$(basename "$file_path" | cut -d- -f1)"
        if ! grep -q "^## Handover: $item_id" "$HANDOVER_FILE"; then
            echo "---"
            echo "❌ KORTEXT HANDOVER EKSİK"
            echo "Done durumundaki item için handover kaydı bulunamadı: $item_id"
            echo "Önce scripts/kortext-handover.py ile devir kaydı oluştur."
            echo "---"
            STATUS=1
        fi
    fi
done < <(find "$BACKLOG_DIR" -maxdepth 1 -type f \( -name 'T[0-9]*-*.md' -o -name 'B[0-9]*-*.md' -o -name 'D[0-9]*-*.md' \) -print0)

exit "$STATUS"
