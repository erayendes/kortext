# Planning Pipeline

> **Bu dosyada:** Analiz çıktıları backlog'a dönüştürülür: item'lar üretilir, doğrulama gate'leri seçilir, Epic'lere bağlanır, versiyonlara dağıtılır, atamalar (persona + model) yapılır.
>
> **Köprü kuralı (DECISIONS §13, §14.9):** Backlog'un tek gerçek kaynağı `.kortext/foundation/backlog.yaml` dosyasıdır. `update_backlog_item` gibi MCP araçları YOKTUR. İki yazım türü var:
> - **İlk üretim (step 1):** tüm backlog `.kortext/foundation/backlog.yaml`'e tam yazılır (epic'ler + tüm item'lar).
> - **Zenginleştirme (sonraki adımlar):** bir item'ı güncellerken **tüm dosyayı YENİDEN YAZMA** — bu 100 item'da çok yavaş. Bunun yerine `.kortext/foundation/backlog.patch.yaml`'e **yalnız değiştirdiğin item'ları, yalnız değiştirdiğin alanlarla** yaz. Motor patch'i id'ye göre mevcut satıra **birleştirir** (gerisine dokunmaz; `review_gates` eklemeli birikir, diğer alanlar son-yazan-kazanır).
>
> Patch formatı (her satır `id` + yalnız o adımın alanı):
> ```yaml
> items:
>   - id: AUTH-001
>     review_gates: [security_control]
>   - id: PAY-003
>     review_gates: [security_control]
> ```
>
> **⛔ ZORUNLU — tepe anahtar `items:` OLMALI.** `backlog.patch.yaml`'in en üst satırı **mutlaka `items:`** olmalı; patch'in türü ne olursa olsun (bağımlılık, atama, versiyon…) **başka bir tepe anahtar KULLANMA** — `dependency_patches:`, `assignee_patches:`, `acceptance_patches:` gibi adlar **YANLIŞ**, motor bunları okuyamaz ve **tüm adım sessizce kaybolur**. Her zaman `items:` altında `id` + değişen alanlar.

## Backlog Tanımı

