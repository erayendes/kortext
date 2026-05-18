#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Yazma Muhafızı (Gelişmiş)
# 1. Konum Kontrolü: Sadece izin verilen dizinlere yazılmasını sağlar.
# 2. Kalite Kontrolü (Tamlık Kapısı): Yarım kalmış içeriklerin yazılmasını engeller.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

kortext_load_config
KORTEXT_HOOK_MODE="${KORTEXT_HOOK_MODE:-permissive}"

# Girdiyi Oku (JSON formatında gelmesi beklenir)
INPUT=$(cat)
FILE_PATH="$(kortext_json_field "$INPUT" '.tool_input.file_path')"

# Eğer JSON'dan gelmiyorsa çevresel değişkenleri dene
if [ -z "$FILE_PATH" ]; then
    FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"
fi

if [ -z "$FILE_PATH" ]; then
    if [ "$KORTEXT_HOOK_MODE" = "strict" ]; then
        echo "⚠️ [KORTEXT] Dosya yolu tespit edilemedi. strict modda çıkılıyor."
        exit 1
    fi
    exit 0
fi

# 1. BÖLÜM: KONUM KONTROLÜ
ALLOWED=false
if kortext_is_workspace_path "$FILE_PATH" || kortext_is_env_path "$FILE_PATH"; then
    ALLOWED=true
fi

if [ "$ALLOWED" = false ]; then
    echo "---"
    echo "❌ KORTEXT ERİŞİM ENGELİ"
    echo "Hata: Kortext kuralları gereği Framework çekirdek dizinlerine yazma yetkiniz yoktur."
    echo "Lütfen çıktılarınızı '$KORTEXT_REL/workspace/' altındaki uygun klasörlere kaydedin."
    echo "Hedeflenen Dosya: $FILE_PATH"
    echo "---"
    exit 1
fi

# 2. BÖLÜM: TAMLIK KAPISI (KALİTE KONTROLÜ)
# Yazılacak içeriği al (Write veya Edit/MultiEdit araçları için)
CONTENT="$(kortext_json_field "$INPUT" '.tool_input.content // .tool_input.new_string')"

if [ -n "$CONTENT" ]; then
    # Yarım bırakma işaretçileri (TBD, FIXME, PLACEHOLDER vb.)
    # Önemli İstisna: "// todo: [tech-debt]" formatındaki teknik borçlara izin verilir.
    if echo "$CONTENT" | grep -qiE '\bTBD\b|\bFIXME\b|\[PLACEHOLDER\]|\[INSERT ' || \
       (echo "$CONTENT" | grep -i '\bTODO\b' | grep -vi '\[tech-debt\]' | grep -q .); then
        echo "---"
        echo "⚠️ TAMLIK KAPISI: EKSİK İÇERİK TESPİT EDİLDİ"
        echo "Hata: Yazmaya çalıştığınız içerikte disiplinsiz (etiketsiz) yer tutucular var."
        echo "Kortext Politikası: Sıradan TODO/TBD kullanımı yasaktır."
        echo "İstisna: Eğer teknik borç bırakmanız gerekiyorsa '// todo: [tech-debt] açıklama' formatını kullanın."
        echo "Dosya: $FILE_PATH"
        echo "---"
        exit 1
    fi

    # Kararsızlık ifadeleri
    if echo "$CONTENT" | grep -qiE 'assess whether|decide later|need to determine|open question|to be decided|deferred decision'; then
        echo "---"
        echo "⚠️ TAMLIK KAPISI: BELİRSİZLİK TESPİT EDİLDİ"
        echo "Hata: İçerikte 'sonra karar verilecek' veya 'belirlenmesi gerekiyor' gibi ucu açık ifadeler var."
        echo "Kortext Politikası: Yazma işleminden önce tüm kararlar çözülmüş olmalıdır."
        echo "---"
        exit 1
    fi
fi

exit 0
