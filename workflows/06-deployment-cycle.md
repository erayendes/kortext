# Deployment Cycle (`!deploy prod`)

Bu akış, onaylı değişiklikleri staging ve production ortamlarına güvenli şekilde taşır.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Release kapsamındaki item'lar tamamlanmış, test kayıtları hazır ve +prime production onayı alınmış olmalıdır.
- **Girdi:** Test, security, delivery ve release kanıtları.
- **Çıkış:** Deployment kaydı, release notes, izleme sonucu ve gerekirse rollback tetikleyicisi.
- **Sonraki akış:** Başarılıysa kapanış; hata varsa `07-rollback-pipeline.md`.

## Otomasyon Çağrıları

> [!TIP] Bu tablo workflow adımlarının hangi script/hook'a bağlandığını gösterir. Tek-kaynak referans: `../settings/INTEGRATION-MAP.md`.

| Adım | Tetikleyici Persona | Script / Hook | Beklenen Çıktı |
|---|---|---|---|
| Release Go onayı | +delivery-manager | `!approve` (manuel) | +prime onayı kaydı |
| Pre-Deployment kontrol | +devops-engineer | `scripts/kortext-consistency-check.py` (release readiness) | Tutarsızlık raporu (yoksa exit 0) |
| Staging deploy tetik | (CI/CD) | `development` branch push (otomatik) | Staging artifact + release candidate tag |
| Staging fail | +qa-engineer | (deployment durdur, rapor `../workspace/reports/test-reports.md`) | Süreç durur, +prime'a `DEPLOYMENT DURDU` bildirimi |
| Production deploy | +devops-engineer | `git tag -a v[A.B.C] -m "release: v[A.B.C]"` + proje-spesifik deploy komutları | Live production, semantik tag |
| Production deploy hook | (otomatik) | `hooks/git-pre-push.sh` (branch-guard) | Main/master push kontrolü |
| Post-deploy fail (metric eşik aşımı) | +devops-engineer | `!trigger-rollback` → `workflows/07-rollback-pipeline.md` | Rollback workflow başlar |
| Post-deploy success | +devops-engineer | (rapor `../workspace/reports/delivery-reports.md` + `release-notes.md`) | Deployment kapanış raporları |
| Item Done geçişi | +devops-engineer | `scripts/kortext-handover.py` → `scripts/kortext-item-transition.py --to Done` → `scripts/kortext-backlog-sync.py` | Item kapanış zinciri, otomatik git commit |

> [!TIP] Bu akış `../rules/branching.md` ve `05-test-cycle.md` ile entegre çalışır. Her aşamada elde edilen onaylar atlanmadan sırayla tamamlanmalıdır.

## Release Kararı (Go / No-Go)

**Sorumlu:** +delivery-manager
1. Deployment başlatılmadan önce +delivery-manager ilgili ajanlardan release readiness onayı alır:

| Kontrol | Sorumlu | Kaynak |
|---|---|---|
| Test coverage %80+ ve kritik bug yok | +qa-engineer | `../workspace/reports/test-reports.md` |
| Güvenlik açığı yok | +security-engineer | `../workspace/reports/security-reports.md` |
| API dokümantasyonu güncel | +engineering-manager | `../workspace/references/api-reference.md` |
| Branch temiz, conflict yok | +devops-engineer | Git log |
| Production environment hazır | +devops-engineer | `../workspace/references/access.md` |
| DB migration'ları hazırlanmış ve test edilmiş | +db-admin | — |
| Rollback planı belirlenmiş | +devops-engineer | `../workspace/reports/delivery-reports.md` |

> [!WARNING]
> **Hepsinden yeşil ışık geldiyse → Go.** Herhangi bir kriter geçemediyse → No-Go, sorun çözülene kadar deployment ertelenir.
> **+prime onayı zorunludur.** +delivery-manager Go kararını `!approve` ile +prime'a sunar; onay gelmeden Pre-Deployment Hazırlığı'na geçilmez.

### Ara Bildirim

> [!NOTE] RELEASE ONAYI BEKLENİYOR
> +prime, 
> `[project-name]` için production release hazırlığı tamamlandı.
> Go/No-Go özeti `../workspace/reports/delivery-reports.md` içinde.
> Production deployment için onayını bekliyorum.

## Pre-Deployment Hazırlığı

**Sorumlu:** +devops-engineer

### Ortam Değişkenleri Kontrolü

