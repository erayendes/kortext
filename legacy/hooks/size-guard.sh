#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Dosya Boyutu ve Arşivleme Muhafixı

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

kortext_load_config
KORTEXT_HOOK_MODE="${KORTEXT_HOOK_MODE:-permissive}"
MAX_LINES="${KORTEXT_SIZE_LIMIT:-500}"

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"

# Eğer dosya yolu boşsa veya dosya mevcut değilse çık
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
    if [ -z "$FILE_PATH" ] && [ "$KORTEXT_HOOK_MODE" = "strict" ]; then
        echo "⚠️ [KORTEXT] KORTEXT_FILE_PATH tanımsız. strict modda çıkılıyor."
        exit 1
    fi
    exit 0
fi

# ÖZEL İSTİSNA: backlog/ dizini her zaman tam kapsamlı kalmalıdır, arşivlenmez.
if [[ "$FILE_PATH" == *"backlog/"* ]]; then
    exit 0
fi

LINE_COUNT=$(wc -l < "$FILE_PATH")

if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
    echo "---"
    echo "🛑 KORTEXT BOYUT SINIRI AŞILDI"
    echo "Dosya: $FILE_PATH ($LINE_COUNT satır)"
    echo "Limit: $MAX_LINES satır"
    echo ""
    echo "⚠️ ARCHIVING PROTOCOL GEREĞİ:"
    echo "1. Dosyadaki eski veya tamamlanmış verileri tespit et."
    echo "2. Bu verileri '$KORTEXT_REL/workspace/archive/' altına '[dosya-adi]_[YYYY-MM-DD_HHMMSS].md' formatıyla taşı."
    echo "3. Ana dosyada arşivlenen bölüme bir link/not bırak."
    echo "4. Ana dosyayı hafifletip işlemi tekrar dene."
    echo ""
    echo "Not: 'backlog/' dizinindeki dosyalar bu kuraldan muaf tutulmuştur."
    echo "---"
    exit 1
fi

exit 0
