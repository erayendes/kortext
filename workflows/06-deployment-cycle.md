# Deployment Cycle (`!deploy prod`)

## Release Readiness

1. **+delivery-manager:** Release readiness'i topla. Release kapsamındaki tüm item'ların `done` olduğunu, test coverage ve security findings'in temiz olduğunu, API dokümantasyonunun güncel olduğunu, branch'in temiz/conflict'siz olduğunu, production environment'ın hazır olduğunu, DB migration'ların test edilmiş olduğunu ve rollback planının yazılı olduğunu kontrol et. Go/No-Go özetini per-file raporda yaz; +prime production deploy onayı bekle.
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/API.md`, `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`
   - approver: +prime

## Pre-Deployment

1. **+devops-engineer:** Production environment kontrolü. `.env.example`'daki gerekli key listesini çıkar; production'da set olduklarını doğrula (gerçek değerleri okuma, sadece presence check). Eksik key varsa +prime'a `pending_question` aç. `ACCESS.md` production URL/instance değerlerini doğrula.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`

2. **+db-admin:** DB migration hazırla (migration yoksa atla). Migration ileri/geri yolunun mevcut olduğunu, staging'de başarıyla çalıştığını doğrula. Production snapshot/dump al, yedeğin erişilebilir bir konumda saklandığını doğrula. Veri kaybı riski varsa +prime onayı zorunlu — `pending_question` aç.
   - inputs: `.kortext/references/DATABASE.md`

3. **+devops-engineer:** Production artifact hazırla. Release version ile build et, son kararlı artifact'ı rollback referansı olarak işaretle. Artifact registry/path/versiyon bilgisini delivery raporuna append et.
   - inputs: `.kortext/references/ACCESS.md`

## Staging Doğrulama

1. **+qa-engineer:** Staging deploy sonrası smoke + E2E + migration testleri çalıştır. Fail ise pipeline durur, +prime'a `pending_question` ile bildir. Pass ise production'a hazırlık biter.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

## Production Deployment

1. **+devops-engineer:** Production'a deploy. DB migration varsa production'da uygula (fail → `07-rollback-pipeline` tetikle, deploy dur). Traffic geçişi (Blue/Green, Rolling Update veya VM/Compose) proje altyapısına göre uygula; strateji seçimini ve komutları delivery raporuna append et.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/DATABASE.md`

2. **+qa-engineer:** Post-deploy production smoke test. Ana sayfa + kritik sayfa yükleme, login/logout, veri okuma (liste/detay), veri yazma (form/kayıt), kritik iş akışı (ödeme vb.), etkilenen API endpoint'leri 200, DB migration veri tutarlılığı, 5xx hata oranı beklenen seviyede.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

## Post-Deploy İzleme

1. **+devops-engineer:** Minimum 15 dakika monitoring dashboard izle. Eşikler: hata oranı (5xx) deploy öncesine göre +%5, response time (p95) 2x veya SLA aşımı, kritik iş akışı hataları, otomatik alarm tetiklemesi — herhangi biri ⇒ `07-rollback-pipeline` başlat. P0 durumunda +prime onayı beklemeden rollback (onay eş zamanlı alınır). 15 dk sorunsuz ⇒ deployment başarılı.

## Kapanış

1. **+devops-engineer:** Semantik versiyon tag'i oluştur (`git tag -a v<A.B.C>`) ve push et. Tag bilgisini delivery raporuna append et.

2. **+growth-expert:** SEO ve analytics kontrolleri. `sitemap.xml` güncelle ve Google Search Console'a gönder; `robots.txt` production için doğrula; analytics + tag manager yapılandırmasının aktif olduğunu kontrol et.

3. **+delivery-manager:** Release notes yaz. Kullanıcıya yönelik yeni özellikler, bug düzeltmeleri, breaking changes, upgrade notları.
   - outputs: `.kortext/reports/release-notes_<slug>_<ts>.md`

**Sonraki akış:** Yeni release döngüsü için `development-cycle`; hotfix gerekirse `08-hotfix-pipeline`.