1. **+engineering-manager:** Backlog'u tek bir YAML dosyası olarak üret: `.kortext/foundation/backlog.yaml`. Dosya **sadece geçerli YAML** olmalı (markdown/prose/code-fence YOK), en üstte `items:` listesi. PRD + TRD'deki kapsam sınırlarına **uyarak** item'ları çıkar; her item ayrı satırda. Disiplin: atomik (tek başına anlaşılabilir, bağımsız geliştirilebilir, ayrı doğrulanabilir).

   **🎯 Kapsam ve granularite — ZORUNLU.** PRD/BRD'de bir **item sayısı sınırı** ya da kapsam notu varsa (örn. "toplam item 8'i geçmesin", "MVP", "küçük proje") bu bir **tavandır, aşma**. Sınır verilmişse o sayıyı geçme; verilmemişse projeyi makul, kaba-taneli item'lara böl. **Bir özellik = bir task** (varsayılan); aynı özelliğin frontend/backend/test parçalarını **ayrı item'lara BÖLME** (review_gates ve persona zaten o işi paralel yürütür). Şüphedeysen **daha az, daha büyük** item'ı tercih et — fazla bölmek backlog'u şişirir ve kapsam notunu ihlal eder. Epic container'lar bu sayıma dahil değildir.

   **🔑 ID konvansiyonu — ZORUNLU.** Önce `.kortext/project.json`'u oku ve `code` alanını al (örn. `"code": "TF"`). Her item id'si **`<CODE>-NNN`** desenine uymalı: task/bug/debt için sıralı üç haneli numara (`TF-001`, `TF-002`, `TF-003`…), epic container için `<CODE>-E01`, `<CODE>-E02`. **Slug/kebab-case id YASAK** — `init-nextjs-project`, `setup-github-actions-ci` gibi id'ler hatadır; bunlar başlık (`title`) olur, id olmaz. Numaraları tüm backlog boyunca tekilleştir (atlamadan artır). project.json okunamazsa proje adının baş harflerinden 2-4 harfli bir kod türet.

   **⛔ Epic'ler ZORUNLU — bu ilk adımda GERÇEK item olarak üretilir.** Her referans verdiğin epic için backlog'da **mutlaka bir `type: epic` container item'ı** bulunmalı. **SIRA:** önce mantıksal grupları belirle, her grup için `items:` listesinin EN BAŞINA bir `type: epic` item'ı yaz (`id: <CODE>-E01`, `type: epic`, `title: …`), SONRA task/bug/debt item'larında `parent_epic: <CODE>-E01` ile bağla. **YASAK:** `parent_epic: <CODE>-E01` yazıp o `<CODE>-E01`'i `type: epic` item'ı olarak üretmemek — **çıplak (karşılığı olmayan) `parent_epic` referansı motorun en sık kırıldığı yer**. Her `parent_epic: X` için listede `id: X, type: epic` bir satır OLMALI. Etiket (`epic: "Altyapı"`) DEĞİL, gerçek epic id'si kullan. (Motor son çare olarak çıplak referanstan epic türetir ama başlık id'nin kendisi olur — sen gerçek başlıkla üret.) **İçinde tek bir `type: epic` satırı bile olmayan bir backlog GEÇERSİZ çıktıdır** — küçük/MVP projede bile en az bir epic container üret ve her task'ı ona bağla (motor epic'siz dosyayı varsayılan bir epic sentezleyerek onarır, ama o jenerik kalır — gruplama senin işin).

   **🔗 Bağımlılıklar — ZORUNLU.** Mantıksal kurulum sırasını düşün: hangi item başka bir item bitmeden başlayamaz? Her item için, önce tamamlanması gereken item'ları `blocked_by: [<ID>, …]` listesine yaz (örn. bir özellik, altyapı kurulumuna bağlıysa `blocked_by: [TF-001]`). Tersini de `blocks:` ile ver (kurulum item'ı `blocks: [TF-005, TF-006]`). Gerçek bağımlılığı olmayan item'da boş liste bırak — **uydurma**. Referans verdiğin her id backlog'da var olmalı (dangling YASAK). **Her item'da `blocks` VE `blocked_by` alanları MUTLAKA bulunmalı — ilişki yoksa bile `[]` yaz, alanı ATLAMA** (motor eksik/asimetrik/dangling bağımlılıkları ingest'te yakalar ve uyarır). Bunlar Board'da kartın bağımlılık rozetinde + drawer'da görünür.

   > **Motor şema toleransı (bilgi):** Kanonik alanlar `blocked_by`/`blocks` (yukarıdaki gibi yaz). Ama motor şu yaygın varyasyonları da kabul edip normalize eder, takılma: bağımlılık için `depends_on` (→ `blocked_by`), tip için `feature`/`chore`/`test` (→ `task`, orijinali saklanır), durum için `todo` (→ `to_do`), epic için düz `epic: <etiket>` (→ `type: epic` `<CODE>-E0N` türetilir). Yine de kanonik sözcüğü tercih et — netlik için.

   Her item şu alanlara sahip olmalı:
   - `id`: `<CODE>-NNN` (task/bug/debt) veya `<CODE>-E0X` (epic) — yukarıdaki konvansiyon. Slug DEĞİL.
   - `type`: `task` | `bug` | `debt` | `epic` | `spike` (ürün özellikleri → task, açık hatalar → bug, teknik borçlar → debt, üst seviye gruplama → **epic, en az bir tane zorunlu**)
   - `title`: kısa başlık
   - `priority`: `P0` (MVP blocker) | `P1` | `P2` | `P3`
   - `description`: ne yapılacağı
   - `acceptance_criteria`: davranış odaklı, test edilebilir kriter listesi (her item için zorunlu)
   - `review_gates`: şu alt kümeden seç — `code_review` (mimariye dokunan/karmaşık mantık), `security_control` (auth/secret/veri işleme/erişim/compliance riski), `design_review` (UI/UX/erişilebilirlik), `quality_control` (yoğun QA gerektiren), `uat` (kullanıcıya dönük kritik akış, iş/bütçe kararı, geri alınamaz işlem — prime kabulü). **🧑 İnsan-döngü ZORUNLU:** kullanıcıya dönük her kritik akışta (ana ekran/temel CRUD/satın alma/silme/auth gibi) **en az bir item'a `uat` gate'i ekle** — yoksa insan onayı hiç tetiklenmez. Ayrıca **insan müdahalesi gereken işler** (domain/hosting satın alma, API key/hesap açma, fiziksel cihaz, bütçe/yasal onay) ayrı item olur ve **`assignee: +prime`** alır (ajan yapamaz, insan yapar). Her backlog'da en az bir insan-döngü noktası (uat gate VEYA +prime item) bulunmalı.
   - `parent_epic`: bu item'ın bağlı olduğu Epic id'si (epic item'larda boş bırakılır). Hiyerarşiyi bu alan kurar; ingester `parent_epic`'i (alias: `parent`) `parent_id` kolonuna yazar.
   - `version`: hedef versiyon (örn. `v0.1`, `v1.0`). Her item bir versiyona ait olmalı; ingester `version` kolonuna yazar.
   - `model`: bu item'ın LLM model profili (`rules/models.md` mapping'i). `+operation-manager` adımında doldurulur; ingester `model` kolonuna yazar.
   - `blocks` / `blocked_by`: bağımlılık id listeleri

   > Bu alanların adlarını **bire bir** böyle yaz: `type`, `parent_epic`, `version`, `model`, `acceptance_criteria`, `review_gates`. Bunlar gerçek DB kolonlarına eşlenir (frontmatter'a düşmez). Bilinmeyen ek alanlar frontmatter'a korunur, sessizce kaybolmaz.

   Şema örneği (Epic → Task hiyerarşisi + per-item model, proje kodu `TF`):
   ```yaml
   items:
     - id: TF-E01
       type: epic
       title: "Kimlik doğrulama"
       version: v0.1
       model: high-reasoning
     - id: TF-001
       type: task
       title: "Proje kurulumu"
       priority: P0
       description: "..."
       parent_epic: TF-E01
       version: v0.1
       model: high-reasoning
       acceptance_criteria: ["tsc --noEmit hatasız", "lint geçer"]
       review_gates: [code_review]
       blocks: [TF-002]
       blocked_by: []
     - id: TF-002
       type: task
       title: "Oturum açma ekranı"
       priority: P0
       description: "..."
       parent_epic: TF-E01
       version: v0.1
       model: high-reasoning
       acceptance_criteria: ["..."]
       review_gates: [code_review, design_review]
       blocks: []
       blocked_by: [TF-001]
   ```
   - inputs: `.kortext/project.json`, `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/foundation/backlog.yaml`, `backlog-drafted`

2. **+qa-engineer:** Mevcut `backlog.yaml`'i oku. Her item için davranış odaklı, test edilebilir `acceptance_criteria` belirle; QA gerektiren item'lara `quality_control` gate'i ekle. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e yalnız dokunduğun item'ları, her satırda `id` + `acceptance_criteria` (ve gerekirse `review_gates: [quality_control]`) ile. Tüm dosyayı yeniden yazma.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/TEST.md`, `backlog-drafted`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-acceptance-set`

3. **+security-engineer:** Mevcut `backlog.yaml`'i oku. Auth, secret, veri işleme, erişim kontrolü, compliance riski taşıyan item'lara `security_control` gate'i ekle. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e yalnız bu item'ları `id` + `review_gates: [security_control]` ile. (Motor gate'i eklemeli birleştirir, mevcut gate'leri silmez.)
   - inputs: `.kortext/foundation/TRD.md`, `.kortext/references/SECURITY.md`, `backlog-acceptance-set`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-security-marked`

4. **+designer:** Mevcut `backlog.yaml`'i oku. UI, UX, responsive davranış, erişilebilirlik gerektiren item'lara `design_review` gate'i ekle. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e yalnız bu item'ları `id` + `review_gates: [design_review]` ile.
   - inputs: `.kortext/references/DESIGN.md`, `backlog-security-marked`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-design-marked`

## Epic ve Versiyon

1. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Epic yapısını gözden geçir: her child task/bug/debt item'ında doğru `parent_epic: <EPIC-ID>` olduğundan emin ol (etiket değil, gerçek epic id'si — epic container'lar step 1'de üretildi). Eksik/yanlış bağları düzelt. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e yalnız bağını değiştirdiğin item'ları `id` + `parent_epic` (ve gerekirse `owner`) ile. (Yeni epic container gerekiyorsa nadir; gerekiyorsa `backlog.yaml`'e değil, ayrı bir tam item olarak patch'te `id` + `type: epic` + `title` ile verilemez — bunun yerine step 1'de oluşturulmalıydı; eksikse `description`'a not düş.)
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-design-marked`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-epics-linked`

2. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Epic'leri (ve item'larını) versiyonlara dağıt. Karmaşıklığa göre v0.x aşamalarından başla, v1.0'a mantıksal sırayla ilerle. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e her item'ı `id` + `version: <vX.Y>` ile (örn. `version: v0.1`).
   - inputs: `.kortext/foundation/PRD.md`, `backlog-epics-linked`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-versions-set`

## Atama

1. **+engineering-manager:** Mevcut `backlog.yaml`'i oku. Her item'a persona handle ata. Teknik item'lar uzmanlık alanına göre; insan müdahalesi gereken item'lar (domain satın alma, hesap açma, API key, fiziksel cihaz, bütçe onayı) `+prime`'a. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e her item'ı `id` + `assignee` ile.
   - inputs: `.kortext/references/STACK.md`, `backlog-versions-set`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-assignees-set`

2. **+operation-manager:** Mevcut `backlog.yaml`'i oku. Her item için LLM model tercihini `rules/models.md` mapping'ine göre belirle: önce item'ın assignee persona'sının görev kategorisini bul (`deep-research` → `high-reasoning`, `routine` → `fast-reasoning`), sonra model profilini ata. Çıktıyı **patch olarak** yaz: `backlog.patch.yaml`'e her item'ı `id` + `model: <profil>` ile (örn. `model: high-reasoning`).
   - inputs: `backlog-assignees-set`, `rules/models.md`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `backlog-models-set`

