#!/bin/bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# [KORTEXT] Otomatik Dosya Kilidi (Pre-Edit)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=kortext-lib.sh
source "$SCRIPT_DIR/kortext-lib.sh"

kortext_load_config
# Dakika cinsinden lock timeout (shell fallback için). Default 5 dakika.
KORTEXT_LOCK_TIMEOUT_MIN="${KORTEXT_LOCK_TIMEOUT_MIN:-5}"
KORTEXT_HOOK_MODE="${KORTEXT_HOOK_MODE:-permissive}"

FILE_PATH="${KORTEXT_FILE_PATH:-${CLAUDE_FILE_PATH:-${GEMINI_FILE_PATH:-${OPENAI_FILE_PATH:-}}}}"
AGENT_NAME="${KORTEXT_AGENT:-unknown-agent}"

if [ -z "$FILE_PATH" ]; then
    if [ "$KORTEXT_HOOK_MODE" = "strict" ]; then
        echo "⚠️ [KORTEXT] KORTEXT_FILE_PATH tanımsız. strict modda çıkılıyor."
        exit 1
    fi
    exit 0
fi

# Sadece ortak hafıza dosyaları için kilit çalıştır
if [[ "$FILE_PATH" == *"context.md" ]] || [[ "$FILE_PATH" == *"backlog/"* ]] || [[ "$FILE_PATH" == *"handover.md" ]]; then

    # --- Python lock (kortext-lock.py) ile entegrasyon ---
    LOCK_PY="$KORTEXT_DIR/scripts/kortext-lock.py"
    if command -v python3 &>/dev/null && [ -f "$LOCK_PY" ]; then
        python3 "$LOCK_PY" acquire --file "$FILE_PATH" --agent "$AGENT_NAME" 2>/dev/null || {
            # Python lock başarısız → shell lock'a düş
            echo "⚠️ [KORTEXT] kortext-lock.py acquire başarısız. Shell kilit mekanizmasına geçiliyor."
        }
    else
        # --- Shell-only fallback lock (flock tabanlı, race-free) ---
        # flock(1) ile atomik bir guard alıp lock dosyasını oluştururuz.
        # Böylece iki ajan eş zamanlı stale-kontrolü + create yaparken yarışmaz.
        LOCK_DIR="$(dirname "$FILE_PATH")"
        file_name="$(basename "$FILE_PATH")"
        LOCK_FILE="$LOCK_DIR/${file_name}.lock"
        GUARD_FILE="$LOCK_FILE.guard"

        # Guard dosyasını fd 200'e bağla.
        exec 200>"$GUARD_FILE"

        if flock -n -x 200; then
            # Atomik kontrol: kilit dosyası var mı?
            if [ -f "$LOCK_FILE" ]; then
                # Stale kontrolü: dakika cinsinden timeout aşıldıysa sil.
                if find "$LOCK_FILE" -mmin +"$KORTEXT_LOCK_TIMEOUT_MIN" -print -quit 2>/dev/null | grep -q .; then
                    rm -f "$LOCK_FILE"
                else
                    # Aktif kilit var, çakışma uyarısı.
                    flock -u 200
                    echo "---" >&2
                    echo "🔒 [KORTEXT] KILIT ÇAKIŞMASI" >&2
                    echo "$LOCK_FILE aktif olarak başka bir ajan tarafından kullanılıyor." >&2
                    echo "Timeout: ${KORTEXT_LOCK_TIMEOUT_MIN} dakika sonra stale sayılır." >&2
                    echo "+operation-manager'a eskalasyon yap." >&2
                    echo "---" >&2
                    exit 1
                fi
            fi
            # Kilit içeriğine ajan ve zaman damgası yaz (epoch saniye).
            echo "${KORTEXT_AGENT_NAME:-$AGENT_NAME}:$(date +%s)" > "$LOCK_FILE"
            flock -u 200
        else
            echo "🔒 [KORTEXT] Guard kilit alınamadı: $GUARD_FILE" >&2
            exit 1
        fi
    fi
fi

