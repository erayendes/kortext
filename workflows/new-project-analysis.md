# New Project Analysis

> **Bu dosyada:** Yeni bir proje için reference + foundation dosyaları üretilir.

## Product Analysis

1. **+compliance-expert:** `LEGAL.md` üret. Kapsam: BRD'ye göre uygulanan regülasyonlar (KVKK, GDPR, CCPA, sektörel) + veri yaşam döngüsü kuralları (gizlilik, aydınlatma, rıza, saklama, silme, 3. taraf paylaşımı).
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/LEGAL.md`
   - approver: +prime

2. **+growth-expert:** `GROWTH.md` üret. Kapsam: hedef kitle, kanal stratejisi, SEO/GEO, ölçümleme, analitik, dönüşüm takibi.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/GROWTH.md`
   - approver: +prime

3. **+product-manager:** `PRD.md` üret. BRD + LEGAL + GROWTH'tan: kapsam, kullanıcı tipleri, ana akışlar, öncelikler, kabul kriterleri, kapsam-dışı kalemler.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

4. **+copywriter:** `CONTENT.md` üret. PRD + LEGAL + GROWTH'tan: marka dili, mesaj hiyerarşisi, sayfa metinleri, mikro metinler, SEO içerik yönü.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/LEGAL.md`, `.kortext/references/GROWTH.md`
   - outputs: `.kortext/references/CONTENT.md`
   - approver: +prime

## Technical Analysis

1. **+engineering-manager:** `STACK.md` + `GLOSSARY.md` + `STRUCTURE.md` üret. STACK: teknoloji yığını, MCP sunucuları, dev araçları, +prime'dan istenecek ön gereksinimler (cihaz, emulator, API key, harici servis). GLOSSARY: proje terminolojisi. STRUCTURE: kodlama standartları + klasör yapısı.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/foundation/PRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

2. **+security-engineer:** `SECURITY.md` üret. STACK üzerine: auth, yetkilendirme, secret yönetimi, veri saklama, loglama, `.gitignore`, güvenli geliştirme disiplini.
   - inputs: `.kortext/references/STACK.md`
   - outputs: `.kortext/references/SECURITY.md`

3. **+designer:** `DESIGN.md` üret. PRD + CONTENT + STACK'ten: renk paleti, tipografi, bileşen ilkeleri, responsive davranış, erişilebilirlik, temel UI kuralları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/CONTENT.md`
   - outputs: `.kortext/references/DESIGN.md`
   - approver: +prime

4. **+db-admin:** `DATABASE.md` üret. PRD + SECURITY + STRUCTURE + STACK'ten: tablolar, ilişkiler, indeksler, erişim kuralları, migration yaklaşımı, veri bütünlüğü.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`
   - outputs: `.kortext/references/DATABASE.md`

5. **+engineering-manager:** `API.md` üret. Endpoint listesi, request/response modelleri, hata formatları, yetkilendirme gereksinimleri, veri akışı.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

6. **+engineering-manager:** `TRD.md` konsolide et. STACK + STRUCTURE + GLOSSARY + SECURITY + DATABASE + API + DESIGN çıktıları + mühendislik kararları tek raporda birleştir.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/SECURITY.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DATABASE.md`, `.kortext/references/API.md`, `.kortext/references/DESIGN.md`
   - outputs: `.kortext/foundation/TRD.md`

7. **+qa-engineer:** `TEST.md` üret. PRD + TRD'den: test türleri, kritik kullanıcı akışları, otomasyon kapsamı, manuel QA, kabul kriterleri, release kalite kapıları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`
   - outputs: `.kortext/references/TEST.md`

## Konsolidasyon

1. **+operation-manager:** `PFD.md` konsolide et. PRD + TRD + TEST'ten: proje kapsamı, ana kararlar, açık konular, riskler, bağımlılıklar, planlama akışına geçecek görev başlıkları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Sonraki akış:** `planning-pipeline`
