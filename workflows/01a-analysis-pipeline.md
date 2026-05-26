# Analysis Pipeline (`!start analysis`)

## Product Analysis

1. **+compliance-expert:** Sektör, hedef pazar ve veri işleme biçimine göre yasal gereksinimleri belirle. KVKK, GDPR, CCPA; gizlilik, aydınlatma, rıza, saklama, silme, üçüncü taraf veri paylaşımı.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/LEGAL.md`
   - approver: +prime

2. **+growth-expert:** Hedef kitle, pazar ve ürün vaadine göre büyüme stratejisi. SEO/GEO, kanal stratejisi, ölçümleme, analitik, dönüşüm takibi.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/GROWTH.md`
   - approver: +prime

3. **+product-manager:** BRD + LEGAL + GROWTH çıktılarını birleştirip ürün gereksinimlerini çıkar. Kapsam, kullanıcı tipleri, ana akışlar, öncelikler, kabul kriterleri, kapsam-dışı.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

> [!NOTE] RAPOR HAZIR
> +prime, LEGAL + GROWTH + PRD onayını bekliyorum.

4. **+copywriter:** PRD + LEGAL + GROWTH'a göre içerik stratejisi. Marka dili, mesaj hiyerarşisi, sayfa içerikleri, mikro metinler, kampanya/SEO içerik yönü.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/references/CONTENT.md`
   - approver: +prime

> [!NOTE] RAPOR HAZIR
> +prime, CONTENT onayını bekliyorum.

## Technical Analysis

1. **+engineering-manager:** Teknoloji yığını, MCP sunucuları, geliştirme araçları, +prime'dan ön gereksinimler (test cihazları, emulator, API key, harici araçlar), kodlama standartları, proje klasör yapısı.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

> [!NOTE] RAPOR HAZIR
> +prime, STACK onayını bekliyorum.

2. **+security-engineer:** STACK güvenlik riskleri + veri hassasiyeti. Auth, yetkilendirme, secret yönetimi, veri saklama, loglama, `.gitignore`, güvenli geliştirme kuralları.
   - inputs: `.kortext/references/STACK.md`
   - outputs: `.kortext/references/SECURITY.md`

3. **+designer:** PRD + CONTENT + STACK sınırları. Renk paleti, tipografi, bileşen ilkeleri, responsive, erişilebilirlik, temel UI kuralları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/CONTENT.md`
   - outputs: `.kortext/references/DESIGN.md`
   - approver: +prime

> [!NOTE] RAPOR HAZIR
> +prime, DESIGN onayını bekliyorum.

4. **+db-admin:** PRD + SECURITY + teknik standartlara göre veritabanı şeması. Tablolar, ilişkiler, indeksler, erişim kuralları, migration yaklaşımı, veri bütünlüğü.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`
   - outputs: `.kortext/references/DATABASE.md`

5. **+engineering-manager:** API uçları + servis sınırları. Teknik standartlar, endpoint listesi, request/response modelleri, hata formatları, yetkilendirme gereksinimleri, veri akışı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

6. **+engineering-manager:** Teknik analiz çıktılarını konsolide et. STACK + STRUCTURE + SECURITY + DATABASE + API + DESIGN + mühendislik kararları tek raporda.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`, `.kortext/references/API.md`, `.kortext/references/DESIGN.md`
   - outputs: `.kortext/foundation/TRD.md`

7. **+qa-engineer:** PRD + TRD'ye göre test stratejisi. Test türleri, kritik kullanıcı akışları, otomasyon kapsamı, manuel QA, kabul kriterleri, release öncesi kalite kapıları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/references/TEST.md`

## Konsolidasyon

1. **+operation-manager:** PRD + TRD + TEST çıktılarını konsolide et. Proje kapsamı, ana kararlar, açık konular, riskler, bağımlılıklar, planlama akışına aktarılacak görev başlıkları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

> [!NOTE] ANALİZ TAMAMLANDI
> +prime, PFD onayını bekliyorum. Onay sonrası `02-planning-pipeline`.

**Sonraki akış:** `02-planning-pipeline`
