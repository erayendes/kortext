# Environment Setup

> **Bu dosyada:** Proje çalışır hale getirilir: harici servisler kayda alınır, secret yönetimi kurulur, proje iskeleti ve bağımlılıklar hazırlanır, smoke test ile doğrulanır.

## Servis Envanteri ve Credentials

1. **+devops-engineer:** STACK + SECURITY + DATABASE'i tara; harici servisleri tespit et. Kategoriler: (a) yapılandırma bilgisi (URL, proje adı, public key, platform/ortam) → `ACCESS.md`, VCS'e dahil; (b) gizli anahtar (API key, secret, token, connection string) → `.env.example`'da sadece anahtar adı + sade açıklama, gerçek değer `.env`'de (asla VCS'e). `ENVIRONMENT.md`: yerel kurulum rehberi (Node sürümü, paket yöneticisi, install adımları, OS-specific notlar). `ACCESS.md`'ye **Ortamlar** bölümü ekle: staging = test verisi · preprod = canlı veri · prod = canlı veri; her ortamın URL/instance bilgisi + veri sınıfı. preprod/prod canlı veri tuttuğu için prod-seviyesi koruma (KVKK/GDPR) — SECURITY/LEGAL çapraz referansı. `.env.example` her satırı +prime'ın teknik bilgisi olmadığı varsayımıyla yazılır (değişken ne, nereden temin edilir, neden gerekli).
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/SECURITY.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`
   - approver: +prime

2. **+devops-engineer:** Secrets scanning kur. İki katmandan en az biri: (a) pre-commit hook — `detect-secrets` / `gitleaks` / platform-native, commit anında secret içeren dosya engellenir; (b) CI pipeline tarama — her PR/push'ta otomatik, zorunlu status check ile branch protection'a dahil. Baseline + config dosyaları VCS'e dahil; `.env` ve gerçek secret dosyaları VCS-dışı. Kurulan katmanları `SECURITY.md`'ye dokümante et.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `secrets-scanning-configured`

## Proje İskeleti

1. **+frontend-developer:** Frontend proje iskeletini oluştur (veya mevcudu `STRUCTURE`'a uyarla).
   - inputs: `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DESIGN.md`
   - outputs: `frontend-scaffolded`

2. **+devops-engineer:** Repoyu başlat (`rules/branching.md` uyarınca), `.gitignore` hazırla, main branch'e doğrudan push'u engelleyen branch protection kurallarını uygula, staging/production ortamlarını `ACCESS`'e göre ayarla, CI/CD pipeline'larını `deployment-cycle` uyarınca aktif et.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/STACK.md`
   - outputs: `repo-initialized`

3. **+db-admin:** `DATABASE` şemasına göre veritabanlarını oluştur (veya mevcut bağlantıları doğrula). Migration'ları çalıştır, seed data gerekiyorsa yükle.
   - inputs: `.kortext/references/DATABASE.md`, `.kortext/references/ENVIRONMENT.md`
   - outputs: `db-deployed`

## Uygulama Kurulumu

1. **+backend-developer:** Backend bağımlılıklarını yükle, başlangıç konfigürasyonlarını yap, gerekiyorsa mock data setlerini oluştur.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/API.md`, `.kortext/references/STRUCTURE.md`, `repo-initialized`
   - outputs: `backend-ready`

2. **+frontend-developer:** Frontend bağımlılıklarını yükle, build setup'ı kur, `DESIGN` token'larını ve `STRUCTURE` yapısını projeye uygula.
   - inputs: `.kortext/references/DESIGN.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `frontend-scaffolded`, `repo-initialized`
   - outputs: `frontend-ready`

## Smoke Test

1. **+qa-engineer:** Kurulum smoke testi çalıştır: build, run, DB connection, API health endpoint, temel UI açılışı. Sonuçları per-file rapora yaz. Herhangi bir aşama hata verirse step fail eder; engine pipeline'ı durdurur.
   - inputs: `.kortext/references/TEST.md`, `.kortext/references/STACK.md`, `backend-ready`, `frontend-ready`, `db-deployed`
   - outputs: `.kortext/reports/test-reports.md`

**Sonraki akış:** `development-cycle`
