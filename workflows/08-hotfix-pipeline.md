# Hotfix Pipeline

## Karar ve Sınıflandırma

1. **+operation-manager:** Hotfix mi rollback mi karar ver. Son deploy'dan kaynaklı ve revert güvenli ise → `07-rollback-pipeline`. Aksi halde hotfix (eski sürümde de varsa, rollback veri kaybı yapar, migration revert tutarlılığı bozar, hata izole modülde kısa sürede düzeltilebilir). Severity sınıflandır: P0 (sistem çöktü, veri kaybı riski — derhal başla, +prime eş zamanlı), P1 (temel iş akışı, çoğu kullanıcı — derhal başla, +prime bilgilendir), P2 (kısmi, workaround var — +prime kararıyla hotfix veya normal döngü).
   - inputs: `.kortext/references/DATABASE.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Hazırlık

1. **+engineering-manager:** Bug item aç (P0'da hotfix başlatıldıktan hemen sonra, süreç kapanmadan kaydet). `add_backlog_item --type bug --id BXX --title "..."` ile aç, status `in_progress`, ilgili Epic ile ilişkilendir. Etkilenen geliştirici ajan(lar)ı, +qa-engineer, gerekirse +security-engineer ve +db-admin çağrılır.

2. **+devops-engineer:** Hotfix branch'ini `main` üzerinden aç (`hotfix/<item-id>-<short-name>`). Force push veya history rewrite yasak.
   - inputs: `.kortext/references/ACCESS.md`

## Düzeltme

1. **+engineering-manager:** Kök nedeni log + hata mesajı + kod incelemesiyle doğrula. Minimal, hedefe yönelik düzeltme yap; hotfix kapsamını genişletme. Acceptance Criteria'yı karşılayacak şekilde uygula. Commit mesajları `GLOSSARY` standartlarına uymalı. Branch'e push.
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`

## DB Migration (Varsa)

1. **+db-admin:** Migration mümkünse geri alınabilir şekilde hazırla. Backup/snapshot planını doğrula. Veri kaybı/müşteri etkisi riski varsa +prime'a `pending_question` aç (devam etme). Staging'de test et — başarısızsa production'a deploy yok. Sonucu delivery raporuna append.
   - inputs: `.kortext/references/DATABASE.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Test ve Güvenlik

1. **+qa-engineer:** Hotfix branch'ini staging'e deploy et; `05-test-cycle` standardına göre çalıştır. En az: raporlanan hatanın düzeldiği, etkilenen modül, yan etki riski olan komşu modüller, auth/session akışları, veri okuma/yazma, etkilenen API endpoint'leri, DB migration varsa veri tutarlılığı.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

2. **+security-engineer:** P0/P1 veya güvenlik/veri etkisi olan hotfix'lerde zorunlu. Auth, secret, veri işleme, erişim kontrolü açısından PR'ı incele. Bulgu varsa ayrı security raporu yaz; ana test raporuna özet ekle.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/security-reports_<slug>_<ts>.md`

## Production Onayı

1. **+operation-manager:** Code review + smoke test + (varsa) security check sonuçlarını topla; +prime production deploy onayını `pending_question` ile al. P0/P1'de onay zorunlu; P2'de severity'e göre.
   - approver: +prime

## Merge ve Tag

1. **+devops-engineer:** Hotfix'i `main`'e merge et; aynı değişikliği `development`'e de cherry-pick et (gelecek sürümlerde kaybolmasın). Patch version tag (`v1.0.0` → `v1.0.1`). Hotfix branch temizliği proje git kurallarına göre.
   - inputs: `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports_<slug>_<ts>.md`

## Production Deploy

1. **+devops-engineer:** `06-deployment-cycle` Production Deployment kurallarına göre deploy et (gerçek secret okuma/yazma/raporlama yasak). Post-deploy smoke + minimum 15 dk monitoring. Sorun devam ederse → `07-rollback-pipeline`.

## Kapanış

1. **+engineering-manager:** `write_learned` MCP tool ile post-mortem yaz (severity, etkilenen modül, etki süresi, kök neden, tespit, düzeltme, önlem). Bug item'ı `done` yap; kapsam büyüdüyse yeni Task/Debt item aç. Release notes için +delivery-manager'a delege.

2. **+delivery-manager:** Kullanıcıya yönelik kısa release notes yaz.
   - outputs: `.kortext/reports/release-notes_<slug>_<ts>.md`

**Sonraki akış:** Sorun çözüldü → kapanış; deploy sonrası sorun → `07-rollback-pipeline`; kalıcı düzeltme gerekiyor → `04-development-cycle`.
