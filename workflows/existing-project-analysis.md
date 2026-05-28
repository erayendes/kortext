# Existing Project Analysis

> **Disiplin:** Bu workflow **mevcut teknik gerçekliği belgeler**, yeni standart dayatmaz. "İyileştirme" değil "keşif". Borç tespiti TRD'de toplanır; planlama akışında ele alınır.

## Teknik Keşif

1. **+engineering-manager:** `STACK.md` + `GLOSSARY.md` + `STRUCTURE.md` üret. Mevcut codebase'i tara, BRD'yle karşılaştırma. Kapsam: STACK (teknoloji yığını, MCP sunucuları, dev araçları, bağımlılıklar, dil/framework versiyonları), GLOSSARY (proje terminolojisi), STRUCTURE (klasör yapısı, isimlendirme kuralları, mimari kalıplar).
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

2. **+db-admin:** `DATABASE.md` üret. Kapsam: mevcut migration + schema + ORM modelleri + bağlantı biçimi + tablolar + ilişkiler + indeksler + veri tipleri + bütünlük kuralları.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/DATABASE.md`

3. **+security-engineer:** `SECURITY.md` üret. Kapsam: mevcut auth + yetkilendirme + middleware + env handling + CORS + rate limiting + secret yönetimi + loglama + hassas veri kullanımı. Açıkları ve eksik katmanları işaretle.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/SECURITY.md`

4. **+devops-engineer:** `ACCESS.md` + `ENVIRONMENT.md` üret. Kapsam: CI/CD pipeline'ları, deployment süreçleri, ortam yapılandırmaları, branch stratejisi, erişim sahipliği, secret yönetimi.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`

5. **+engineering-manager:** `API.md` üret. Kapsam: endpoint listesi + request/response modelleri + auth mekanizmaları + servis sınırları + entegrasyon noktaları.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

## Ürün Keşfi

1. **+product-manager:** `PRD.md` üret. Kapsam: mevcut özellikler + kullanıcı akışları + roller/izinler + bilinen eksiklikler + var olan roadmap/issue listesi. Şu anki davranış ile BRD beklentisi arasındaki farkları görünür yap.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

2. **+qa-engineer:** `TEST.md` üret. Kapsam: test kapsamı + test tipleri + CI test raporları + eksik test alanları. Kritik kullanıcı akışları için kalite güvencesinin yeterliliğini belgele.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/TEST.md`

## Teknik Borç ve TRD

1. **+engineering-manager:** `TRD.md` konsolide et. Kapsam: keşif çıktılarındaki teknik borçlar + mimari sorunlar + güvenlik riskleri + test açıkları + devops/release riskleri + iyileştirme alanları. Her borç kalemi için: etki, risk, bağımlılık, öncelik seviyesi.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/DATABASE.md`, `.kortext/references/SECURITY.md`, `.kortext/references/API.md`, `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

## Konsolidasyon

1. **+operation-manager:** `PFD.md` konsolide et. PRD + TRD + TEST'ten: mevcut durum özeti + referans dosyaları + teknik borç listesi + açık kararlar + planlama akışına aktarılacak görev başlıkları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Sonraki akış:** `02-planning-pipeline`
