# [hotfix-id]-[hotfix-name]

> **Type:** hotfix
> **Severity:** [P0/P1/P2]
> **Status:** [To Do/In Progress/Test/Review/Done]
> **Linked Bug:** [BXX] - [bug-name]
> **Assignee:** [+ajan] @ [selected-ai-model]

---

## Incident Summary

[Production'da tespit edilen kritik hatanın özeti. Kim, ne zaman, hangi modülde, hangi etkiyle?]

## Affected Versions

- **Bulunduğu sürüm:** v[A.B.C]
- **Etkilenen sürümler:** v[A.B.C] – v[A.B.C]
- **Düzeltilecek sürüm (patch):** v[A.B.C+1]

## Root Cause

[Hataya ne sebep oldu? Log, hata mesajı ve kod incelemesiyle doğrulanan kök neden.]

## Fix Description

[Yapılan minimal düzeltmenin teknik açıklaması. Hotfix kapsamı dar tutulmalı.]

### Değişen Dosyalar

- `path/to/file1.ext` — [ne değişti]
- `path/to/file2.ext` — [ne değişti]

## Rollout Plan

1. Branch: `hotfix/[item-id]-[short-name]` (main üzerinden)
2. Staging deploy + smoke test
3. Onaylar:
   - [ ] Code review (+engineering-manager)
   - [ ] Smoke test (+qa-engineer)
   - [ ] Security check (+security-engineer) — P0/P1 zorunlu
   - [ ] Production approval (+prime) — P0/P1 zorunlu
4. Merge → main → patch tag (v[A.B.C+1])
5. Backport → development branch
6. Production deploy
7. Post-deploy izleme (en az 15 dakika)

## Acceptance Criteria

- [ ] Bug item Acceptance Criteria karşılandı
- [ ] Hata production'da tekrar üretilemiyor
- [ ] Yan etki riskli komşu modüller test edildi
- [ ] Code review tamamlandı
- [ ] Security check tamamlandı (P0/P1 ise)

## Rollback Plan

[Hotfix beklenen sonucu vermezse rollback pipeline tetiklenir. Geri dönüş adımları:]

- [Adım 1]
- [Adım 2]

## Post-Mortem (Root Cause Analysis)

- **Tespit zamanı:** [YYYY-MM-DD HH:MM]
- **Düzeltme zamanı:** [YYYY-MM-DD HH:MM]
- **Etki süresi:** [X dakika/saat]
- **Önlem:** [Benzer hatayı önlemek için ne yapılmalı?]
- **Learned entry:** [`.kortext/memory/learned.md` linki]

## Work Log

- **[YYYY.MM.DD-HH:MM] (+ajan):** [Hotfix başlatıldı.]

## Decisions

- [Hotfix kapsamına dahil edilen/edilmeyen kararlar.]

## Notes

- [Notlar buraya yazılacak.]
- Force push veya history rewrite YAPILMAZ.
- Hotfix kapsamı genişletilmez; kapsam büyürse yeni Task/Debt aç.
