#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Kod Hatası Denetleyicisi (Lint-Guard)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"

if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then exit 0; fi

EXTENSION="${FILE_PATH##*.}"

echo "🔍 [KORTEXT LINT] Denetleniyor: $FILE_PATH"

case "$EXTENSION" in
    sh)
        # Shell script syntax kontrolü
        bash -n "$FILE_PATH"
        ;;
    js)
        # JavaScript syntax kontrolü (Node.js varsa)
        if command -v node > /dev/null 2>&1; then
            node -c "$FILE_PATH"
        fi
        ;;
    json)
        # JSON format kontrolü (Python varsa)
        if command -v python3 > /dev/null 2>&1; then
            python3 -m json.tool "$FILE_PATH" > /dev/null
        fi
        ;;
    *)
        # Diğer dosyalar için şimdilik pas geç
        exit 0
        ;;
esac

# Eğer yukarıdaki komutlardan biri hata verirse ($? 1 olursa) durdur
if [ $? -ne 0 ]; then
    echo "---"
    echo "❌ KORTEXT LINT HATASI"
    echo "Dosya içinde yazım veya sözdizimi (syntax) hatası tespit edildi."
    echo "Lütfen kodu düzeltip tekrar deneyin."
    echo "---"
    exit 1
fi

exit 0