1. +devops-engineer `.env.example` içindeki gerekli production key listesini çıkarır.
2. Ajanlar `.env.production` veya gerçek secret değerlerini okumaz, yazmaz ve raporlamaz.
3. Eksik görünen yapılandırma varsa yalnızca key adı raporlanır; değer istenmez.
4. `../workspace/references/access.md` üzerindeki servis URL'lerinin production değerleri kontrol edilir.
5. +prime veya insan operator production environment'ın hazır olduğunu onaylar.
6. Production environment onayı gelmeden deployment devam etmez.

### Veritabanı Migration Hazırlığı

> [!TIP] 
> Bu adım migration içermeyen deployment'larda atlanır.
> Migration sırasında veri kaybı riski varsa → +prime onayı zorunludur, devam etme.

**Sorumlu:** +db-admin
1. Migration dosyalarının ileri alma ve geri alma yolunu içerdiğini doğrula.
2. Staging ortamında migration'ı çalıştır; başarıyla tamamlandığını ve geri alınabilir olduğunu test et.
3. Production veritabanı için snapshot/dump alınacağını doğrula.
4. Yedeğin erişilebilir bir konumda saklandığını doğrula.
5. Migration ve backup sonucu `../workspace/reports/delivery-reports.md` dosyasına yazılır.

### Artifact Hazırlığı

**Sorumlu:** +devops-engineer

1. Son kararlı artifact/image rollback referansı olarak işaretlenir.
2. Production artifact/image release versiyonu ile hazırlanır.
3. Artifact bilgisi, registry/path, versiyon ve rollback referansı `../workspace/reports/delivery-reports.md` dosyasına yazılır.
4. Gerçek build/publish komutları proje dokümantasyonu veya CI/CD yapılandırmasından alınır; bu workflow içine genel komut kopyalanmaz.

## Staging Doğrulaması

> [!TIP] **Tetikleyici:** `development` branch'ine yapılan merge'ler.  

**Sorumlu:** +devops-engineer ve +qa-engineer
1. CI/CD pipeline otomatik olarak `development` branch'ini Staging ortamına deploy eder.
2. Artifact veya image build edilir ve release candidate olarak işaretlenir. Örn: `v1.0.0-rc1`.
3. +qa-engineer'a Staging ortamının hazır olduğu bildirilir.
4. +qa-engineer Staging doğrulamasını `05-test-cycle.md` standardına göre yürütür.
5. Smoke, E2E, migration ve manuel QA sonuçları `../workspace/reports/test-reports.md` dosyasına yazılır.
6. Staging sonucu `PASS` olmadan Production Deployment aşamasına geçilmez.

## Production Deployment

> [!TIP] **Tetikleyici:** +prime onayı sonrası `main` branch'e alınan release değişikliğiyle başlar. Semantik tag başarılı production doğrulamasından sonra oluşturulur.  
> **Onay:** +prime onayı Release Kararı aşamasında alınmış olmalıdır.

### DB Migration (Varsa)

- Migration proje dokümantasyonu veya CI/CD yapılandırmasındaki production migration komutu ile uygulanır.
- Migration başarısız olursa → Rollback Senaryosu'na geç, deploy durdur.
- Migration başarılıysa → sonraki adıma geç.

### Traffic Geçişi

Proje altyapısına göre tek deployment stratejisi seçilir ve `../workspace/reports/delivery-reports.md` içine yazılır.

| Strateji | Ne zaman kullanılır? | Rollback beklentisi |
|---|---|---|
| Blue/Green | Kesintisiz geçiş ve hızlı geri dönüş gerekiyorsa | Eski ortam hazır tutulur |
| Rolling Update | Orkestrasyon altyapısı varsa | Platform rollback mekanizması kullanılır |
| VM / Compose | Basit veya tek sunuculu altyapı varsa | Önceki artifact/image geri alınır |

+devops-engineer seçilen stratejiye göre proje-spesifik deploy komutlarını uygular. Komutlar bu workflow içinde genellenmez; gerçek komutlar proje dokümantasyonu, CI/CD yapılandırması veya `../workspace/reports/delivery-reports.md` içinde tutulur.

### Post-Deploy Smoke Test (Production)

**Sorumlu:** +qa-engineer
Deploy tamamlandıktan hemen sonra production üzerinde doğrulama yapılır:

