# Rollback Pipeline (`!rollback`)

> **Bu dosyada:** Son deploy kaynaklı production incident'ı son kararlı sürüme geri alır — triaj severity belirler, kod + migration rollback, prod doğrulama + post-mortem. Tek düz akış; rollback/merge/tag motorun. Geçmiş yeniden yazılmaz (force push / reset yasak). Foundation okunmaz.

## Triaj

1. **+operation-manager:** Severity sınıflandır (P0 sistem/veri kaybı — derhal, prime eş zamanlı; P1 temel akış — derhal, prime bilgilendir; P2 kısmi/workaround — prime kararıyla). Rollback'in doğru yol olduğunu doğrula: son deploy kaynaklı + revert güvenli. Değilse (hata eski sürümde de var / migration geri alınamaz / izole modülde hızlı düzeltilir) prime'ı `hotfix-pipeline`'a yönlendir ve durdur. Motor incident bug'ı açar (`add_backlog_item --type bug`, ilgili Epic).
   - inputs: `.kortext/references/DATABASE.md`, `.kortext/references/ACCESS.md`
   - outputs: `.kortext/reports/delivery-reports.md`, incident-triaged

## Rollback

1. **+devops-engineer:** Kod + deployment rollback uygula: hatalı merge/commit'i revert et veya platform rollback'i (Blue/Green, Rolling, VM) ile son kararlı artifact'a dön; audit trail bırak. Sonucu rapora yaz.
   - inputs: `.kortext/references/ACCESS.md`, incident-triaged
   - outputs: `.kortext/reports/delivery-reports.md`, code-rolled-back

2. **+db-admin:** Migration uygulanmışsa geri al: snapshot/dump erişimini doğrula, geri-alma yolunu çalıştır, kritik tablo/kayıt tutarlılığını kontrol et. Veri kaybı riski varsa motor prime'a `pending_question` açar. Migration yoksa tutarlılığı doğrula ve geç. Sonucu rapora yaz.
   - inputs: `.kortext/references/DATABASE.md`, code-rolled-back
   - outputs: `.kortext/reports/delivery-reports.md`, incident-resolved

## Doğrulama ve Kapanış

> Motor rollback'in `main`'e ulaştığından emin olur (rollback zaten main üzerinde) ve prod'u son kararlı duruma getirir.

1. **+qa-engineer:** Prod smoke testi: raporlanan hatanın düzeldiği, ana akışlar, login, veri okuma/yazma, etkilenen endpoint'ler, migration tutarlılığı, 5xx oranı normale döndü mü. Sonucu rapora yaz.
   - inputs: `.kortext/references/TEST.md`, incident-resolved
   - outputs: `.kortext/reports/test-reports.md`, incident-verified

2. **+operation-manager:** Motor, smoke sonucu hazır olunca prime'a kapanış onayı sorar (P0/P1 zorunlu; P2 severity'e göre). Onay → kapanışa geç. Ret → motor gerekçeyle yeni bug açar, ilgili personaya atar.
   - inputs: incident-verified
   - approver: +prime
   - outputs: incident-approved

3. **+engineering-manager:** Post-mortem yaz (`write_learned`): severity, etkilenen modül, etki süresi, kök neden, tespit, rollback gerekçesi, tekrar önleme. Motor incident bug'ını `done` yapar; kapsam büyüdüyse yeni Task/Debt açılır; kullanıcı bildirimi gerekiyorsa +delivery-manager release notes'a delege.
   - inputs: incident-approved
   - outputs: `.kortext/reports/release-notes.md`

**Sonraki:** Kalıcı/derinlemesine düzeltme gerekiyorsa motor `development-cycle`'ı açar — koşullu, motor işi (§5.9); otomatik zincir değil.
