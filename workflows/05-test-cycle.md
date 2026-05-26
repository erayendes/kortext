# Test Cycle

## Code Review

1. **+engineering-manager:** PR'ı incele. Build sonucu, unit/integration test sonucu, CI logları, kodun referanslara (`STACK`, `STRUCTURE`, `GLOSSARY`, `API`, `DATABASE`, `SECURITY`) uygunluğu. Acceptance criteria item'ın frontmatter'ından okunur; her madde test edilebilir kanıtla eşleşmeli. Fail ise item `in_progress`'e dönüş + assignee'ye yeniden atama, work log'a hata listesi. Pass ise per-file rapora yaz ve gate'lere ilerle.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/API.md`, `.kortext/references/DATABASE.md`, `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

## Review Gates

1. **+qa-engineer:** Item.review_gates `quality_control` içeriyorsa çalışır. Davranış odaklı manuel/otomatik testleri koştur; sonuçları test raporuna append et. Fail → item `in_progress` + assignee'ye geri.
   - inputs: `.kortext/references/TEST.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

2. **+security-engineer:** Item.review_gates `security_check` içeriyorsa çalışır. Auth, secret, veri işleme, erişim kontrolü, compliance açısından PR'ı incele. Bulgu varsa ayrı security raporu (`security-reports_<slug>_<ts>.md`) yaz + ana test raporuna özet ekle. Fail → item `in_progress`.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`, `.kortext/reports/security-reports_<slug>_<ts>.md`

3. **+designer:** Item.review_gates `design_review` içeriyorsa çalışır. UI/UX, responsive davranış, erişilebilirlik, token uyumu açısından PR'ı incele; sonuçları test raporuna append et. Fail → item `in_progress`.
   - inputs: `.kortext/references/DESIGN.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

## Karar

1. **+engineering-manager:** Tüm zorunlu kontroller pass ise item status'unu `review` yap (`update_backlog_item` MCP tool); 04-development-cycle Final Review step'ine sinyal ver. Herhangi bir gate fail ise item zaten `in_progress`'tedir; bu workflow burada biter.

**Sonraki akış:** `04-development-cycle` (Final Review)
