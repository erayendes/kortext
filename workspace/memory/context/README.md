# Context Klasörü

Aktif ajanların distributed context dosyalarının tutulduğu klasör.

## Yapı
Her ajan kendi context dosyasına yazar:
- `[agent-name]-active.md` — Örn. `backend-developer-active.md`, `qa-engineer-active.md`

Şablon: `../../templates/[agent-name]-active.md`

## Yaşam Döngüsü
1. Ajan göreve başladığında dosyayı oluşturur.
2. Görev süresince ilerleme bu dosyaya yazılır.
3. Görev kapanışında dosya **silinir**, handover özeti `../handover.md`'ye taşınır.

## Stale Threshold
Aktif context dosyalarının "stale" sayılma eşiği: **24 saat** (`KORTEXT_STALE_HOURS_CONTEXT` env var).

Stale dosyalar `scripts/kortext-session-start.py` ve `scripts/kortext-context-check.py` tarafından raporlanır.

## Lock Mekanizması
Bu klasörde aynı anda birden fazla ajanın yazmasını önlemek için `scripts/kortext-lock.py` kullanılır:
```bash
python3 scripts/kortext-lock.py acquire --file workspace/memory/context/backend-developer-active.md --agent backend-developer
# ... iş yap ...
python3 scripts/kortext-lock.py release --file workspace/memory/context/backend-developer-active.md
```

## Format
Standart context satır formatı:
```
### +persona | TXX | Status | HH:MM | kısa özet
```

Tek bir ajan için birden fazla `-active.md` dosyası bulunması bir hatadır; `kortext-context-check.py` bunu DUPLICATE CONTEXT olarak raporlar.
