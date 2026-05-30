# Hotfix Pipeline (`!hotfix`)

> **Bu dosyada:** Production'daki kritik hatayı dar kapsamlı düzeltmeyle giderir — triaj severity belirler, minimal fix + test, prod doğrulama + post-mortem. Tek düz akış; hotfix branch'i `main` üzerinden açılır, merge/cherry-pick/tag motorun. Foundation okunmaz.

## Triaj

1. **+operation-manager:** Severity sınıflandır (P0 sistem/veri kaybı — derhal, prime eş zamanlı; P1 temel akış — derhal, prime bilgilendir; P2 kısmi/workaround — prime kararıyla). Hotfix'in doğru yol olduğunu doğrula: hata eski sürümde de var / migration geri alınamaz / izole modülde hızlı düzeltilir. Son deploy kaynaklı + revert güvenliyse prime'ı `rollback-pipeline`'a yönlendir ve durdur. Motor incident bug'ı açar (`add_backlog_item --type bug`, ilgili Epic).
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/reports/delivery-reports.md`, incident-triaged

## Hotfix

1. **+assignee:** Kök nedeni log + hata + kod incelemesiyle doğrula; minimal, hedefe yönelik düzeltmeyi uygula (kapsamı genişletme). Oku — `STACK` + `STRUCTURE` + `GLOSSARY`; görev türüne göre ek (backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`). Unit test ekle, commit at. Bitince item'ı `test`'e çek; motor `test-cycle`'ı tetikler (gate'ler bug'ın `review_gates`'ine göre).
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, incident-triaged
   - outputs: incident-resolved

## Doğrulama ve Kapanış

> Motor, hotfix `test-cycle`'ı geçince `main`'e merge + `development`'a cherry-pick + patch tag yapar ve prod'a deploy eder.

1. **+qa-engineer:** Prod smoke testi: raporlanan hatanın düzeldiği, ana akışlar, login, veri okuma/yazma, etkilenen endpoint'ler, migration tutarlılığı, 5xx oranı normale döndü mü. Sonucu rapora yaz.
   - inputs: `.kortext/references/TEST.md`, incident-resolved
   - outputs: `.kortext/reports/test-reports.md`, incident-verified

2. **+operation-manager:** Motor, smoke sonucu hazır olunca prime'a kapanış onayı sorar (P0/P1 zorunlu; P2 severity'e göre). Onay → kapanışa geç. Ret → motor gerekçeyle yeni bug açar, ilgili personaya atar.
   - inputs: incident-verified
   - approver: +prime
   - outputs: incident-approved

3. **+engineering-manager:** Post-mortem yaz (`write_learned`): severity, etkilenen modül, etki süresi, kök neden, tespit, düzeltme gerekçesi, tekrar önleme. Motor incident bug'ını `done` yapar; kapsam büyüdüyse yeni Task/Debt açılır; kullanıcı bildirimi gerekiyorsa +delivery-manager release notes'a delege.
   - inputs: incident-approved
   - outputs: `.kortext/reports/release-notes.md`

**Sonraki:** Kalıcı/derinlemesine düzeltme gerekiyorsa motor `development-cycle`'ı açar — koşullu, motor işi (§5.9); otomatik zincir değil.
