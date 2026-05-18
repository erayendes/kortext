#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Gizli Bilgi ve Sızıntı Tarayıcı

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

kortext_load_config
KORTEXT_HOOK_MODE="${KORTEXT_HOOK_MODE:-permissive}"

# ---- Pattern Grubu 1: Tırnaklı Atama (api_key = "...") ----
P1="(api[_-]?key|secret[_-]?key|password|token|bearer|credential|private[_-]key|access[_-]?key|auth[_-]?token)\s*[:=]\s*['\"][^'\"]{8,}['\"]"

# ---- Pattern Grubu 2: Tırnaksız Atama (API_KEY=sk-abc123) ----
P2="(API_KEY|SECRET_KEY|ACCESS_KEY|AUTH_TOKEN|DB_PASSWORD|DATABASE_URL)=[^'\"\s]{8,}"

# ---- Pattern Grubu 3: Servis Spesifik Formatlar ----
# OpenAI: sk-proj-..., Anthropic: sk-ant-..., AWS: AKIA..., GitHub: ghp_..., Slack: xox*
P3="(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|xox[baprs]-[0-9\-a-zA-Z]{20,})"

# ---- Pattern Grubu 4: Authorization Header Değerleri ----
P4="Authorization:\s*Bearer\s+[a-zA-Z0-9._\-]{20,}"

# ---- İstisna: Env okuma ve placeholder değerler ----
EXCLUSIONS="process\.env|import\.meta\.env|os\.environ|getenv|YOUR_|<YOUR|PLACEHOLDER|example|EXAMPLE|\[VALUE\]|\[fill\]"

scan_file() {
    local source_path="$1"
    local display_path="${2:-$source_path}"
    local pattern

    # Behavior kuralı: ".env versiyon kontrolüne dahil edilmez, gizli bilgiler orada saklanır."
    # Bu yüzden gerçek .env dosyalarını tarama dışı bırakıyoruz.
    if [[ "$display_path" == *".env"* ]] && [[ "$display_path" != *".env.example"* ]]; then
        return 0
    fi

    [ -f "$source_path" ] || return 0

    for pattern in "$P1" "$P2" "$P3" "$P4"; do
        if grep -Ei "$pattern" "$source_path" 2>/dev/null | grep -vEi "$EXCLUSIONS" > /dev/null; then
            echo "---"
            echo "⚠️ KORTEXT GÜVENLİK İHLALİ: SIZINTI TESPİT EDİLDİ"
            echo "Hata: Dosya içinde açık bir şifre, anahtar (key) veya token tespit edildi."
            echo "Kortext Behavior Kuralları gereği (Madde 38-39):"
            echo "1. Gizli bilgiler asla kod içine hardcoded yazılmaz."
            echo "2. Sadece .env dosyası kullanılmalı ve değerler tırnak içinde oraya taşınmalıdır."
            echo ""
            echo "Dosya: $display_path"
            echo "---"
            return 1
        fi
    done

    return 0
}

if [ "${1:-}" = "--stdin" ]; then
    DISPLAY_PATH="${2:-STDIN}"
    TMP_FILE="$(mktemp)"
    cat > "$TMP_FILE"
    scan_file "$TMP_FILE" "$DISPLAY_PATH"
    STATUS=$?
    rm -f "$TMP_FILE"
    exit "$STATUS"
fi

if [ "$#" -gt 0 ]; then
    STATUS=0
    for FILE_PATH in "$@"; do
        if ! scan_file "$FILE_PATH"; then
            STATUS=1
        fi
    done
    exit "$STATUS"
fi

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"

if [ -z "$FILE_PATH" ]; then
    if [ "$KORTEXT_HOOK_MODE" = "strict" ]; then
        echo "⚠️ [KORTEXT] KORTEXT_FILE_PATH tanımsız. strict modda çıkılıyor."
        exit 1
    fi
    exit 0
fi

scan_file "$FILE_PATH"
