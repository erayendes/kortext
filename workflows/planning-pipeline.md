# Planning Pipeline

> **Bu dosyada:** Analiz çıktıları backlog'a dönüştürülür: item'lar üretilir, doğrulama gate'leri seçilir, Epic'lere bağlanır, versiyonlara dağıtılır, atamalar (persona + model) yapılır.
>
> **Köprü kuralı (DECISIONS §13):** Backlog'un tek gerçek kaynağı `.kortext/foundation/backlog.yaml` dosyasıdır. `update_backlog_item` gibi MCP araçları YOKTUR. Bir item'ı zenginleştirmenin tek yolu **dosyayı baştan sona yeniden yazmaktır**. Her adım: önce mevcut `backlog.yaml`'i oku → kendi katkını uygula → **bütün dosyayı** tekrar yaz. Motor her yazımda dosyayı yeniden okur ve var olan item'ları (id'ye göre) günceller — bu yüzden alanların kaybolmaz, üst üste birikir.

## Backlog Tanımı

1. **+engineering-manager:** Backlog'u tek bir YAML dosyası olarak üret: `.kortext/foundation/backlog.yaml`. Dosya **sadece geçerli YAML** olmalı (markdown/prose/code-fence YOK), en üstte `items:` listesi. PRD + TRD'den tüm item'ları çıkar; her item ayrı satırda. Disiplin: atomik (tek başına anlaşılabilir, bağımsız geliştirilebilir, ayrı doğrulanabilir).

   **Epic'ler zorunludur, bu ilk adımda kurulur.** Önce mantıksal grupları belirle ve her grup için bir `type: epic` **container item'ı** yaz (kararlı id, örn. `AUTH-EPIC`). Sonra her task/bug/debt item'ında `parent_epic: <EPIC-ID>` alanıyla onu epic'ine bağla. **Düz bir liste yazma** — `type: epic` item'ı olmayan, `parent_epic` taşımayan bir backlog Board'da boş Epic sütunu olarak görünür. Etiket (`epic: "Altyapı"`) DEĞİL, gerçek epic id'si (`parent_epic: AUTH-EPIC`) kullan.

   Her item şu alanlara sahip olmalı:
   - `id`: kararlı benzersiz kimlik (örn. `INFRA-001`, `AUTH-002`, epic için `AUTH-EPIC`)
   - `type`: `task` | `bug` | `debt` | `epic` | `spike` (ürün özellikleri → task, açık hatalar → bug, teknik borçlar → debt, üst seviye gruplama → **epic, en az bir tane zorunlu**)
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
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-drafted`

2. **+qa-engineer:** Mevcut `backlog.yaml`'i oku. Her item için davranış odaklı, test edilebilir `acceptance_criteria` yaz (muğlak olanları netleştir). QA gerektiren item'lara `review_gates`'e `quality_control` ekle. Test edilemeyecek kadar muğlak item'ları item'ın `description`'ında not düş. Bitince **bütün `backlog.yaml`'i yeniden yaz** (tüm mevcut alanları koru, sadece kendi katkını ekle).
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/TEST.md`, `backlog-drafted`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-acceptance-set`

3. **+security-engineer:** Mevcut `backlog.yaml`'i oku. Auth, secret, veri işleme, erişim kontrolü, compliance riski taşıyan item'ların `review_gates`'ine `security_control` ekle. Bitince **bütün `backlog.yaml`'i yeniden yaz** (diğer alanlara dokunma).
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/SECURITY.md`, `backlog-acceptance-set`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-security-marked`

4. **+designer:** Mevcut `backlog.yaml`'i oku. UI, UX, responsive davranış, erişilebilirlik gerektiren item'ların `review_gates`'ine `design_review` ekle. Bitince **bütün `backlog.yaml`'i yeniden yaz** (diğer alanlara dokunma).
   - inputs: `.kortext/references/DESIGN.md`, `backlog-security-marked`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-design-marked`

## Epic ve Versiyon

1. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Epic yapısını gözden geçir: her mantıksal grup için bir `type: epic` container item'ı olduğundan emin ol (eksikse ekle, kararlı id ile, örn. `AUTH-EPIC`). Her child task/bug/debt item'ında `parent_epic: <EPIC-ID>` set et (etiket değil, gerçek epic id'si). Her Epic'e owner persona ata (`owner` alanı). Bitince **bütün `backlog.yaml`'i yeniden yaz**.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-design-marked`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-epics-linked`

2. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Epic'leri (ve item'larını) versiyonlara dağıt. Karmaşıklığa göre v0.x aşamalarından başla, v1.0'a mantıksal sırayla ilerle. Her item'a `version: <vX.Y>` yaz (örn. `version: v0.1`); bu alan `version` kolonuna eşlenir. Bitince **bütün `backlog.yaml`'i yeniden yaz**.
   - inputs: `.kortext/foundation/PRD.md`, `backlog-epics-linked`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-versions-set`

## Atama

1. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Her item'a persona handle ata (`assignee` alanı). Teknik item'lar uzmanlık alanına göre; insan müdahalesi gereken item'lar (domain satın alma, hesap açma, API key, fiziksel cihaz, bütçe onayı) `+prime`'a. Bitince **bütün `backlog.yaml`'i yeniden yaz**.
   - inputs: `.kortext/references/STACK.md`, `backlog-versions-set`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-assignees-set`

2. **+operation-manager:** Mevcut `backlog.yaml`'i oku. Her item için LLM model tercihini `rules/models.md` mapping'ine göre belirle: önce item'ın assignee persona'sının görev kategorisini bul (`deep-research` → `high-reasoning`, `routine` → `fast-reasoning`), sonra item'a `model: <profil>` yaz (örn. `model: high-reasoning`); bu alan `model` kolonuna eşlenir. Bitince **bütün `backlog.yaml`'i yeniden yaz** — bu, ingest edilecek **nihai, eksiksiz** backlog'tur (her item'da epic + versiyon + gate + model dolu olmalı).
   - inputs: `backlog-assignees-set`, `rules/models.md`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-models-set`

## Konsolidasyon

1. **+operation-manager:** Nihai `backlog.yaml`'i baştan sona tara: drift, eksik alan (epic/versiyon/model boş kalan item), dangling `blocks`/`blocked_by` referansı, eksik Epic veya versiyon ilişkisi. Bulduğun eksikleri düzeltip `backlog.yaml`'i son kez yeniden yaz. Sonra planning özet raporu yaz: versiyon planı, Epic dağılımı, açık riskler, +prime kararına bırakılan kalemler. Rapor dosya adı `<scope>_<slug>_<ts>.md` desenine uymalı (örn. `planning-reports_taskflow_2026-06-05-1959.md`).
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-models-set`
   - outputs: `.kortext/foundation/backlog.yaml`, `.kortext/reports/planning-reports_<slug>_<ts>.md`
   - approver: +prime

**Sonraki akış:** `environment-setup`
