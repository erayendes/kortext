# Maintenance Cycle (`!maintenance`)

## Bağımlılık Kontrolü

1. **+devops-engineer:** `STACK`'teki bağımlılıkları tara. Major / minor güncellemeleri listele; breaking change içerenleri işaretle. Güvenlik açığı bildirilen bağımlılıklar bakım beklemez — `add_backlog_item --type bug` ile derhal aç. Güncelleme kararını ADR olarak `write_decision` MCP tool'u ile yaz (hangileri güncellenecek, hangileri ertelendi, neden). Güncelleme kapsam-dışıysa `add_backlog_item --type debt`.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/SECURITY.md`

## Teknik Borç Gözden Geçirme

1. **+engineering-manager:** SQL'den `status: to_do, type: debt` item'larını çek. Her debt için: hala geçerli mi (geçersizse `update_backlog_item --status cancelled`), önceliği değişti mi (priority alanını güncelle), bir sonraki döngüde yapılabilir mi. Yeni tespit edilen teknik borçları `add_backlog_item --type debt` ile ekle.

## Learned Gözden Geçirme

1. **+operation-manager:** `learned.md` son 30 gün kayıtlarını tara. Her ders için: alınan önlem uygulandı mı, uygulanmadıysa neden, Debt item açılmalı mı. Aksiyona alınanlar için ilgili kayda not ekle (örn. "Aksiyon: D03 açıldı" şeklinde markdown body güncellemesi); engine `write_learned`'in append-semantik özelliği koruma sağlar.
   - inputs: `.kortext/memory/learned.md`

## Sistem Sağlık

1. **+devops-engineer:** Monitoring dashboard kontrolleri — hata oranı (5xx) son hafta trend, response time (p95) SLA dahilinde mi, disk/bellek kullanımı normal mi. Anomali varsa `add_backlog_item --type bug` ile aç.
   - inputs: `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

2. **+operation-manager:** Engine bookkeeping — handover.md devir sayısı ≥ 5 veya boyut > 30 KB ise `kortext archive handover` ile rotation tetikle. Decisions.md ve learned.md TOC başlığı varsa engine `toc-updater` zaten her yazımda update ediyor; doğruluğunu kontrol et.

## Güvenlik Taraması

1. **+security-engineer:** Bağımlılıkların bilinen güvenlik açığı listesini tara. `SECURITY.md` güncel mi kontrol et. Secrets scanning altyapısının (pre-commit hook + CI pipeline) hala çalıştığını doğrula. Tespit edilen güvenlik açıkları için derhal Bug item aç — bakım tamamlanmasını bekleme.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/security-reports_<slug>_<ts>.md`

## Bakım Raporu

1. **+operation-manager:** Bakım özetini per-file rapora yaz (güncellenen bağımlılıklar, kapatılan borçlar, yeni açılan item'lar, güvenlik durumu, sistem sağlık metrikleri özeti, learned aksiyonları). +prime onayı için sunulur.
   - outputs: `.kortext/reports/status-reports_<slug>_<ts>.md`
   - approver: +prime

**Sonraki akış:** Aksiyona alınacak item varsa `04-development-cycle`; yoksa bakım kapanır.
