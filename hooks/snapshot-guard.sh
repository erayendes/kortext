#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Anlık Yedekleme Muhafızı (Snapshot-Guard)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

kortext_load_config
KORTEXT_HOOK_MODE="${KORTEXT_HOOK_MODE:-permissive}"
BACKUP_KEEP="${KORTEXT_BACKUP_KEEP:-5}"

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"
BACKUP_DIR="$KORTEXT_WORKSPACE_DIR/backups"

# Dosya yolu yoksa veya mevcut değilse çık
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    if [ -z "$FILE_PATH" ] && [ "$KORTEXT_HOOK_MODE" = "strict" ]; then
        echo "⚠️ [KORTEXT] KORTEXT_FILE_PATH tanımsız. strict modda çıkılıyor."
        exit 1
    fi
    exit 0
fi

# Yedekleme dizinini oluştur
mkdir -p "$BACKUP_DIR"

FILENAME=$(basename "$FILE_PATH")
TIMESTAMP=$(date "+%Y-%m-%d_%H%M%S") # Tarih-Saat-Dakika-Saniye
BACKUP_NAME="${BACKUP_DIR}/${FILENAME}_${TIMESTAMP}.bak"

# 1. Yedeği al
cp "$FILE_PATH" "$BACKUP_NAME"

# 2. Temizlik: Aynı dosya için olan yedeklerden sadece en yeni 5 tanesini tut
# (Diğerlerini silerek yer tasarrufu sağlar)
ls -t "${BACKUP_DIR}/${FILENAME}"_* 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs rm -f 2>/dev/null

exit 0
