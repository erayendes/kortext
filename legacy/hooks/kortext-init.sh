#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Oturum Başlatma ve Güvenlik Hook'u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

install_hook() {
    local hook_name="$1"
    local target_name="$2"
    local hook_path=".git/hooks/$hook_name"
    # Absolute path kullan; .git/hooks içinden çözünmesi gerekiyor.
    local target_path
    target_path="$(cd "$KORTEXT_DIR/hooks" && pwd)/$target_name"

    if [ -e "$hook_path" ] && [ ! -L "$hook_path" ]; then
        # KORTEXT MANAGED HOOK marker'ı hook dosyasının ilk 10 satırında ara.
        # Marker bulunamazsa kortext yönetimindeki hook olmadığı için ezme.
        if ! head -n 10 "$hook_path" 2>/dev/null | grep -q "KORTEXT MANAGED HOOK"; then
            echo "Kortext Git Hook atlandı: $hook_path zaten mevcut (marker yok)."
            return 0
        fi
    fi

    ln -sf "$target_path" "$hook_path"
    chmod +x "$KORTEXT_DIR/hooks/$target_name"
}

install_git_hooks() {
    if [ ! -d ".git" ]; then
        return 0
    fi

    mkdir -p .git/hooks
    install_hook "pre-commit" "git-pre-commit.sh"
    install_hook "commit-msg" "commit-msg-guard.sh"
    install_hook "pre-push" "git-pre-push.sh"
}

# Runtime tespiti: KORTEXT_RUNTIME env var öncelik;
# yoksa proje köküne göre otomatik karar (claude_code | gemini_cli | codex).
detect_runtime() {
    if [ -n "${KORTEXT_RUNTIME:-}" ]; then
        echo "$KORTEXT_RUNTIME"
        return 0
    fi
    if [ -d ".claude" ] || [ -n "${CLAUDE_PROJECT_ROOT:-}" ]; then
        echo "claude_code"
        return 0
    fi
    if [ -d ".gemini" ] || [ -n "${GEMINI_PROJECT_ROOT:-}" ]; then
        echo "gemini_cli"
        return 0
    fi
    echo "codex"
}

# Runtime adapter kurulumu: tespit edilen runtime'a göre uygun template'i
# proje köküne kopyalar ve `${KORTEXT_ROOT}` placeholder'ını gerçek path
# ile değiştirir. settings/runtime-adapters.md tek-kaynak dokümandır.
install_runtime_adapter() {
    local runtime
    runtime="${1:-$(detect_runtime)}"
    local kortext_root
    kortext_root="$(cd "$KORTEXT_DIR" && pwd)"

    case "$runtime" in
        claude_code)
            local template="$KORTEXT_DIR/settings/.claude-settings.template.json"
            local target=".claude/settings.json"
            if [ ! -f "$template" ]; then
                echo "⚠️ Claude Code template bulunamadı: $template"
                return 1
            fi
            mkdir -p .claude
            if [ -e "$target" ] && ! grep -q "KORTEXT_ROOT" "$target" 2>/dev/null; then
                echo "ℹ️  Claude settings zaten mevcut (kortext yönetiminde değil), atlandı: $target"
                return 0
            fi
            sed "s|\${KORTEXT_ROOT}|$kortext_root|g" "$template" > "$target"
            echo "✅ Claude Code adapter kuruldu: $target"
            ;;
        gemini_cli)
            echo "ℹ️  Gemini CLI adapter henüz template'lenmedi (settings/runtime-adapters.md Bölüm 4)."
            echo "   AGENTS.md tabanlı baseline kullanılacak."
            ;;
        codex|generic|*)
            echo "ℹ️  Codex / Generic runtime: AGENTS.md zaten baseline olarak çalışır."
            ;;
    esac
}

if [ "${1:-}" = "--install-hooks" ]; then
    install_git_hooks
    exit 0
fi

if [ "${1:-}" = "--install-runtime" ]; then
    install_runtime_adapter "${2:-}"
    exit 0
fi

# Versiyon oku
KORTEXT_VERSION=$(cat "$KORTEXT_DIR/settings/VERSION" 2>/dev/null | head -n 1 | tr -d '\n' || echo "?.?.?")

# 1. Framework'ü Kilitle (Zorunlu Adım)
if [ -f "$KORTEXT_DIR/scripts/lock_kortext.sh" ]; then
    chmod +x "$KORTEXT_DIR/scripts/lock_kortext.sh"
    bash "$KORTEXT_DIR/scripts/lock_kortext.sh" > /dev/null 2>&1
