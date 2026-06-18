# New Project Analysis

> **Bu dosyada:** Yeni bir proje için reference + foundation dosyaları üretilir.

## Product Analysis

1. **+compliance-expert:** `LEGAL.md` üret. Kapsam: BRD'ye göre uygulanan regülasyonlar (KVKK, GDPR, CCPA, sektörel) + veri yaşam döngüsü kuralları (gizlilik, aydınlatma, rıza, saklama, silme, 3. taraf paylaşımı).
   - label: LEGAL.md
   - activity: Uygulanan regülasyonlar çıkarıldı. Veri yaşam döngüsü kuralları belirlendi.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/LEGAL.md`
   - approver: +prime

2. **+growth-expert:** `GROWTH.md` üret. Kapsam: hedef kitle, kanal stratejisi, SEO/GEO, ölçümleme, analitik, dönüşüm takibi.
   - label: GROWTH.md
   - activity: Hedef kitle ve kanallar tanımlandı. SEO ve ölçümleme planlandı.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/GROWTH.md`
   - approver: +prime

3. **+product-manager:** `PRD.md` üret. BRD + LEGAL + GROWTH'tan: kapsam, kullanıcı tipleri, ana akışlar, öncelikler, kabul kriterleri, kapsam-dışı kalemler.
   - label: PRD.md
   - activity: Kapsam ve kullanıcı tipleri netleşti. Ana akışlar belirlendi.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

4. **+copywriter:** `CONTENT.md` üret. PRD + LEGAL + GROWTH'tan: marka dili, mesaj hiyerarşisi, sayfa metinleri, mikro metinler, SEO içerik yönü.
   - label: CONTENT.md
   - activity: Marka dili oturtuldu. Sayfa metinleri yazıldı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/references/CONTENT.md`
   - approver: +prime

## Technical Analysis

1. **+engineering-manager:** `STACK.md` + `GLOSSARY.md` + `STRUCTURE.md` üret. STACK: teknoloji yığını, MCP sunucuları, dev araçları, +prime'dan istenecek ön gereksinimler (cihaz, emulator, API key, harici servis). GLOSSARY: proje terminolojisi. STRUCTURE: kodlama standartları + klasör yapısı.
   - label: STACK.md
   - activity: Teknoloji yığını seçildi. Standartlar ve sözlük tanımlandı.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

2. **+security-engineer:** `SECURITY.md` üret. STACK üzerine: auth, yetkilendirme, secret yönetimi, veri saklama, loglama, `.gitignore`, güvenli geliştirme disiplini.
   - label: SECURITY.md
   - activity: Auth ve secret yönetimi kuruldu. Güvenli geliştirme kuralları belirlendi.
   - inputs: `.kortext/references/STACK.md`
   - outputs: `.kortext/references/SECURITY.md`

3. **+designer:** `DESIGN.md` üret. PRD + CONTENT + STACK'ten: renk paleti, tipografi, bileşen ilkeleri, responsive davranış, erişilebilirlik, temel UI kuralları.
   - label: DESIGN.md
   - activity: Renk ve tipografi seçildi. Bileşen ilkeleri tanımlandı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/CONTENT.md`
   - outputs: `.kortext/references/DESIGN.md`
   - approver: +prime

4. **+db-admin:** `DATABASE.md` üret. PRD + SECURITY + STRUCTURE + STACK'ten: tablolar, ilişkiler, indeksler, erişim kuralları, migration yaklaşımı, veri bütünlüğü.
   - label: DATABASE.md
   - activity: Veritabanı şeması oluşturuldu. Tablolar ve ilişkiler belirlendi.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`
   - outputs: `.kortext/references/DATABASE.md`

5. **+engineering-manager:** `API.md` üret. Endpoint listesi, request/response modelleri, hata formatları, yetkilendirme gereksinimleri, veri akışı.
   - label: API.md
   - activity: Endpoint'ler tanımlandı. Request/response modelleri çıkarıldı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

6. **+engineering-manager:** `TRD.md` konsolide et. STACK + STRUCTURE + GLOSSARY + SECURITY + DATABASE + API + DESIGN çıktıları + mühendislik kararları tek raporda birleştir.
   - label: TRD.md
   - activity: Teknik kararlar tek raporda birleştirildi.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`, `.kortext/references/API.md`, `.kortext/references/DESIGN.md`
   - outputs: `.kortext/foundation/TRD.md`

7. **+qa-engineer:** `TEST.md` üret. PRD + TRD'den: test türleri, kritik kullanıcı akışları, otomasyon kapsamı, manuel QA, kabul kriterleri, release kalite kapıları.
   - label: TEST.md
   - activity: Test türleri ve kalite kapıları belirlendi.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/references/TEST.md`

## Konsolidasyon

1. **+operation-manager:** `PFD.md` konsolide et. PRD + TRD + TEST'ten: proje kapsamı, ana kararlar, açık konular, riskler, bağımlılıklar, planlama akışına geçecek görev başlıkları.
   - label: PFD.md
   - activity: Proje özeti çıkarıldı. Planlamaya geçecek görevler hazırlandı.

   **Memory (kalıcı karar günlüğü):** Analiz aşamasında alınan kalıcı ürün/mimari kararları `.kortext/memory/decisions.md`'e yaz (dosya yoksa oluştur, en üste `# Decisions` başlığı). Her karar tek madde: ne karar verildi + kısa gerekçe (örn. "Stack: Next.js + Postgres — ekip aşinalığı + SSR ihtiyacı", "KVKK kapsamı: kullanıcı verisi AB dışına çıkmayacak"). Bu dosya planning akışında üstüne eklenerek büyür.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`, `.kortext/memory/decisions.md`
   - approver: +prime

**Sonraki akış:** `planning-pipeline`
