# Analysis Pipeline (`!start analysis`)

Bu akış, yeni bir projenin ürün, teknik ve kalite temelini oluşturur.

## Girdi ve Çıkış

- **Başlangıç koşulu:** `../workspace/references/blueprint.md` dolu ve onaylı olmalıdır.
- **Girdi:** Onaylı blueprint.
- **Çıkış:** Ürün, teknik ve test referansları ile `../workspace/reports/analysis-reports.md`.
- **Sonraki akış:** Onay sonrası `02-planning-pipeline.md`.

> [!TIP]
> - Birbirine bağımlı olmayan adımlarda (Örn: +security-engineer ve +designer) ajanlar eşzamanlı (paralel) olarak çalışır.
> - Input dosyaların `status: approved` olması gerekir. Değilse, ilgili `approver`'dan dosyayı incelemesi istenir.
> - Her ajan bir adıma başlamadan önce `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller; adım bitince sonucu `../workspace/memory/handover.md` dosyasına kaydeder ve kendi aktif görev dosyasını siler.

## Ön Hazırlıklar

**+operation-manager**
1. `../workspace/memory/context/operation-manager-active.md` dosyasını oluşturur veya günceller.
2. Bu workflow'u okur ve paralel çalışabilecek ajanları belirler.
3. `../rules/models.md` dosyasını okur ve görevli her ajanın kullanacağı LLM/model eşleşmesini belirler.
4. Ajanlara görevlerini verir.

## Product Analysis

1. **+compliance-expert:** Projenin bulunduğu sektöre, hedef pazarlara ve veri işleme biçimine göre yasal gereksinimleri belirler. KVKK, GDPR, CCPA gibi regülasyonları; gizlilik, aydınlatma, rıza, saklama, silme ve üçüncü taraf veri paylaşımı açısından değerlendirir.
	- Inputs: `../workspace/references/blueprint.md`
	- Outputs: `../workspace/references/legal-strategy.md`
	- Approver: +prime
2. **+growth-expert:** Hedef kitleye, pazara ve ürün vaadine göre büyüme stratejisini belirler. SEO/GEO, kanal stratejisi, ölçümleme, analitik ve dönüşüm takibi için gerekli görevleri çıkarır.
	- Inputs: `../workspace/references/blueprint.md`
	- Outputs: `../workspace/references/growth-strategy.md`
	- Approver: +prime
3. **+product-manager:** Blueprint'i, legal ve growth çıktılarını birleştirerek ürün gereksinimlerini çıkarır. Kapsamı, kullanıcı tiplerini, ana akışları, öncelikleri, kabul kriterlerini ve kapsam dışı bırakılan işleri netleştirir.
	- Inputs: `../workspace/references/blueprint.md`, `../workspace/references/legal-strategy.md`, `../workspace/references/growth-strategy.md`
	- Outputs: `../workspace/reports/product-requirements.md`
	- Approver: +prime

### Ara Bildirim

> [!NOTE] RAPOR HAZIR
> +prime, 
> - `../workspace/references/legal-strategy.md`
> - `../workspace/references/growth-strategy.md`
> - `../workspace/reports/product-requirements.md`
> raporları hazır. `!approve/reject [report-name]` komutunu bekliyorum.

4. **+copywriter:** Ürün gereksinimleri, yasal sınırlar ve büyüme stratejisine göre içerik stratejisini oluşturur. Marka dili, mesaj hiyerarşisi, sayfa içerikleri, mikro metinler ve kampanya/SEO içerik yönünü belirler.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/references/legal-strategy.md`, `../workspace/references/growth-strategy.md`
	- Outputs: `../workspace/references/content-strategy.md`
	- Approver: +prime

### Ara Bildirim

> [!NOTE] RAPOR HAZIR
> +prime, 
> `../workspace/references/content-strategy.md` raporu hazır. `!approve/reject content-strategy` komutunu bekliyorum.

## Technical Analysis

1. **+engineering-manager:** Teknoloji yığınını (stack), MCP sunucularını, geliştirme araçlarını ve +prime tarafından kurulması gereken ön gereksinimleri belirler. Bu ön gereksinimler test cihazları, emulator, API key gerektiren servis hesapları veya harici araçlar olabilir. Kodlama standartlarını ve proje klasör yapısı kurallarını yazar.
	- Inputs: `../workspace/references/blueprint.md`, `../workspace/reports/product-requirements.md`
	- Outputs: `../workspace/references/tech-stack.md`, `../workspace/references/dictionary.md`, `../workspace/references/file-system.md`
	- Approver: +prime
