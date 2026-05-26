# Environment Setup (`!setup environment`)

## Servis Envanteri ve Credentials

1. **+devops-engineer:** STACK + SECURITY + DATABASE'i tara; harici servisleri tespit et. Her servisi iki kategoriye ayır: (a) yapılandırma bilgisi (URL, proje adı, public key, platform/ortam — `ACCESS.md` içine, VCS'e dahil), (b) gizli anahtar (API key, secret, token, connection string — yalnız `.env.example`'da anahtar adı + sade açıklama; gerçek değer sadece `.env`'de, asla VCS'te). `ENVIRONMENT.md`'ye yerel kurulum rehberini yaz: Node sürümü, paket yöneticisi, install adımları, OS-specific notlar. Her `.env.example` satırı için açıklama +prime'ın teknik bilgi sahibi olmadığı varsayımıyla yazılır (değişken ne, nereden temin edilir, neden gerekli).
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/SECURITY.md`, `.kortext/references/DATABASE.md`
   - outputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`
   - approver: +prime

2. **+devops-engineer:** Secrets scanning kur. İki katmandan en az biri: (a) pre-commit hook — `detect-secrets` / `gitleaks` / platform-native; commit anında secret içeren dosya engellenir, (b) CI pipeline tarama — her PR/push'ta otomatik, zorunlu status check ile branch protection'a dahil. Baseline + config dosyaları VCS'e dahil; `.env` ve gerçek secret dosyaları VCS-dışı. Kurulan katmanları `SECURITY.md`'ye dokümante et.
   - inputs: `.kortext/references/SECURITY.md`
   - outputs: `.kortext/references/SECURITY.md`

## Proje İskeleti

1. **+frontend-developer:** Frontend proje iskeletini oluştur veya mevcut iskeleti `STRUCTURE`'a uyarla.
   - inputs: `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`, `.kortext/references/DESIGN.md`

2. **+devops-engineer:** Repoyu başlat (`rules/branching.md` uyarınca), `.gitignore` hazırla, main branch'e doğrudan push'u engelleyen branch protection kurallarını uygula, staging/production ortamlarını `ACCESS` bilgisine göre ayarla, CI/CD pipeline'larını `06-deployment-cycle` uyarınca aktif et.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/STACK.md`

3. **+db-admin:** `DATABASE` şemasına göre veritabanlarını oluştur veya mevcut bağlantıları doğrula. Migration'ları çalıştır, seed data gerekiyorsa yükle.
   - inputs: `.kortext/references/DATABASE.md`, `.kortext/references/ENVIRONMENT.md`

## Uygulama Kurulumu

1. **+backend-developer:** Backend bağımlılıklarını yükle, başlangıç konfigürasyonlarını yap, gerekiyorsa mock data setlerini oluştur.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/API.md`, `.kortext/references/STRUCTURE.md`

2. **+frontend-developer:** Frontend bağımlılıklarını yükle, build setup'ı kur, `DESIGN` token'larını ve `STRUCTURE` yapısını projeye uygula.
   - inputs: `.kortext/references/DESIGN.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/STACK.md`

## Smoke Test

1. **+qa-engineer:** Kurulum smoke testi çalıştır: build, run, DB connection, API health endpoint, temel UI açılışı. Sonuçları per-file rapora yaz. Herhangi bir aşama hata verirse step fail eder; engine pipeline'ı durdurur.
   - inputs: `.kortext/references/TEST.md`, `.kortext/references/STACK.md`
   - outputs: `.kortext/reports/test-reports_<slug>_<ts>.md`

**Sonraki akış:** `04-development-cycle`
