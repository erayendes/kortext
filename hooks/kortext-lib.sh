#!/usr/bin/env bash
# KORTEXT MANAGED HOOK — generated/edited by kortext framework
# Shared path and config helpers for Kortext hooks.

kortext_find_root() {
    local dir="${1:-$PWD}"

    while [ "$dir" != "/" ]; do
        if [ -d "$dir/kortext/hooks" ] || [ -d "$dir/.kortext/hooks" ]; then
            printf '%s\n' "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done

    return 1
}

KORTEXT_ROOT="${KORTEXT_ROOT:-$(kortext_find_root "$PWD" 2>/dev/null || pwd)}"

if [ -d "$KORTEXT_ROOT/kortext" ]; then
    KORTEXT_REL="${KORTEXT_REL:-kortext}"
elif [ -d "$KORTEXT_ROOT/.kortext" ]; then
    KORTEXT_REL="${KORTEXT_REL:-.kortext}"
else
    KORTEXT_REL="${KORTEXT_REL:-kortext}"
fi

KORTEXT_DIR="${KORTEXT_DIR:-$KORTEXT_ROOT/$KORTEXT_REL}"

# KORTEXT_WORKSPACE_DIR: npm global kurulumda framework ve proje dizini ayrılır.
# Önce çalışma dizininde local workspace/ ara; yoksa framework'ün kendi workspace/'ini kullan.
if [ -z "${KORTEXT_WORKSPACE_DIR:-}" ]; then
    if [ -d "$PWD/workspace" ]; then
        KORTEXT_WORKSPACE_DIR="$PWD/workspace"
    else
        KORTEXT_WORKSPACE_DIR="$KORTEXT_DIR/workspace"
    fi
fi
export KORTEXT_WORKSPACE_DIR

kortext_abs_path() {
    local path="$1"
    case "$path" in
        /*) printf '%s\n' "$path" ;;
        *) printf '%s\n' "$KORTEXT_ROOT/$path" ;;
    esac
}

kortext_load_config() {
    local config_file line key value
    local candidates=(
        "$KORTEXT_DIR/settings/config"
        "$KORTEXT_DIR/settings/config.md"
        "$KORTEXT_DIR/config"
        "$KORTEXT_ROOT/.kortext/config"
    )

    for config_file in "${candidates[@]}"; do
        [ -f "$config_file" ] || continue
        while IFS= read -r line; do
            line="${line%%#*}"
            [[ "$line" =~ ^[[:space:]]*([A-Z_][A-Z0-9_]*)[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$ ]] || continue
            key="${BASH_REMATCH[1]}"
            value="${BASH_REMATCH[2]}"
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            if [ -z "${!key+x}" ]; then
                export "$key=$value"
            fi
        done < "$config_file"
        return 0
    done

    return 0
}

kortext_is_workspace_path() {
    local abs
    abs="$(kortext_abs_path "$1")"

    case "$abs" in
        "$KORTEXT_WORKSPACE_DIR"/*|"$KORTEXT_ROOT/.kortext/workspace"/*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

kortext_is_env_path() {
    local base
    base="$(basename "$1")"
    case "$base" in
        .env|.env.*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

kortext_json_field() {
    # JSON içinden bir alan çek. jq yoksa python3 fallback'ine düşer.
    # query formatı: '.tool_input.file_path' gibi nokta yollu erişim.
    local input="$1"
    local query="$2"

    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$input" | jq -r "$query // empty" 2>/dev/null || true
        return 0
    fi

    if command -v python3 >/dev/null 2>&1; then
        # Python fallback — '.a.b.c' yolunu dict erişimine çevirir.
        printf '%s' "$input" | KORTEXT_JSON_QUERY="$query" python3 -c '
import json, os, sys
try:
    data = json.load(sys.stdin)
    query = os.environ.get("KORTEXT_JSON_QUERY", "").lstrip(".")
    if not query:
        print("")
        sys.exit(0)
    parts = query.split(".")
    for p in parts:
        if isinstance(data, dict):
            data = data.get(p, "")
        else:
            data = ""
            break
    if data is None:
        data = ""
    print(data)
except Exception:
    pass
' 2>/dev/null || true
        return 0
    fi

    # Hiçbir araç yoksa boş döndür.
    echo ""
    return 1
}

kortext_staged_files() {
    git diff --cached --name-only --diff-filter=ACMR -z
}
