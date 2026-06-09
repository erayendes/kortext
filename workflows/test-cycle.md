# Test Cycle

> **Bu dosyada:** Seçili gate'ler `test` kolonunda paralel koşar; geçerse UAT. Join/merge/kapanış motorun.

## Gate verdict raporu (STRICT — zorunlu)

Her gate persona'sı, mekanik "çalıştım → geçti" yerine **makine-okunur bir karar raporu** yazar. Motor bu raporu okur; karar sadece rapordaki `verdict` alanından gelir.

- **Çıktı yolu (tam):** `.kortext/reports/<gate>-reports_<slug>_<ts>.md` (örn. `quality_control-reports_NOT_2026-06-09_10-00-00.md`).
- **Frontmatter (YAML, `---` blokları arasında):**
  ```yaml
  verdict: pass | fail
  ac_results:
    - text: "<acceptance criterion metni>"
      status: met | unmet
    - text: "<bir sonraki kriter>"
      status: met | unmet
  ```
- **Gövde:** insan-okunur bulgular (ne, nerede, neden).
- **Kural:** Her acceptance criterion'ı **tek tek** değerlendir. **Herhangi bir kriter `unmet`** ya da gerçek bir sorun varsa → `verdict: fail`. Rapor yoksa veya `verdict` eksik/geçersizse → motor STRICT olarak **fail** sayar ve item kodlamaya geri döner (`in_progress`). `ac_results` motorun item AC checkbox'larını işaretlemesi için kullanılır — geçen kriter işaretlenir, geçmeyen kalkar.

## Test

1. **+engineering-manager:** Item'ın `review_gates` alanı `code_review` içeriyorsa çalış; yoksa atla. Kodu ve mimariyi referanslara göre incele — `STACK` + `STRUCTURE` + `GLOSSARY`; görev türüne göre ek oku (backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`). Acceptance criteria'nın her maddesinin kodda test edilebilir bir karşılığı olduğunu doğrula (statik inceleme). Her kriteri tek tek değerlendir; **yukarıdaki "Gate verdict raporu"** formatında `verdict: pass|fail` + `ac_results` yaz. Herhangi bir kriter karşılanmıyorsa veya gerçek bir sorun varsa `verdict: fail`.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`
   - outputs: `.kortext/reports/code_review-reports_<slug>_<ts>.md`

2. **+qa-engineer:** Item'ın `review_gates` alanı `quality_control` içeriyorsa çalış; yoksa atla. Acceptance criteria'yı local test URL üzerinde davranış olarak doğrula; manuel/otomatik test senaryolarını koştur, regresyon riskini kontrol et. Her kriteri tek tek değerlendir; **yukarıdaki "Gate verdict raporu"** formatında `verdict: pass|fail` + `ac_results` yaz. Herhangi bir kriter karşılanmıyorsa veya gerçek bir sorun varsa `verdict: fail`.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/quality_control-reports_<slug>_<ts>.md`

3. **+security-engineer:** Item'ın `review_gates` alanı `security_control` içeriyorsa çalış; yoksa atla. Auth, secret yönetimi, veri işleme, erişim kontrolü ve compliance açısından değişikliği incele (statik; gerekiyorsa local test URL üzerinde). Her kriteri tek tek değerlendir; **yukarıdaki "Gate verdict raporu"** formatında `verdict: pass|fail` + `ac_results` yaz. Herhangi bir güvenlik açığı veya karşılanmayan kriter varsa `verdict: fail`.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/security_control-reports_<slug>_<ts>.md`

4. **+designer:** Item'ın `review_gates` alanı `design_review` içeriyorsa çalış; yoksa atla. UI/UX, görsel hiyerarşi, spacing/hizalama, renk kontrastı (WCAG AA), tutarlılık, responsive davranış ve token uyumunu local test URL üzerinde incele. Her kriteri tek tek değerlendir; **yukarıdaki "Gate verdict raporu"** formatında `verdict: pass|fail` + `ac_results` yaz. Kötü UI (zayıf hiyerarşi, hizasız/eşit-olmayan spacing, AA-altı kontrast, tutarsızlık, kırık responsive) veya karşılanmayan kriter varsa `verdict: fail`.
   - inputs: `.kortext/references/DESIGN.md`
   - outputs: `.kortext/reports/design_review-reports_<slug>_<ts>.md`

## Review

1. **+prime:** `uat` gate'i seçiliyse motor, tüm test gate'leri geçtikten sonra prime'a onay sorar (local test URL + acceptance criteria). Onay → motor merge + kapanış. Ret → item `in_progress`, assignee'ye atanır (gerekçe gate-run kaydında).
   - inputs: item-tested
   - approver: +prime
   - outputs: item-accepted

Seçili gate'ler + (varsa) UAT pass → motor değişikliği `development`'a merge eder, item `done`. Gate sonuçlarından toplu denetim raporu üretilir.

**Sonraki:** Item burada biter. Item bir epic'i kapatıyorsa motor `deployment-cycle`'ı staging milestone'u olarak tetikler — koşullu, motor işi (§5.9); otomatik zincir değil.
