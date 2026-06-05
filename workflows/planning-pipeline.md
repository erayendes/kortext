# Planning Pipeline

> **Bu dosyada:** Analiz çıktıları backlog'a dönüştürülür: item'lar üretilir, doğrulama gate'leri seçilir, Epic'lere bağlanır, versiyonlara dağıtılır, atamalar (persona + model) yapılır.

## Backlog Tanımı

1. **+engineering-manager:** Backlog'u tek bir YAML dosyası olarak üret: `.kortext/foundation/backlog.yaml`. Dosya **sadece geçerli YAML** olmalı (markdown/prose/code-fence YOK), en üstte `items:` listesi. PRD + TRD'den tüm item'ları çıkar; her item ayrı satırda. Disiplin: atomik (tek başına anlaşılabilir, bağımsız geliştirilebilir, ayrı doğrulanabilir).

   Her item şu alanlara sahip olmalı:
   - `id`: kararlı benzersiz kimlik (örn. `INFRA-001`, `AUTH-002`)
   - `type`: `task` | `bug` | `debt` | `epic` | `spike` (ürün özellikleri → task, açık hatalar → bug, teknik borçlar → debt)
   - `title`: kısa başlık
   - `priority`: `P0` (MVP blocker) | `P1` | `P2` | `P3`
   - `description`: ne yapılacağı
   - `acceptance_criteria`: davranış odaklı, test edilebilir kriter listesi (her item için zorunlu)
   - `review_gates`: şu alt kümeden seç — `code_review` (mimariye dokunan/karmaşık mantık), `security_control` (auth/secret/veri işleme/erişim/compliance riski), `design_review` (UI/UX/erişilebilirlik), `quality_control` (yoğun QA gerektiren), `uat` (kullanıcıya dönük kritik akış, iş/bütçe kararı, geri alınamaz işlem — prime kabulü)
   - `blocks` / `blocked_by`: bağımlılık id listeleri

   Şema örneği:
   ```yaml
   items:
     - id: INFRA-001
       type: task
       title: "Proje kurulumu"
       priority: P0
       description: "..."
       acceptance_criteria: ["tsc --noEmit hatasız", "lint geçer"]
       review_gates: [code_review]
       blocks: [INFRA-002]
       blocked_by: []
   ```
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/foundation/backlog.yaml`

2. **+qa-engineer:** Her item için davranış odaklı acceptance criteria yaz (`update_backlog_item` MCP). Test edilemeyecek kadar muğlak item'ları +engineering-manager'a revize için işaretle. QA gerektiren item'lara `review_gates: quality_control` ekle.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/TEST.md`, `.kortext/foundation/backlog.yaml`
   - outputs: `backlog-acceptance-set`

3. **+security-engineer:** Auth, secret, veri işleme, erişim kontrolü, compliance riski taşıyan item'lara `review_gates: security_control` ekle (`update_backlog_item` MCP).
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/SECURITY.md`, `backlog-acceptance-set`
   - outputs: `backlog-security-marked`

4. **+designer:** UI, UX, responsive davranış, erişilebilirlik gerektiren item'lara `review_gates: design_review` ekle (`update_backlog_item` MCP).
   - inputs: `.kortext/references/DESIGN.md`, `backlog-security-marked`
   - outputs: `backlog-design-marked`

## Epic ve Versiyon

1. **+engineering-manager:** Atomik item'ları Epic'lere bağla. Yeni Epic gerekiyorsa `add_backlog_item --type epic` ile aç. Her item'ın `parent_epic` alanını set et. Her Epic'e owner persona ata.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-design-marked`
   - outputs: `backlog-epics-linked`

2. **+engineering-manager:** Epic'leri versiyonlara dağıt. Karmaşıklığa göre v0.x aşamalarından başla, v1.0'a mantıksal sırayla ilerle. Her item'ın `version` alanını set et.
   - inputs: `.kortext/foundation/PRD.md`, `backlog-epics-linked`
   - outputs: `backlog-versions-set`

## Atama

1. **+engineering-manager:** Her item'a persona handle ata (`assignee` alanı). Teknik item'lar uzmanlık alanına göre; insan müdahalesi gereken item'lar (domain satın alma, hesap açma, API key, fiziksel cihaz, bütçe onayı) `+prime`'a.
   - inputs: `.kortext/references/STACK.md`, `backlog-versions-set`
   - outputs: `backlog-assignees-set`

2. **+operation-manager:** Her item için LLM model tercihini belirle (`rules/models.md` mapping) ve item `model` alanına yaz.
   - inputs: `backlog-assignees-set`
   - outputs: `backlog-models-set`

## Konsolidasyon

1. **+operation-manager:** Backlog'u baştan sona tara: drift, eksik alan, dangling `blocks`/`blocked_by` referansı, eksik Epic veya versiyon ilişkisi. Planning özet raporu yaz: versiyon planı, Epic dağılımı, açık riskler, +prime kararına bırakılan kalemler.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-models-set`
   - outputs: `.kortext/reports/planning-reports_<slug>_<ts>.md`
   - approver: +prime

**Sonraki akış:** `environment-setup`
