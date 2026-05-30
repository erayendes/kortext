# Incident Pipeline (`!incident`)

> **Bu dosyada:** Production incident'ı tek akışta — triaj severity + yol (rollback / hotfix) belirler; seçilen yol koşar; ortak kapanış (prod doğrulama + post-mortem + bug). Yol seçilmeyen adımları motor no-op geçer. Deploy/merge/tag motorun. Foundation okunmaz.

## Triaj

1. **+operation-manager:** Severity sınıflandır (P0 sistem/veri kaybı — derhal, prime eş zamanlı; P1 temel akış — derhal, prime bilgilendir; P2 kısmi/workaround — prime kararıyla) ve yol seç: son deploy kaynaklı + revert güvenli → **rollback**; hata eski sürümde de var / migration geri alınamaz / izole modülde hızlı düzeltilir → **hotfix**. Motor incident bug'ı açar (`add_backlog_item --type bug`, ilgili Epic) ve seçilen yolu işaretler.
   - inputs: `.kortext/references/DATABASE.md`, `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports.md`, incident-triaged

## Rollback Yolu

> Yalnızca triaj **rollback** seçtiyse koşar; yoksa motor atlar. Geçmiş yeniden yazılmaz (force push / reset yasak).

1. **+devops-engineer:** Kod + deployment rollback uygula: hatalı merge/commit'i revert et veya platform rollback'i (Blue/Green, Rolling, VM) ile son kararlı artifact'a dön; audit trail bırak. Sonucu rapora yaz.
   - inputs: `.kortext/references/ACCESS.md`, incident-triaged
   - outputs: `.kortext/reports/delivery-reports.md`, incident-resolved

2. **+db-admin:** Migration uygulanmışsa geri al: snapshot/dump erişimini doğrula, geri-alma yolunu çalıştır, kritik tablo/kayıt tutarlılığını kontrol et. Veri kaybı riski varsa motor prime'a `pending_question` açar. Sonucu rapora yaz.
   - inputs: `.kortext/references/DATABASE.md`, incident-triaged
   - outputs: `.kortext/reports/delivery-reports.md`, incident-resolved

## Hotfix Yolu

> Yalnızca triaj **hotfix** seçtiyse koşar; yoksa motor atlar. Hotfix branch'i `main` üzerinden açılır; düzeltme dar tutulur.

1. **+assignee:** Kök nedeni log + hata + kod incelemesiyle doğrula; minimal, hedefe yönelik düzeltmeyi uygula (kapsamı genişletme). Oku — `STACK` + `STRUCTURE` + `GLOSSARY`; görev türüne göre ek (backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`). Unit test ekle, commit at. Bitince item'ı `test`'e çek; motor `test-cycle`'ı tetikler (gate'ler bug'ın `review_gates`'ine göre).
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, incident-triaged
   - outputs: incident-resolved

## Doğrulama ve Kapanış

> Her iki yol için ortak. Motor, çözülen yolun `main`'e ulaştığından emin olur (rollback: zaten main; hotfix: test-cycle geçince motor main'e merge + `development`'a cherry-pick + patch tag) ve prod'a deploy eder.

1. **+qa-engineer:** Prod smoke testi: raporlanan hatanın düzeldiği, ana akışlar, login, veri okuma/yazma, etkilenen endpoint'ler, migration tutarlılığı, 5xx oranı normale döndü mü. Sonucu rapora yaz.
   - inputs: `.kortext/references/TEST.md`, incident-resolved
   - outputs: `.kortext/reports/test-reports.md`, incident-verified

2. **+operation-manager:** Motor, smoke sonucu hazır olunca prime'a kapanış onayı sorar (P0/P1 zorunlu; P2 severity'e göre). Onay → kapanışa geç. Ret → motor gerekçeyle yeni bug açar, ilgili personaya atar.
   - inputs: incident-verified
   - approver: +prime
   - outputs: incident-approved

3. **+engineering-manager:** Post-mortem yaz (`write_learned`): severity, etkilenen modül, etki süresi, kök neden, tespit, düzeltme/rollback gerekçesi, tekrar önleme. Motor incident bug'ını `done` yapar; kapsam büyüdüyse yeni Task/Debt açılır; kullanıcı bildirimi gerekiyorsa +delivery-manager release notes'a delege.
   - inputs: incident-approved
   - outputs: `.kortext/reports/release-notes.md`

**Sonraki akış:** Kalıcı/derinlemesine düzeltme gerekiyorsa `development-cycle`; çözülmediyse triaj yeniden.
