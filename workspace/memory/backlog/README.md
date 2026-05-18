# Backlog Klasörü

Backlog item dosyalarının tutulduğu klasör.

## Dashboard'lar
- `epic-dashboard.md` — Aktif epic'lerin durum tablosu
- `version-dashboard.md` — Sürüm planlama tablosu
- `debt-dashboard.md` — Teknik borç tablosu

## Item Dosyaları
Item dosyaları prefix'lerle adlandırılır:
- `TXX-` — Task (geliştirme görevi)
- `BXX-` — Bug (hata)
- `DXX-` — Debt (teknik borç)
- `EXX-` — Epic (büyük iş kalemi)
- `SXX-` — Spike (araştırma)
- `HXX-` — Hotfix (production yaması)

## Templates
Yeni item oluşturmadan önce `../../../workspace/templates/` altındaki şablonları kullan:
- `TXX-[task-name].md`
- `BXX-[bug-name].md`
- `DXX-[debt-name].md`
- `EXX-[epic-name].md`
- `SXX-[spike-name].md`
- `HXX-[hotfix-name].md`

Veya `scripts/kortext-backlog-add.py` ile otomatik oluştur.

## Doğrulama
Bu klasörün bootstrap'i `scripts/kortext-consistency-check.py` tarafından doğrulanır. Yukarıdaki üç dashboard dosyası eksik olursa kontrol başarısız olur.
