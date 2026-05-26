# Onboarding Pipeline (`!start onboard`)

## Teknik Keşif

1. **+engineering-manager:** Mevcut codebase'i tarayarak stack + glossary + structure çıkar. Teknoloji yığını, MCP sunucuları, geliştirme araçları, klasör yapısı, bağımlılıklar, dil/framework versiyonları, isimlendirme kuralları, mimari kalıpları. Amaç yeni standart dayatmak değil mevcut teknik gerçekliği belgelemek.
   - inputs: `.kortext/foundation/BRD.md`
   - outputs: `.kortext/references/STACK.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/STRUCTURE.md`
   - approver: +prime

2. **+db-admin:** Mevcut veritabanı şemasını çıkar. Migration, schema, ORM modelleri, bağlantı biçimi; tablolar, ilişkiler, indeksler, veri tipleri, veri bütünlüğü kuralları.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/DATABASE.md`

3. **+security-engineer:** Mevcut güvenlik durumunu çıkar. Auth, yetkilendirme, middleware, env handling, CORS, rate limiting, secret yönetimi, loglama, hassas veri kullanımı; açıklar veya eksik katmanları işaretle.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/SECURITY.md`

4. **+devops-engineer:** Mevcut deployment + erişim durumunu çıkar. CI/CD pipeline'ları, deployment süreçleri, ortam yapılandırmaları, branch stratejisi, erişim sahipliği, secret yönetimi.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`

5. **+engineering-manager:** Mevcut API'yi çıkar. Endpoint listesi, request/response modelleri, auth mekanizmaları, servis sınırları, entegrasyon noktaları.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/API.md`

## Ürün Keşfi

1. **+product-manager:** Mevcut PRD'yi çıkar. Mevcut özellikler, kullanıcı akışları, roller/izinler, bilinen eksiklikler, var olan roadmap/issue listesi; ürünün şu anki davranışı ile BRD beklentisi arasındaki farkları görünür yap.
   - inputs: `.kortext/foundation/BRD.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

2. **+qa-engineer:** Mevcut test stratejisini çıkar. Test kapsamı, test tipleri, CI test raporları, eksik test alanları; kritik kullanıcı akışları için kalite güvencesinin yeterliliği.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STRUCTURE.md`
   - outputs: `.kortext/references/TEST.md`

## Teknik Borç ve TRD

1. **+engineering-manager:** TRD konsolide et. Keşif çıktılarındaki teknik borçlar, mimari sorunlar, güvenlik riskleri, test açıkları, devops/release riskleri ve iyileştirme alanlarını birleştir. Her borç kalemi için etki, risk, bağımlılık, öncelik seviyesi belirle.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/DATABASE.md`, `.kortext/references/SECURITY.md`, `.kortext/references/API.md`, `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

## Konsolidasyon

1. **+operation-manager:** PFD konsolide et. PRD + TRD + TEST üzerinden mevcut durum özeti, referans dosyaları, teknik borç listesi, açık kararlar, planlama akışına aktarılacak görev başlıklarını topla.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Sonraki akış:** `02-planning-pipeline`
