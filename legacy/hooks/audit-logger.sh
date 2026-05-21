#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] İşlem Günlüğü (Audit Logger)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

LOG_FILE="$KORTEXT_WORKSPACE_DIR/reports/audit.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# Çevresel değişkenlerden bilgileri çek (Casing ve isim kullandığın AI arayüzüne göre değişebilir)
ACTION_FILE="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-N/A}}}}"
LAST_CMD="${KORTEXT_LAST_CMD:-${CLAUDE_LAST_COMMAND:-${GEMINI_LAST_ACTION:-${OPENAI_LAST_COMMAND:-N/A}}}}"
AGENT_NAME="${KORTEXT_AGENT_NAME:-${CLAUDE_AGENT_NAME:-${GEMINI_AGENT_NAME:-${OPENAI_AGENT_NAME:-Agent}}}}"

mkdir -p "$KORTEXT_WORKSPACE_DIR/reports"

# Kayıt Satırı Oluştur
LOG_ENTRY="[$TIMESTAMP] | AGENT: $AGENT_NAME | FILE: $ACTION_FILE | CMD: $LAST_CMD"

# Dosyaya ekle
echo "$LOG_ENTRY" >> "$LOG_FILE"

exit 0
