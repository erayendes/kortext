#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Otomatik Dosya Kilidi Kaldırma (Post-Edit)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"

if [ -z "$FILE_PATH" ]; then exit 0; fi

LOCK_FILE="${FILE_PATH}.lock"

if [ -f "$LOCK_FILE" ]; then
    rm "$LOCK_FILE"
fi
