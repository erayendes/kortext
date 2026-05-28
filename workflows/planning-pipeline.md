# Planning Pipeline (`!start planning`)

## Backlog Tanımı

1. **+engineering-manager:** Backlog item adaylarını çıkar. Her ürün özelliği için task, açık her hata için bug, her teknik borç için debt. Atomik tut (tek başına anlaşılabilir, bağımsız geliştirilebilir, ayrı doğrulanabilir). Bağımlılıkları `blocks` / `blocked_by` alanlarına işaretle; her item için `add_backlog_item` MCP tool'unu çağır.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`

2. **+qa-engineer:** Her item için davranış odaklı acceptance criteria yaz. Test edilemeyecek kadar muğlak item'ları +engineering-manager'a revize için işaretle. QA gerektiren item'lara `review_gates: quality_control` ekle. `update_backlog_item` MCP tool ile güncelle.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/TEST.md`

3. **+security-engineer:** Auth, secret, veri işleme, erişim kontrolü, compliance riski taşıyan item'lara `review_gates: security_check` ekle.
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/SECURITY.md`

4. **+designer:** UI, UX, responsive davranış, erişilebilirlik gerektiren item'lara `review_gates: design_review` ekle.
   - inputs: `.kortext/references/DESIGN.md`

## Epic ve Versiyon

1. **+engineering-manager:** Atomik item'ları Epic'lere bağla. Yeni Epic gerekiyorsa `add_backlog_item --type epic` ile aç; her item'ın `parent_epic` alanını set et. Her Epic için owner persona ata.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`

2. **+engineering-manager:** Epic'leri versiyonlara dağıt. Projenin karmaşıklığına göre v0.x aşamalarından başla, v1.0'a doğru mantıksal sıraya diz. Her item'ın `version` alanını set et.
   - inputs: `.kortext/foundation/PRD.md`

## Atama

1. **+engineering-manager:** Her item'a uygun persona handle ata (item `assignee` alanı). Teknik item'lar uzmanlık alanına göre; insan müdahalesi (domain satın alma, hesap açma, API key, fiziksel cihaz, bütçe onayı) gereken item'lar `+prime`'a.
   - inputs: `.kortext/references/STACK.md`

2. **+operation-manager:** Her item için LLM model tercihini `rules/models.md`'ye göre belirle ve item `model` alanına yaz.

## Konsolidasyon

1. **+operation-manager:** Backlog'u baştan sona tara. Drift, eksik alan, dangling `blocks`/`blocked_by` referansı, eksik Epic veya versiyon ilişkisi kontrolü. Planlama özet raporunu yaz: versiyon planı, Epic dağılımı, açık riskler, +prime kararına bırakılan kalemler.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/reports/planning-reports_<slug>_<ts>.md`
   - approver: +prime

**Sonraki akış:** `03-environment-setup`
