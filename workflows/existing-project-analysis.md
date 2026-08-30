# Existing Project Analysis

> **Bu dosyada:** Mevcut bir projenin codebase'i incelenir, gerçek durumu reference + foundation dosyalarında belgelenir.

## Teknik Keşif

1. **+engineering-manager:** `STACK.md` + `STRUCTURE.md` üret. Mevcut codebase'i tara — zemin KOD GERÇEĞİDİR (bu akışta BRD yoktur). Kapsam: STACK (teknoloji yığını, MCP sunucuları, dev araçları, bağımlılıklar, dil/framework versiyonları), STRUCTURE (klasör yapısı, isimlendirme kuralları, kodlama standartları + proje terminolojisi sözlüğü).
   - inputs:
   - outputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - approver: +prime

2. **+engineering-manager:** `ARCHITECTURE.md` üret. Mevcut sistemin gerçek biçimini çıkar: bileşenler, veri akışı, sınırlar ve entegrasyon noktaları, ana mimari tercihlerin gerekçeleri. Kod ile niyet arasındaki farkları işaretle.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ARCHITECTURE.md`
   - approver: +prime

3. **+db-admin:** `DATABASE.md` üret. Kapsam: mevcut migration + schema + ORM modelleri + bağlantı biçimi + tablolar + ilişkiler + indeksler + veri tipleri + bütünlük kuralları.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/DATABASE.md`
   - approver: +prime

4. **+security-engineer:** `SECURITY.md` üret. Kapsam: mevcut auth + yetkilendirme + middleware + env handling + CORS + rate limiting + secret yönetimi + loglama + hassas veri kullanımı. Açıkları ve eksik katmanları işaretle.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/SECURITY.md`
   - approver: +prime

5. **+devops-engineer:** `ENVIRONMENT.md` üret. Kapsam: CI/CD pipeline'ları, deployment süreçleri, ortam yapılandırmaları, branch stratejisi + erişim sahipliği ve hesap envanteri (Access & Service bölümü), secret yönetimi.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/ENVIRONMENT.md`
   - approver: +prime

6. **+engineering-manager:** `API.md` üret. Kapsam: endpoint listesi + request/response modelleri + auth mekanizmaları + servis sınırları + entegrasyon noktaları.
   - inputs: `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/DATABASE.md`
   - outputs: `.kortext/API.md`
   - approver: +prime

## Ürün Keşfi

1. **+product-manager:** `PRD.md` üret. Kapsam: mevcut özellikler + kullanıcı akışları + roller/izinler + bilinen eksiklikler + var olan roadmap/issue listesi — hepsi koddan ve repodaki izlerden.
   - inputs: `.kortext/STRUCTURE.md`
   - outputs: `.kortext/foundation/PRD.md`
   - approver: +prime

2. **+qa-engineer:** `TEST.md` üret. Kapsam: test kapsamı + test tipleri + CI test raporları + eksik test alanları. Kritik kullanıcı akışları için kalite güvencesinin yeterliliğini belgele.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STRUCTURE.md`
   - outputs: `.kortext/TEST.md`
   - approver: +prime

## Teknik Borç ve TRD

1. **+engineering-manager:** `TRD.md` konsolide et. Kapsam: keşif çıktılarındaki teknik borçlar + mimari sorunlar + güvenlik riskleri + test açıkları + devops/release riskleri + iyileştirme alanları. Her borç kalemi için: etki, risk, bağımlılık, öncelik seviyesi.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/STACK.md`, `.kortext/STRUCTURE.md`, `.kortext/ARCHITECTURE.md`, `.kortext/DATABASE.md`, `.kortext/SECURITY.md`, `.kortext/API.md`, `.kortext/ENVIRONMENT.md`, `.kortext/TEST.md`
   - outputs: `.kortext/foundation/TRD.md`
   - approver: +prime

## Konsolidasyon

1. **+operation-manager:** `PFD.md` konsolide et. PRD + TRD + TEST'ten: mevcut durum özeti + referans dosyaları + teknik borç listesi + açık kararlar + planlama akışına aktarılacak görev başlıkları.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/TEST.md`
   - outputs: `.kortext/foundation/PFD.md`
   - approver: +prime

**Sonraki akış:** `planning-pipeline`
