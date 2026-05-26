# Analysis Pipeline (`!start analysis`)

## Product Analysis

1. **+compliance-expert:** Yasal gereksinimleri çıkar. Regülasyonlar (KVKK, GDPR, CCPA) ve veri konuları (gizlilik, aydınlatma, rıza, saklama, silme, üçüncü taraf paylaşımı) için kurallar belirle.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/LEGAL.md`
   - approver: +prime

2. **+growth-expert:** Büyüme stratejisi çıkar. Hedef kitle, kanal stratejisi, SEO/GEO, ölçümleme, analitik, dönüşüm takibi başlıklarını netleştir.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/GROWTH.md`
   - approver: +prime

3. **+product-manager:** Ürün gereksinimlerini üret. BRD + LEGAL + GROWTH'u birleştir; kapsam, kullanıcı tipleri, ana akışlar, öncelikler, kabul kriterleri, kapsam-dışı kalemleri yaz.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

4. **+copywriter:** İçerik stratejisi yaz. PRD + LEGAL + GROWTH'a göre marka dili, mesaj hiyerarşisi, sayfa metinleri, mikro metinler, kampanya/SEO içerik yönünü tanımla.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/references/CONTENT.md`
   - approver: +prime

## Technical Analysis

1. **+engineering-manager:** Stack + glossary + structure yaz. Teknoloji yığını, MCP sunucuları, geliştirme araçları, +prime'dan istenecek ön gereksinimler (test cihazları, emulator, API key, harici servisler), kodlama standartları, proje klasör yapısı.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

2. **+security-engineer:** Güvenlik kuralları çıkar. STACK üzerinde auth, yetkilendirme, secret yönetimi, veri saklama, loglama, `.gitignore`, güvenli geliştirme disiplinini tanımla.
   - inputs: `.kortext/references/STACK.md`
   - outputs: `.kortext/references/SECURITY.md`

3. **+designer:** Tasarım sistemi yaz. PRD + CONTENT + STACK'e göre renk paleti, tipografi, bileşen ilkeleri, responsive davranış, erişilebilirlik, temel UI kuralları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/CONTENT.md`
   - outputs: `.kortext/references/DESIGN.md`
   - approver: +prime

4. **+db-admin:** Veritabanı şeması tasarla. PRD + SECURITY + STRUCTURE + STACK üzerine tablolar, ilişkiler, indeksler, erişim kuralları, migration yaklaşımı, veri bütünlüğü.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`
   - outputs: `.kortext/references/DATABASE.md`

5. **+engineering-manager:** API tasarla. Endpoint listesi, request/response modelleri, hata formatları, yetkilendirme gereksinimleri, veri akışı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

6. **+engineering-manager:** TRD konsolide et. STACK + STRUCTURE + GLOSSARY + SECURITY + DATABASE + API + DESIGN çıktılarını ve mühendislik kararlarını tek raporda birleştir.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`, `.kortext/references/API.md`, `.kortext/references/DESIGN.md`
   - outputs: `.kortext/foundation/TRD.md`

7. **+qa-engineer:** Test stratejisi yaz. PRD + TRD'ye göre test türleri, kritik kullanıcı akışları, otomasyon kapsamı, manuel QA, kabul kriterleri, release öncesi kalite kapıları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/references/TEST.md`

## Konsolidasyon

1. **+operation-manager:** PFD konsolide et. PRD + TRD + TEST üzerinden proje kapsamı, ana kararlar, açık konular, riskler, bağımlılıklar, planlama akışına aktarılacak görev başlıklarını topla.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Sonraki akış:** `02-planning-pipeline`
