#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Branch Yönetimi ve Koruma

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

# Eğer git olmayan bir yerdeyse çık
if [ -z "$CURRENT_BRANCH" ]; then exit 0; fi

# Behavior kuralı: "Asla doğrudan main ve development üzerinde çalışmayın."
if [[ "$CURRENT_BRANCH" == "main" ]] || [[ "$CURRENT_BRANCH" == "development" ]] || [[ "$CURRENT_BRANCH" == "master" ]]; then
    echo "---"
    echo "🚫 KORTEXT BRANCH KORUMASI"
    echo "Hata: Şu an '$CURRENT_BRANCH' ana dalındasınız."
    echo "Kortext kuralları gereği doğrudan bu dal üzerinde geliştirme yapamazsınız."
    echo ""
    echo "Lütfen yeni bir dal oluşturun:"
    echo "git checkout -b feature/[task-id]"
    echo "---"
    exit 1
fi

# İsimlendirme standardı uyarısı (branching.md satır 17-23)
if [[ ! "$CURRENT_BRANCH" =~ ^(feature/|hotfix/|bugfix/|release/|chore/) ]]; then
    echo ""
    echo "⚠️ [KORTEXT UYARI]"
    echo "Mevcut branch isimlendirmesi standart dışı ($CURRENT_BRANCH)."
    echo "feature/[task-id] veya hotfix/[hata-adi] formatını kullanmanız önerilir."
    echo ""
fi

exit 0
