# Planning Pipeline

> **Bu dosyada:** Analiz çıktıları backlog'a dönüştürülür: item'lar üretilir, doğrulama gate'leri seçilir, Epic'lere bağlanır, versiyonlara dağıtılır, atamalar (persona + model) yapılır.

## Backlog Tanımı

1. **+engineering-manager:** Backlog'u tek bir YAML dosyası olarak üret: `.kortext/foundation/backlog.yaml`. Dosya **sadece geçerli YAML** olmalı (markdown/prose/code-fence YOK), en üstte `items:` listesi. PRD + TRD'den tüm item'ları çıkar; her item ayrı satırda. Disiplin: atomik (tek başına anlaşılabilir, bağımsız geliştirilebilir, ayrı doğrulanabilir).

   Her item şu alanlara sahip olmalı:
   - `id`: kararlı benzersiz kimlik (örn. `INFRA-001`, `AUTH-002`, epic için `AUTH-EPIC`)
   - `type`: `task` | `bug` | `debt` | `epic` | `spike` (ürün özellikleri → task, açık hatalar → bug, teknik borçlar → debt, üst seviye gruplama → epic)
   - `title`: kısa başlık
   - `priority`: `P0` (MVP blocker) | `P1` | `P2` | `P3`
   - `description`: ne yapılacağı
   - `acceptance_criteria`: davranış odaklı, test edilebilir kriter listesi (her item için zorunlu)
   - `review_gates`: şu alt kümeden seç — `code_review` (mimariye dokunan/karmaşık mantık), `security_control` (auth/secret/veri işleme/erişim/compliance riski), `design_review` (UI/UX/erişilebilirlik), `quality_control` (yoğun QA gerektiren), `uat` (kullanıcıya dönük kritik akış, iş/bütçe kararı, geri alınamaz işlem — prime kabulü)
   - `parent_epic`: bu item'ın bağlı olduğu Epic id'si (epic item'larda boş bırakılır). Hiyerarşiyi bu alan kurar; ingester `parent_epic`'i (alias: `parent`) `parent_id` kolonuna yazar.
   - `version`: hedef versiyon (örn. `v0.1`, `v1.0`). Her item bir versiyona ait olmalı; ingester `version` kolonuna yazar.
   - `model`: bu item'ın LLM model profili (`rules/models.md` mapping'i). `+operation-manager` adımında doldurulur; ingester `model` kolonuna yazar.
   - `blocks` / `blocked_by`: bağımlılık id listeleri

   > Bu alanların adlarını **bire bir** böyle yaz: `type`, `parent_epic`, `version`, `model`, `acceptance_criteria`, `review_gates`. Bunlar gerçek DB kolonlarına eşlenir (frontmatter'a düşmez). Bilinmeyen ek alanlar frontmatter'a korunur, sessizce kaybolmaz.

   Şema örneği (Epic → Task hiyerarşisi + per-item model):
   ```yaml
   items:
     - id: AUTH-EPIC
       type: epic
       title: "Kimlik doğrulama"
       version: v0.1
       model: high-reasoning
     - id: INFRA-001
       type: task
       title: "Proje kurulumu"
       priority: P0
       description: "..."
       parent_epic: AUTH-EPIC
       version: v0.1
       model: high-reasoning
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

1. **+engineering-manager:** Atomik item'ları Epic'lere bağla. Her mantıksal grup için bir `type: epic` item'ı oluştur (kararlı id, örn. `AUTH-EPIC`); gerekirse yeni epic ekle. Her child task/bug/debt item'ında `parent_epic: <EPIC-ID>` alanını set et (bu alan `parent_id` kolonuna eşlenir). Her Epic'e owner persona ata.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-design-marked`
   - outputs: `backlog-epics-linked`

2. **+engineering-manager:** Epic'leri versiyonlara dağıt. Karmaşıklığa göre v0.x aşamalarından başla, v1.0'a mantıksal sırayla ilerle. Her item'a `version: <vX.Y>` alanını yaz (örn. `version: v0.1`); bu alan `version` kolonuna eşlenir.
   - inputs: `.kortext/foundation/PRD.md`, `backlog-epics-linked`
   - outputs: `backlog-versions-set`

## Atama

1. **+engineering-manager:** Her item'a persona handle ata (`assignee` alanı). Teknik item'lar uzmanlık alanına göre; insan müdahalesi gereken item'lar (domain satın alma, hesap açma, API key, fiziksel cihaz, bütçe onayı) `+prime`'a.
   - inputs: `.kortext/references/STACK.md`, `backlog-versions-set`
   - outputs: `backlog-assignees-set`

2. **+operation-manager:** Her item için LLM model tercihini `rules/models.md` mapping'ine göre belirle: önce item'ın assignee persona'sının görev kategorisini bul (`deep-research` → `high-reasoning`, `routine` → `fast-reasoning`), sonra item'a `model: <profil>` alanını yaz (örn. `model: high-reasoning`). Bu alan `model` kolonuna eşlenir.
   - inputs: `backlog-assignees-set`, `rules/models.md`
   - outputs: `backlog-models-set`

## Konsolidasyon

1. **+operation-manager:** Backlog'u baştan sona tara: drift, eksik alan, dangling `blocks`/`blocked_by` referansı, eksik Epic veya versiyon ilişkisi. Planning özet raporu yaz: versiyon planı, Epic dağılımı, açık riskler, +prime kararına bırakılan kalemler.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-models-set`
   - outputs: `.kortext/reports/planning-reports_<slug>_<ts>.md`
   - approver: +prime

**Sonraki akış:** `environment-setup`
