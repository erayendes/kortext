# Environment Setup (`!setup environment`)

Bu akış, onaylı analiz çıktıları hazırlandıktan sonra projenin çalışabilir ortamını kurar.

## Girdi ve Çıkış

- **Başlangıç koşulu:** `../workspace/references/tech-stack.md`, `../workspace/references/security-rules.md`, `../workspace/references/db-schema.md` ve gerekli ürün/teknik kararları onaylanmış olmalıdır.
- **Girdi:** Onaylı referans dosyaları ve +prime tarafından sağlanan gerçek secret değerleri.
- **Çıkış:** Çalışan geliştirme ortamı, belgelenmiş erişim yapısı, secrets scanning kurulumu ve smoke test sonucu.
- **Sonraki akış:** Ortam doğrulandıktan sonra `04-development-cycle.md`.

## Servis Envanteri ve Credential Setup

1. **+devops-engineer:** `../workspace/references/tech-stack.md`, `../workspace/references/security-rules.md` ve `../workspace/references/db-schema.md` dosyalarını inceleyerek tüm harici servisleri tespit eder.
2. Her servisi iki kategoriye ayırır:
	- **Yapılandırma bilgisi:** URL, proje adı, public key, platform adı, ortam adı gibi açık bilgiler. `../workspace/references/access.md` içinde tutulur ve versiyon kontrolüne dahil edilebilir.
	- **Gizli anahtar:** API key, secret, token, connection string gibi gerçek değerler. `.env.example` içinde yalnızca anahtar adı ve açıklaması yer alır; gerçek değerler sadece `.env` dosyasında tutulur.
3. Servis envanterinden elde edilen açık yapılandırma bilgilerini `../workspace/references/access.md` dosyasına yazar.
4. Gerekli environment variable anahtarlarını ve sade açıklamalarını `.env.example` dosyasına yazar.
5. `../workspace/references/access.md` ve `.env.example` dosyalarını +prime'a sunar.

> [!NOTE]
> Talep metnini teknik jargon kullanmadan, sade bir dille hazırlar.
> Her değişken için +prime'ın teknik bilgi sahibi olmadığı dikkate alınarak **sade bir açıklama** yazılır. Açıklamada şu bilgiler yer alır: değişkenin **ne olduğu**, **nereden temin edileceği** ve **neden gerektiği**. 
> Gerçek değerler **asla** yazılmaz.

### Ara Bildirim

> [!NOTE] ORTAM KURULUYOR
> +prime, 
> `../workspace/references/access.md` ve `.env.example` hazır.
> Lütfen `access.md` içindeki boş yapılandırma alanlarını ve proje root dizinindeki `.env` dosyasını doldur.
> Doldurduktan sonra `!approve access` ve `!approve .env` komutlarını bekliyorum.

**+prime:**
1. `../workspace/references/access.md` dosyasındaki boş alanları doldurur.
2. `.env.example` dosyasındaki açıklamaları takip ederek gerçek anahtarları temin eder.
3. Proje root dizininde `.env` dosyasını oluşturarak gerçek değerleri yazar.

> [!WARNING] `.env` dosyası **asla** versiyon kontrolüne dahil edilmez. `.gitignore`'da yer almalıdır. +prime dışında hiçbir ajan gizli anahtarlara doğrudan erişemez.

1. **+devops-engineer:** `.env` dosyasındaki anahtar adlarının `.env.example` ile eşleştiğini kontrol eder. Gerçek secret değerlerini okumaz, yazmaz veya raporlamaz.
2. `../workspace/references/access.md` bilgilerinin doğruluğunu ve erişilebilirliğini doğrular.
3. Uygulamanın bu yapılandırmayla başarıyla ayağa kalktığını test eder.
4. Sorun tespit edilirse +prime'a sade bir dille geri bildirim verir ve düzeltme talep eder.

### Secrets Scanning Kurulumu