2. **+security-engineer:** Seçilen tech stack'in bilinen güvenlik risklerini ve proje verisinin hassasiyetini değerlendirir. Kimlik doğrulama, yetkilendirme, secret yönetimi, veri saklama, loglama, `.gitignore` ve güvenli geliştirme kurallarını belirler.
	- Inputs: `../workspace/references/tech-stack.md`
	- Outputs: `../workspace/references/security-rules.md`
	- Approver: +engineering-manager
3. **+designer:** Ürün gereksinimleri, içerik stratejisi ve teknik sınırları dikkate alarak tasarım sistemini oluşturur. Renk paleti, tipografi, bileşen ilkeleri, responsive davranış, erişilebilirlik ve temel UI kurallarını belirler.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/references/tech-stack.md`, `../workspace/references/content-strategy.md`
	- Outputs: `../workspace/references/design-system.md`
	- Reviewer: +frontend-developer
	- Approver: +prime

### Ara Bildirim

> [!NOTE] RAPOR HAZIR
> +prime, 
> `../workspace/references/design-system.md` raporu hazır. `!approve/reject design-system` komutunu bekliyorum.

4. **+db-admin:** Ürün gereksinimleri, güvenlik kuralları ve teknik standartlara göre veritabanı şemasını tasarlar. Tabloları, ilişkileri, indeksleri, erişim kurallarını, migration yaklaşımını ve veri bütünlüğü gereksinimlerini netleştirir.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/references/security-rules.md`, `../workspace/references/dictionary.md`, `../workspace/references/file-system.md`, `../workspace/references/tech-stack.md`
	- Outputs: `../workspace/references/db-schema.md`
	- Approver: +engineering-manager
5. **+engineering-manager:** API uçlarını ve servis sınırlarını tasarlar. Teknik standartları, endpoint listesini, istek/yanıt modellerini, hata formatlarını, yetkilendirme gereksinimlerini ve veri akışını belirler.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/references/security-rules.md`, `../workspace/references/dictionary.md`, `../workspace/references/file-system.md`, `../workspace/references/tech-stack.md`, `../workspace/references/db-schema.md`
	- Outputs: `../workspace/references/api-reference.md`
	- Reviewer: +backend-developer
	- Approver: +engineering-manager
6. **+engineering-manager:** Teknik analiz çıktılarını konsolide ederek teknik gereksinim raporunu oluşturur. Stack, dosya yapısı, güvenlik, veritabanı, API, tasarım sistemi ve uygulanması gereken mühendislik kararlarını tek kaynakta toplar.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/references/security-rules.md`, `../workspace/references/dictionary.md`, `../workspace/references/file-system.md`, `../workspace/references/tech-stack.md`, `../workspace/references/db-schema.md`, `../workspace/references/api-reference.md`, `../workspace/references/design-system.md`
	- Outputs: `../workspace/reports/tech-requirements.md`
	- Approver: +prime
7. **+qa-engineer:** Ürün ve teknik gereksinimlere göre test stratejisini belirler. Test türlerini, kritik kullanıcı akışlarını, otomasyon kapsamını, manuel QA ihtiyaçlarını, kabul kriterlerini ve release öncesi kalite kapılarını tanımlar.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/reports/tech-requirements.md`
	- Outputs: `../workspace/references/test-strategy.md`
	- Approver: +engineering-manager

## Konsolidasyon

> [!NOTE]
> - Tüm output dosyaları ilgili reviewer/approver tarafından onaylandıktan sonra konsolidasyon başlar.
> - +prime'ın karar vermesi gereken açık konular `../workspace/reports/analysis-reports.md` içinde ayrı bir karar listesi olarak yazılır.

8. **+operation-manager:** Product, technical ve test çıktılarını konsolide ederek nihai analiz raporunu oluşturur. Rapor; proje kapsamını, ana kararları, onay bekleyen konuları, riskleri, bağımlılıkları ve planlama akışına aktarılacak görev başlıklarını netleştirir.
	- Inputs: `../workspace/reports/product-requirements.md`, `../workspace/reports/tech-requirements.md`, `../workspace/references/test-strategy.md`
	- Outputs: `../workspace/reports/analysis-reports.md`
	- Approver: +prime

## Bildirim

> [!NOTE] ANALİZ TAMAMLANDI
> +prime, 
> [project-name] analizi tamamlandı. 
> `../workspace/reports/analysis-reports.md` dosyası için `!approve/reject analysis-reports` komutunu bekliyorum.
> Onaydan sonra planlama akışı için `!start planning` komutunu bekleyeceğim.
