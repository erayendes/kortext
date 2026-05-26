# Rollback Pipeline

## Triage

1. **+devops-engineer:** Rollback gerekçesini ve fizibilitesini değerlendir. Hata kaynağını (bu deployment mı, bağımlı servis mi), DB migration uygulandı mı + geri alınabilir mi, rollback'in kendisinin veri kaybı riski, hotfix daha hızlı/güvenli mi (`08-hotfix-pipeline` değerlendir). 5 dakika içinde karar. Migration irreversible ise rollback durdur, +prime'a `pending_question` aç (hotfix / rollback / bekle seçenekleri).
   - inputs: `.kortext/references/DATABASE.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Kullanıcı Bildirimi

1. **+copywriter:** P0/P1 etkisi varsa kullanıcı iletişim metni hazırla. Durum sayfası, e-posta veya in-app bildirim — kısa, durumu kabul eden, çözümün sürdüğünü belirten tonda. Dış yayın için +prime onayı `pending_question` ile alınır.

## Kod Rollback

1. **+devops-engineer:** Kod rollback uygula. `main` geçmişini koru (force push / `git reset --hard` yasak). Hatalı merge veya commit revert et; merge commit revert'inde parent seçimini doğrula; birden fazla commit ise revert sırası ve etki alanını delivery raporuna yaz. PR veya emergency change olarak audit trail bırak. Son kararlı tag/artifact'ı delivery raporunda doğrula.
   - inputs: `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## DB Migration Rollback

1. **+db-admin:** DB migration uygulanmışsa rollback'i uygula. Snapshot/dump erişilebilirliği doğrula, migration geri alma yolunu çalıştır. Migration öncesi ve sonrası kritik tablo/kayıt kontrolleri yap. Veri kaybı riski varsa +operation-manager ve +prime'ı `pending_question` ile bilgilendir. Sonucu delivery raporuna yaz.
   - inputs: `.kortext/references/DATABASE.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Deployment Rollback

1. **+devops-engineer:** Deployment platformunun rollback'ini uygula. Strateji (Blue/Green, Rolling, VM) önceki deploy raporundan okunur; önceki başarılı artifact/image/tag doğrulanır; proje-spesifik rollback komutu CI/CD yapılandırmasından alınır. Platform rollback'i tamamlanana kadar deployment izle. Artifact/tag/ortam/başlangıç-bitiş/operator bilgisini delivery raporuna yaz.
   - inputs: `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Post-Rollback Doğrulama

1. **+qa-engineer:** Production smoke testi (ana sayfa, login/logout, veri okuma/yazma, ödeme, API endpoint'leri, DB tutarlılığı, hata oranı + response time normale döndü mü). Minimum 15 dk monitoring izle. Hata oranı düşmüyorsa +operation-manager escalate eder, +prime'a bildir. Smoke test sonucu PASS olmadan rollback başarılı sayılmaz.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

## Hatalı Sürümü Dondur

1. **+devops-engineer:** Hatalı release tekrar deploy edilmesin diye sürümü `blocked release` olarak işaretle. Git tag veya registry işaretlemesi proje-spesifik güvenli yöntemle (force push / history rewrite yasak). Kayda en az şunlar girer: hatalı sürüm/artifact, bloklama sebebi, rollback zamanı, ilgili Bug item ID, tekrar deploy için gereken koşul.
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Kök Neden ve Bug

1. **+engineering-manager:** Kök neden analizi `write_learned` MCP tool ile learned.md'ye eklenir (tetikleyici eşiği, tespit süresi, toplam etki süresi, kök neden, tespit, rollback kararı gerekçesi, staging'de yakalama önlemi). Rollback'e sebep olan hata için `add_backlog_item --type bug` ile yeni Bug item aç: status `to_do`, assignee +engineering-manager tarafından belirlenir, review_gates en az `code_review` + `quality_control` (güvenlik/veri etkisi varsa `security_check`), ilgili Epic ile ilişkilendir.

**Sonraki akış:** Bug normal döngüye → `04-development-cycle`; P0/P1 etki devam ediyorsa → `08-hotfix-pipeline`.
