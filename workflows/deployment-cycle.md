# Deployment Cycle (`!deploy prod`)

> **Bu dosyada:** development trunk'tan ortam merdiveni — epic done → staging, version done → preprod, preprod onayı → main merge + prod. Deploy/merge/tag motorun; persona'lar doğrular ve raporlar. Raporlar tek-dosya (üste eklenir, insan okuru için). Foundation okunmaz.

## Staging (epic done)

> Motor, epic kapanınca `development`'ı staging'e (test verisi) deploy eder. Personalar yalnızca o epic'te ilgili gate koşmuş item'lar için rapor yazar; koşmadıysa atlar. Raporlar paralel; bitince motor prime'a staging onayı sorar.

1. **+qa-engineer:** Epic kapsamındaki davranışsal doğrulamayı staging'de topla; sonucu rapora yaz.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports.md`, staging-reviewed

2. **+security-engineer:** Epic kapsamındaki güvenlik bulgularını staging'de doğrula; sonucu rapora yaz.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/security-reports.md`, staging-reviewed

3. **+designer:** Epic kapsamındaki UI/UX/erişilebilirlik uyumunu staging'de doğrula; sonucu rapora yaz.
   - inputs: `.kortext/references/DESIGN.md`
   - outputs: `.kortext/reports/design-reports.md`, staging-reviewed

4. **+engineering-manager:** Epic durum raporu yaz (backlog state'ten): kapsam, tamamlanan item'lar, açık riskler, version'a hazırlık.
   - outputs: `.kortext/reports/status-reports.md`, staging-reviewed

5. **+devops-engineer:** Staging deploy sonucunu rapora yaz: ortam durumu, migration, smoke sonucu, version'a engel var mı.
   - inputs: `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports.md`, staging-reviewed

6. **+prime:** Motor, tüm staging raporları hazır olunca prime'a staging onayı sorar (staging URL + raporlar). Onay → epic version'a hazır. Ret → motor, prime'ın gerekçesiyle yeni bir `type: bug` item açar (dosya köprüsü: backlog.yaml → ingester) ve epic owner'a triaj için atar; bug çözülmeden epic kapanmaz.
   - inputs: staging-reviewed
   - approver: +prime
   - outputs: staging-approved

## Preprod (version done)

> Motor, version kapanınca (tüm epic'leri staging onaylı) `development`'ı preprod'a (canlı veri) deploy eder. Geçerse prime onayı main merge + prod deploy'u tetikler.

1. **+devops-engineer:** Preprod deploy sonucunu doğrula ve rapora yaz: migration ileri/geri yolu, smoke, canlı-veri uyumu (KVKK/GDPR), rollback planı, prod hazırlığı.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/DATABASE.md`, `.kortext/references/SECURITY.md`, staging-approved
   - outputs: `.kortext/reports/delivery-reports.md`, preprod-reviewed

2. **+prime:** Motor, preprod raporu hazır olunca prime'a preprod onayı sorar (preprod URL + rapor). Onay → motor `development`'ı `main`'e merge eder ve prod deploy'u başlatır. Ret → motor gerekçeyle bug açar ve epic owner'a triaj için atar; version `development`'ta kalır, bug çözülmeden prod'a çıkmaz.
   - inputs: preprod-reviewed
   - approver: +prime
   - outputs: preprod-approved

## Production (preprod onayı sonrası)

> Motor `main`'e merge etti; prod deploy bu fazda yürür.

1. **+devops-engineer:** Prod artifact'ı release version ile build et, rollback referansı olarak son kararlı artifact'ı işaretle. Migration varsa prod'da uygula (fail → `rollback-pipeline`). Traffic geçişini (Blue/Green, Rolling, VM) proje altyapısına göre uygula; strateji + komutları rapora yaz.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/DATABASE.md`, preprod-approved
   - outputs: `.kortext/reports/delivery-reports.md`, prod-deployed

2. **+qa-engineer:** Prod smoke testi: ana akışlar, login, veri okuma/yazma, kritik iş akışı, etkilenen endpoint'ler, migration tutarlılığı, 5xx oranı.
   - inputs: `.kortext/references/TEST.md`, prod-deployed
   - outputs: `.kortext/reports/test-reports.md`, prod-verified

3. **+devops-engineer:** İzleme eşiklerini ve alarmları tanımla (5xx +%5, p95 2x/SLA, kritik akış hatası); motor deploy sonrası gecikmeli doğrulama planlar — eşik aşımı/alarm ⇒ severity'e göre `rollback-pipeline` veya `hotfix-pipeline` (P0'da onay beklemeden). Sorunsuz pencere sonunda motor semantik versiyon tag'i oluşturur + push eder; sen release notes yaz (yeni özellikler, düzeltmeler, breaking changes, upgrade notları).
   - inputs: `.kortext/references/ACCESS.md`, prod-verified
   - outputs: `.kortext/reports/release-notes.md`

**Sonraki:** Yeni version'da motor `development-cycle`'ı tetikler; prod'da sorun çıkarsa severity'e göre `rollback-pipeline` veya `hotfix-pipeline` — koşullu, motor işi (§5.9); otomatik zincir değil.
