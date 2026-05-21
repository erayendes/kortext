#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Commit Mesajı Standart Kontrolü

# Git commit sırasında mesaj dosyası parametre olarak gelir
MSG_FILE="$1"
COMMIT_MSG=$(cat "$MSG_FILE" 2>/dev/null)

# Eğer direkt dosya yoksa ortam değişkenine bak (bazı araçlar için)
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="${KORTEXT_COMMIT_MSG:-${CLAUDE_COMMIT_MESSAGE:-${GEMINI_COMMIT_MESSAGE:-${OPENAI_COMMIT_MESSAGE:-}}}}"
fi

if [ -z "$COMMIT_MSG" ]; then exit 0; fi

# Conventional Commits formatı (feat, fix, docs, refactor, test, chore, style, perf)
# Örn: feat: add authentication
PATTERN="^(feat|fix|docs|refactor|test|chore|style|perf)(\(.+\))?!?: .+"

if [[ ! "$COMMIT_MSG" =~ $PATTERN ]]; then
    echo "---"
    echo "❌ KORTEXT COMMIT STANDARTLARI İHLALİ"
    echo "Hata: Commit mesajı 'Conventional Commits' formatında değil."
    echo "Kurallara uygun örnekler:"
    echo "  - feat: add logging system"
    echo "  - fix: resolve api timeout"
    echo "  - docs: update technical specifications"
    echo ""
    echo "Geçerli Mesajınız: $COMMIT_MSG"
    echo "---"
    exit 1
fi

# İngilizce zorunluluğu kontrolü (Türkçe karakter araması)
if echo "$COMMIT_MSG" | grep -q "[çğışıöüÇĞİŞIÖÜ]"; then
    echo ""
    echo "⚠️ [KORTEXT UYARI]"
    echo "Commit mesajında Türkçe karakterler tespit edildi."
    echo "Kortext Behavior kuralları gereği commit mesajları İngilizce olmalıdır."
    echo ""
fi

exit 0