- [ ] Ana sayfa ve kritik sayfalar yükleniyor
- [ ] Kullanıcı login/logout akışı çalışıyor
- [ ] Veri okuma işlemleri (liste, detay) başarılı
- [ ] Veri yazma işlemleri (form submit, kayıt oluşturma) başarılı
- [ ] Ödeme veya kritik iş akışı çalışıyor (varsa)
- [ ] API endpoint'leri 200 dönüyor (etkilenen modüller)
- [ ] DB migration başarıyla uygulandı ve veriler tutarlı
- [ ] Hata oranı (5xx) beklenen seviyelerde

## Post-Deploy İzleme

**Sorumlu:** +devops-engineer

Deployment sonrası **minimum 15 dakika** monitoring dashboard'ları izlenir:

| Metrik | Eşik | Aksiyon |
|---|---|---|
| Hata oranı (5xx) | Deployment öncesine göre +%5'in üzeri | Rollback Senaryosu |
| Response time (p95) | 2 katına çıkma veya SLA aşımı | Rollback Senaryosu |
| Kritik iş akışı hataları | Herhangi bir hata | Rollback Senaryosu |
| Otomatik monitoring alarmı | Alert tetiklenmesi | Rollback Senaryosu |

15 dakika sorunsuz geçerse deployment başarılı kabul edilir.

## Rollback Senaryosu

Deployment sonrası yukarıdaki eşiklerden herhangi biri aşılırsa +devops-engineer derhal `07-rollback-pipeline.md` akışını başlatır.

> [!TIP] **P0 durumunda** +devops-engineer +prime onayını beklemeksizin rollback'i başlatabilir; onay eş zamanlı alınır.

##  Post-Deployment Görevleri

**Tetikleyici:** Post-Deploy İzleme süresi sorunsuz tamamlandı.

### Release Tag

**Sorumlu:** +devops-engineer

Production deployment ve post-deploy izleme başarıyla tamamlandıktan sonra semantik versiyon tag'i oluşturulur.

```bash
git tag -a v[A.B.C] -m "release: v[A.B.C]"
git push origin v[A.B.C]
```

### SEO ve Analytics

**Sorumlu:** +growth-expert
- `sitemap.xml` güncellenip search engine'e gönderilir (Google Search Console).
- `robots.txt` production ortamı için doğrulanır.
- Analytics ve tag manager yapılandırmasının aktif olduğu kontrol edilir.

### Raporlama

| Dosya | Sorumlu | İçerik |
|---|---|---|
| `../workspace/reports/delivery-reports.md` | +devops-engineer | Build info, image tag, deploy zamanı, ortam, migration durumu |
| `../workspace/reports/release-notes.md` | +delivery-manager | Kullanıcıya yönelik yeni özellikler, bug düzeltmeleri, breaking changes |
| `../workspace/memory/context/[agent-name]-active.md` | +devops-engineer | Aktif deployment kaydı kapatılır |

## Bildirim

Duruma göre yalnızca ilgili bildirimi gönder.

> [!NOTE] RELEASE ONAYI BEKLENİYOR
> +prime,
> `[project-name]` v[A.B.C] production deployment için hazır.
> Go/No-Go özeti: `../workspace/reports/delivery-reports.md`
> Sürüm notları: `../workspace/reports/release-notes.md`
> Onayını bekliyorum.

> [!NOTE] DEPLOYMENT TAMAMLANDI
> +prime,
> `[project-name]` v[A.B.C] canlıya deploy edildi.
> Strateji: [Blue/Green / Rolling / VM-Compose]
> DB Migration: [Uygulandı / Uygulanmadı]
> Post-Deploy İzleme: [süre] sorunsuz geçti.
> Detaylar: `../workspace/reports/delivery-reports.md`
> Sürüm notları: `../workspace/reports/release-notes.md`

> [!NOTE] DEPLOYMENT DURDU
> +prime,
> `[project-name]` v[A.B.C] deployment süreci durduruldu.
> Sebep: [No-Go / Staging fail / Environment eksik / Migration riski / Diğer]
> Detaylar: `../workspace/reports/delivery-reports.md`
> Komutunu bekliyorum.

> [!NOTE] ROLLBACK BAŞLADI
> +prime,
> `[project-name]` v[A.B.C] için rollback başlatıldı.
> Sebep: [kısa sebep]
> Akış: `07-rollback-pipeline.md`
> Detaylar: `../workspace/reports/delivery-reports.md`
