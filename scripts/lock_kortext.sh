#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KORTEXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KORTEXT_ROOT="$(cd "$KORTEXT_DIR/.." && pwd)"

# Bu script Kortext Framework'ün kritik dosyalarını sadece okunabilir hale getirir.

# Kök dizin dosyaları
FILES=("$KORTEXT_DIR/AGENTS.md")

# Korumaya alınacak Framework klasörleri
DIRS="$KORTEXT_DIR/agents $KORTEXT_DIR/rules $KORTEXT_DIR/workflows"

echo "Kortext Framework dosyaları kilitleniyor..."

# Dosyaları kilitle
for FILE in "${FILES[@]}"; do
    if [ -f "$FILE" ]; then
        echo "- $FILE kilitleniyor..."
        chmod 444 "$FILE"
    fi
done

# Klasörleri ve içindekileri kilitle (Yazma yetkisini kaldır, okuma ve erişim yetkisini koru)
for DIR in $DIRS; do
    if [ -d "$DIR" ]; then
        echo "- $DIR klasörü ve içeriği kilitleniyor..."
        chmod -R a-w "$DIR"
        chmod -R a+rX "$DIR"
    fi
done

echo "İşlem tamamlandı. Framework dosyaları artık sadece okunabilir."