## Konsolidasyon

1. **+operation-manager:** Nihai `backlog.yaml`'i baştan sona tara: drift, eksik alan (epic/versiyon/model boş kalan item), dangling `blocks`/`blocked_by` referansı, eksik Epic veya versiyon ilişkisi. **ID denetimi:** her id `<CODE>-NNN`/`<CODE>-E0X` desenine uymalı; slug/kebab-case id (`init-nextjs-project`) bulursan **hata olarak düzelt** (patch'te eski→yeni id veremezsin; bunun yerine raporun "açık riskler" bölümüne not düş, çünkü id yeniden yazımı step-1'de yapılmalıydı). **Bağımlılık denetimi:** her item'da `blocks` ve `blocked_by` alanları doldurulmuş mu (en az `[]`) — toptan boş kalmış çok-adımlı bir epic, step-1'in bağımlılıkları atladığına işarettir, yeniden incele. `blocked_by`/`blocks` referansları gerçek id'lere işaret etmeli; dangling olanı temizle. Bulduğun eksikleri **patch olarak** `backlog.patch.yaml`'e yaz (yalnız düzelttiğin item'lar, yalnız eksik alanlar) — tüm dosyayı yeniden yazma. **Tepe anahtar `items:` olmalı** (`dependency_patches:` gibi bir ad DEĞİL — motor okuyamaz). Bağımlılık patch örneği:
   ```yaml
   items:
     - id: NOT-005
       blocked_by: [NOT-001]
       blocks: []
     - id: NOT-001
       blocked_by: []
       blocks: [NOT-005]
   ```
   Sonra planning özet raporu yaz: versiyon planı, Epic dağılımı, açık riskler, +prime kararına bırakılan kalemler. **Rapor türü `status-reports`** (ayrı bir `planning-reports` türü YOKTUR). Dosya adı **tek kanonik desen** `report-type_project-id_<ts>.md` olmalı: `status-reports_<PROJECT-ID>_<YYYY-MM-DD_HH-MM-SS>.md` — `<PROJECT-ID>` = `.kortext/project.json`'daki `code` (örn. `NOT`), `<ts>` = `YYYY-MM-DD_HH-MM-SS` (örn. `status-reports_NOT_2026-06-08_17-46-49.md`).

   **Memory (kalıcı karar günlüğü):** Planlama sırasında alınan kalıcı kararları `.kortext/memory/decisions.md`'e yaz. Varsa önce oku ve **üstüne ekle** (silme). Her karar tek satır/madde: ne karar verildi + kısa gerekçe (örn. "Versiyonlama v0.1→v1.0 aşamalı — MVP'yi erken çıkarmak için", "Auth epic'i ilk sürüme alındı — tüm akışların ön koşulu"). Yoksa yeni dosya oluştur, en üste `# Decisions` başlığı koy.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `backlog-models-set`
   - outputs: `.kortext/foundation/backlog.patch.yaml`, `.kortext/reports/status-reports_<slug>_<ts>.md`, `.kortext/memory/decisions.md`
   - approver: +prime

**Sonraki akış:** `environment-setup`