fi

# 1.5 Git Hook Entegrasyonunu Kur
install_git_hooks

# 1.6 Runtime Adapter Kurulumu (Claude Code / Gemini CLI / Codex)
install_runtime_adapter

# 1.7 SESSION_BRIEF — Oturum Başlangıç Özeti
# Aktif context, son handover ve stale itemları özetler.
SESSION_START_PY="$KORTEXT_DIR/scripts/kortext-session-start.py"
if command -v python3 &>/dev/null && [ -f "$SESSION_START_PY" ]; then
    python3 "$SESSION_START_PY" 2>/dev/null || true
fi


# 2. Durum Tespiti Hazırlığı
BLUEPRINT="$KORTEXT_WORKSPACE_DIR/references/blueprint.md"
STACK="$KORTEXT_WORKSPACE_DIR/references/tech-stack.md"
BACKLOG_DIR="$KORTEXT_WORKSPACE_DIR/memory/backlog/"

# Proje adını çekmeye çalış
PROJE_ADI="Henüz tanımlanmamış"
if [ -f "$BLUEPRINT" ]; then
    PROJE_ADI=$(grep -m 1 "^#" "$BLUEPRINT" 2>/dev/null | sed 's/# //' || echo "Henüz tanımlanmamış")
fi

# Mantık: Dosyaların içeriğine göre durum belirleme
DURUM="Yeni Proje"
SIRADAKI="!start analysis"

# Blueprint dolu ve onaylanmış mı?
if [ -s "$BLUEPRINT" ] && grep -q "status:.*approved" "$BLUEPRINT" 2>/dev/null; then
    DURUM="Blueprint Hazır"
    SIRADAKI="!start analysis"
fi

# Tech Stack dolu ve onaylanmış mı?
if [ -s "$STACK" ] && grep -q "status:.*approved" "$STACK" 2>/dev/null; then
    DURUM="Analiz Tamamlandı"
    SIRADAKI="!start planning"
fi

# Mevcut codebase var mı? (Kortext sonradan eklenmiş bir projeye mi?)
HAS_CODEBASE=false
if [ -f "package.json" ] || [ -f "requirements.txt" ] || [ -f "pubspec.yaml" ] || \
   [ -f "go.mod" ] || [ -f "Cargo.toml" ] || [ -d "src" ] || [ -d "app" ] || [ -d "lib" ]; then
    HAS_CODEBASE=true
fi

# Mevcut codebase varken blueprint yoksa → !onboard öner
if [ "$HAS_CODEBASE" = true ] && [ "$DURUM" = "Yeni Proje" ]; then
    DURUM="Mevcut Proje Tespit Edildi"
    SIRADAKI="!start onboard"
fi

# Backlog klasöründe herhangi bir Markdown dosyası var mı?
if [ -d "$BACKLOG_DIR" ] && find "$BACKLOG_DIR" -name "*.md" 2>/dev/null | grep -q "."; then
    DURUM="Geliştirme Hazır"
    SIRADAKI="!start development"
fi

# 3. Raporu Yazdır
echo "---"
echo "🏁 KORTEXT YÜKLENDİ (v$KORTEXT_VERSION)"
echo "+prime, Kortext protokolleri ve koruma kalkanları aktifleşti."
echo ""
echo "📋 Proje: $PROJE_ADI"
echo "📍 Durum: $DURUM"
echo "⏭️ Sıradaki Adım: $SIRADAKI"
echo ""

# Duruma göre kısa ipucu
case $DURUM in
    "Yeni Proje") echo "💡 Not: blueprint.md üzerinden proje vizyonunu belirleyebilirsin." ;;
    "Mevcut Proje Tespit Edildi") echo "💡 Not: Mevcut codebase bulundu. Kortext'i mevcut projeye entegre etmek için !onboard komutunu kullan." ;;
    "Blueprint Hazır") echo "💡 Not: Analiz fazına geçmek için hazırım (blueprint dolu)." ;;
    "Analiz Tamamlandı") echo "💡 Not: Teknik mimari hazır, planlama başlatılabilir." ;;
    "Geliştirme Hazır") echo "💡 Not: Backlog dolu, hangi görevle başlıyoruz?" ;;
esac

echo ""
echo "Süreci yönetmek üzere komutunu bekliyorum."
echo "---"