**+devops-engineer**, proje kurulumunun bir parçası olarak aşağıdaki iki katmandan en az birini yapılandırır:

#### Katman 1 — Pre-commit Hook (Yerel Koruma)

1. Commit anında secrets taraması yapar. Gizli anahtar içeren dosya commit edilmeye çalışılırsa işlem engellenir.
2. Kullanılan araç proje tech stack'ine göre seçilir. Örn: `detect-secrets`, `gitleaks`, platform-native secret scanning.
3. Baseline veya konfigürasyon dosyası versiyon kontrolüne dahil edilebilir; `.env` ve gerçek secret dosyaları dahil edilemez.

#### Katman 2 — CI Pipeline Taraması (Merkezi Koruma)

1. Her PR ve push'ta otomatik secrets taraması çalıştırır. Yerel hook'u atlamış commit'leri yakalar.
2. CI taraması zorunlu status check ise branch protection kurallarına dahil edilir.
3. Kurulan secrets scanning katmanı `../workspace/references/security-rules.md` ve `../workspace/reports/delivery-reports.md` içinde belgelenir.

### Çıktılar

| Dosya | Sorumlu | VCS | Açıklama |
|-------|---------|-----|----------|
| `../workspace/references/access.md` | +devops-engineer | Evet | Servis yapılandırma ve erişim referansı |
| `.env.example` | +devops-engineer | Evet | Ortam değişkenlerinin anahtar listesi ve açıklamaları |
| `.env` | +prime | Hayır | Gerçek gizli anahtarlar |
| `.secrets.baseline` | +devops-engineer | Evet | Secrets scanning baseline dosyası |
| `.pre-commit-config.yaml` | +devops-engineer | Evet | Pre-commit hook tanımı |
| `.github/workflows/secrets-scan.yml` | +devops-engineer | Evet | CI secrets tarama pipeline'ı |

## Proje İskeleti

1. **+frontend-developer:** `../workspace/references/file-system.md` yapısına göre frontend proje iskeletini oluşturur veya mevcut iskeleti düzenler.
2. **+devops-engineer:** `../rules/branching.md` uyarınca repoyu başlatır, `.gitignore` dosyasını hazırlar ve main branch'e doğrudan push'u engelleyecek branch protection kurallarını uygular.
3. Staging/Production ortamlarını `../workspace/references/access.md` içindeki bilgilere göre ayarlar.
4. `../workflows/06-deployment-cycle.md` uyarınca CI/CD pipeline'larını aktif eder.
5. **+db-admin:** `../workspace/references/db-schema.md` uyarınca veritabanlarını oluşturur veya mevcut veritabanı bağlantılarını doğrular.

## Uygulama Kurulumu

1. **+backend-developer:** `../workspace/references/tech-stack.md` ve `../workspace/references/api-reference.md` uyarınca backend bağımlılıklarını yükler, gerekli başlangıç konfigürasyonlarını yapar ve gerekiyorsa mock data setlerini oluşturur.
2. **+frontend-developer:** `../workspace/references/design-system.md` değerlerini ve `../workspace/references/file-system.md` yapısını projeye uygular.

## Kalite Kontrol (Smoke Test)

1. **+engineering-manager:** Kurulum commit'lerini ve proje iskeletinin `../workspace/references/file-system.md` ile uyumunu denetler.
2. **+qa-engineer:** Kurulumun hatasız olduğunu doğrulamak için smoke test yapar. Minimum kontroller: build, run, DB connection, API health ve temel UI açılışı.
3. Sonuçları `../workspace/reports/test-reports.md` dosyasına yazar.

## Bildirim

> [!NOTE] ORTAMLAR KURULDU
> +prime, 
> [project-name] tüm ortam eksiksiz kuruldu ve tüm kurulum testlerinden geçti.
> Sonuçlar `../workspace/reports/test-reports.md` dosyasına yazıldı.
> Rapor için `!approve/reject test-reports`, ardından geliştirmeye başlamak için `!start development` komutunu bekliyorum.
