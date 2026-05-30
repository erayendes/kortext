# Test Cycle

> **Bu dosyada:** Seçili gate'ler `test` kolonunda paralel koşar; geçerse UAT. Join/merge/kapanış motorun.

## Test

1. **+engineering-manager:** Item'ın `review_gates` alanı `code_review` içeriyorsa çalış; yoksa atla. Kodu ve mimariyi referanslara göre incele — `STACK` + `STRUCTURE` + `GLOSSARY`; görev türüne göre ek oku (backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`). Acceptance criteria'nın her maddesinin kodda test edilebilir bir karşılığı olduğunu doğrula (statik inceleme). Sorun varsa item'ı `in_progress`'e döndür ve assignee'ye ata (bulguyu gate-run kaydına yaz). Sorun yoksa gate'i pass işaretle.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`
   - outputs: item-tested

2. **+qa-engineer:** Item'ın `review_gates` alanı `quality_control` içeriyorsa çalış; yoksa atla. Acceptance criteria'yı local test URL üzerinde davranış olarak doğrula; manuel/otomatik test senaryolarını koştur, regresyon riskini kontrol et. Sorun varsa item'ı `in_progress`'e döndür ve assignee'ye ata (bulguyu gate-run kaydına yaz). Sorun yoksa gate'i pass işaretle.
   - inputs: `.kortext/references/TEST.md`
   - outputs: item-tested

3. **+security-engineer:** Item'ın `review_gates` alanı `security_control` içeriyorsa çalış; yoksa atla. Auth, secret yönetimi, veri işleme, erişim kontrolü ve compliance açısından değişikliği incele (statik; gerekiyorsa local test URL üzerinde). Sorun varsa item'ı `in_progress`'e döndür ve assignee'ye ata (bulguyu gate-run kaydına yaz). Sorun yoksa gate'i pass işaretle.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: item-tested

4. **+designer:** Item'ın `review_gates` alanı `design_review` içeriyorsa çalış; yoksa atla. UI/UX, responsive davranış, erişilebilirlik ve token uyumunu local test URL üzerinde incele. Sorun varsa item'ı `in_progress`'e döndür ve assignee'ye ata (bulguyu gate-run kaydına yaz). Sorun yoksa gate'i pass işaretle.
   - inputs: `.kortext/references/DESIGN.md`
   - outputs: item-tested

## Review

1. **+prime:** `uat` gate'i seçiliyse motor, tüm test gate'leri geçtikten sonra prime'a onay sorar (local test URL + acceptance criteria). Onay → motor merge + kapanış. Ret → item `in_progress`, assignee'ye atanır (gerekçe gate-run kaydında).
   - inputs: item-tested
   - approver: +prime
   - outputs: item-accepted

Seçili gate'ler + (varsa) UAT pass → motor değişikliği `development`'a merge eder, item `done`. Gate sonuçlarından toplu denetim raporu üretilir.

**Sonraki:** Item burada biter. Item bir epic'i kapatıyorsa motor `deployment-cycle`'ı staging milestone'u olarak tetikler — koşullu, motor işi (§5.9); otomatik zincir değil.
