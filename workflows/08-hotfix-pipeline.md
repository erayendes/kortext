# Hotfix Pipeline

Bu akış, production ortamında tespit edilen kritik hataların rollback yerine hızlı ve kontrollü yamayla çözülmesi için kullanılır.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Rollback uygun değil, riskli ya da yetersiz olmalıdır.
- **Girdi:** Kritik hata kanıtı, ilgili Bug item ve production etkisi.
- **Çıkış:** Minimal düzeltme, patch release, learned kaydı ve güncel delivery/test raporları.
- **Sonraki akış:** Production deploy için `06-deployment-cycle.md`; sorun devam ederse `07-rollback-pipeline.md`.

**Sorumlu:** +operation-manager koordinasyondan, ilgili geliştirici ajan düzeltmeden, +devops-engineer branch/deploy yürütmesinden sorumludur.

## Karar: Hotfix mi, Rollback mi?

Hatayı tespit eden ajan önce `07-rollback-pipeline.md` kararını değerlendirir.

| Durum | Karar |
|---|---|
| Son deployment'tan kaynaklanıyor ve hızlıca geri alınabilir | Rollback (`07-rollback-pipeline.md`) |
| Eski sürümde de vardı veya rollback veri kaybına yol açar | Hotfix |
| DB migration ile gelen hata; revert veri bütünlüğünü bozar | Hotfix |
| Hata izole bir modülde ve düzeltme kısa sürede tamamlanabilir | Hotfix |

## Hata Sınıflandırması

+operation-manager hatanın önem seviyesini belirler.

| Seviye | Kriter | Beklenen aksiyon |
|---|---|---|
| P0 | Sistem tamamen çöktü, kullanıcıların tamamı etkilendi veya veri kaybı riski var | Hotfix hemen başlar, +prime eş zamanlı bilgilendirilir |
| P1 | Temel iş akışı bozuldu, kullanıcıların büyük kısmı etkilendi | Hotfix hemen başlar, +prime bilgilendirilir |
| P2 | Kısmi hata, workaround var veya sınırlı kullanıcı etkileniyor | +prime kararıyla hotfix veya normal geliştirme döngüsü |

## Hazırlık, Item ve Branch

**Sorumlu:** +operation-manager, +engineering-manager, +devops-engineer

1. Hotfix bir Bug item'a bağlanır: `../workspace/memory/backlog/BXX-[bug-name].md`.
2. P0 durumda Bug item hotfix başladıktan hemen sonra oluşturulabilir; süreç kapanmadan mutlaka kayıt altına alınır.
3. Bug item `../workspace/memory/backlog/epic-dashboard.md` içinde ilgili Epic satırıyla ilişkilendirilir.
4. +operation-manager `../workspace/memory/context/[agent-name]-active.md` dosyasını oluşturur veya günceller.
5. Etkilenen ajanlar göreve çağırılır: ilgili geliştirici ajan, +qa-engineer, gerekirse +security-engineer ve +db-admin.
6. Hotfix branch `main` üzerinden açılır.
7. Branch adı `hotfix/[item-id]-[short-name]` formatında olmalıdır. Örn: `hotfix/b07-login-crash`.
8. Force push veya history rewrite yapılmaz.

## Düzeltme

**Sorumlu:** İlgili geliştirici ajan

1. Hatanın kök nedenini log, hata mesajı ve kod incelemesiyle doğrula.
2. En minimal, hedefe yönelik düzeltmeyi yap; hotfix kapsamını genişletme.
3. Değişiklik Bug item'ın Acceptance Criteria maddelerini karşılamalıdır.
4. Commit mesajı `../workspace/references/dictionary.md` standartlarına uymalıdır.
5. Değişiklik `hotfix/[item-id]-[short-name]` branch'ine push edilir.

## DB Migration Varsa

**Sorumlu:** +db-admin

- Migration mümkünse geri alınabilir şekilde hazırlanır.
- Migration uygulanmadan önce backup/snapshot planı doğrulanır.
- Veri kaybı veya müşteri etkisi riski varsa +prime kararı olmadan devam edilmez.
- Migration staging ortamında test edilmeden production deploy yapılmaz.
- Migration sonucu `../workspace/reports/delivery-reports.md` içine yazılır.

## Test ve Güvenlik Kontrolü

**Sorumlu:** +qa-engineer, +security-engineer, +engineering-manager

1. Hotfix branch staging ortamına deploy edilir.
2. Test süreci `05-test-cycle.md` standardına göre yürütülür.
3. En az şu kontroller yapılır:
   - Raporlanan hatanın düzeldiği doğrulanır.
   - Etkilenen modül test edilir.
   - Yan etki riski olan komşu modüller test edilir.
   - Authentication/session akışları kontrol edilir.
   - Veri okuma/yazma işlemleri doğrulanır.
   - Etkilenen API endpoint'leri kontrol edilir.
   - DB migration varsa staging sonucu doğrulanır.
4. P0/P1 veya güvenlik etkisi olan hotfixlerde +security-engineer kontrolü zorunludur.
5. Test sonucu `../workspace/reports/test-reports.md` içine yazılır.

## Onay

Merge ve production deploy öncesinde gerekli onaylar tamamlanır:

| Onay | Sorumlu | Zorunluluk |
|---|---|---|
| Code review | +engineering-manager | Her hotfix |
| Smoke test | +qa-engineer | Her hotfix |
| Security check | +security-engineer | P0/P1 veya güvenlik/veri etkisi varsa |
| Production approval | +prime | P0/P1 için zorunlu; P2 için karar durumuna göre |

Onay tamamlanmadan production deploy yapılmaz.

## Merge ve Tag

**Sorumlu:** +devops-engineer

- Hotfix değişikliği `main` branch'ine alınır.
- Aynı değişiklik `development` branch'ine de alınır; gelecek sürümlerde tekrar kaybolmamalıdır.
- Patch version tag'i oluşturulur. Örn: `v1.0.0` -> `v1.0.1`.
- Hotfix branch temizliği proje git kurallarına göre yapılır.
- Merge, tag ve branch bilgisi `../workspace/reports/delivery-reports.md` dosyasına yazılır.

## Production Deploy

**Sorumlu:** +devops-engineer

- Production deploy `06-deployment-cycle.md` içindeki Production Deployment kurallarına göre yapılır.
- Ajanlar `.env.production` veya gerçek secret değerlerini okumaz, yazmaz ve raporlamaz.
- Deployment sonrası smoke test production üzerinde tekrar edilir.
- Hata oranı ve latency en az 15 dakika izlenir.
- Deployment sonrası sorun devam ederse `07-rollback-pipeline.md` başlatılır.

## Kök Neden Analizi

**Sorumlu:** Düzeltmeyi yapan geliştirici ajan

Hotfix başarıyla deploy edildikten sonra `../workspace/memory/learned.md` dosyasına yeni kayıt eklenir:

```md
## [YYYY-MM-DD] - Hotfix: [item-id] - [bug-name] (v[A.B.C])

**Severity:** P[0/1/2]
**Etkilenen Modül:** [modül adı]
**Etki Süresi:** [tespit zamanı] -> [düzeltme zamanı]

### Kök Neden
[Hataya ne sebep oldu?]

### Tespit
[Nasıl ve kim tarafından tespit edildi?]

### Düzeltme
[Ne değiştirildi?]

### Önlem
[Benzer hatayı önlemek için ne yapılmalı?]
```

## Raporlama ve Kapanış

| Dosya | Sorumlu | İçerik |
|---|---|---|
| `../workspace/reports/delivery-reports.md` | +devops-engineer | Hotfix build bilgisi, deploy zamanı, tag, strategy |
| `../workspace/reports/release-notes.md` | +delivery-manager | Kullanıcıya yönelik kısa açıklama |
| `../workspace/reports/test-reports.md` | +qa-engineer | Smoke test ve gate sonuçları |
| `../workspace/memory/learned.md` | İlgili geliştirici ajan | Post-mortem kaydı |
| `../workspace/memory/backlog/BXX-[bug-name].md` | +engineering-manager | Bug item kapanışı |
| `../workspace/memory/backlog/epic-dashboard.md` | +engineering-manager | Bug status güncellemesi |
| `../workspace/memory/context/[agent-name]-active.md` | +operation-manager | Aktif hotfix kaydı kapatılır |

Hotfix tamamlandığında Bug item `Done` yapılır. Eğer kapsam büyüdüyse veya kalıcı düzeltme gerekiyorsa yeni Task/Debt item oluşturulur.

## Bildirim

Duruma göre yalnızca ilgili bildirimi gönder.

> [!NOTE] HOTFIX KARARI BEKLENİYOR
> +prime,
> `../workspace/memory/backlog/BXX-[bug-name].md` için hotfix kararı gerekiyor.
> Sebep: [rollback riskli / veri kaybı riski / P2 karar]
> Seçenekler: [hotfix / rollback / normal geliştirme]
> Komutunu bekliyorum.

> [!NOTE] HOTFIX BAŞLADI
> +prime,
> `../workspace/memory/backlog/BXX-[bug-name].md` için hotfix başlatıldı.
> Severity: P[0/1/2]
> Etki: [kısa etki özeti]
> Detaylar: `../workspace/reports/delivery-reports.md`

> [!NOTE] HOTFIX ONAYI BEKLENİYOR
> +prime,
> `../workspace/memory/backlog/BXX-[bug-name].md` için hotfix testleri tamamlandı.
> Test raporu: `../workspace/reports/test-reports.md`
> Production deploy için onayını bekliyorum.

> [!NOTE] HOTFIX TAMAMLANDI
> +prime,
> `../workspace/memory/backlog/BXX-[bug-name].md` canlıda düzeltildi.
> Sürüm: v[A.B.C]
> Etki süresi: [süre]
> Detaylar: `../workspace/reports/delivery-reports.md`
> Sürüm notları: `../workspace/reports/release-notes.md`
> Kök neden kaydı: `../workspace/memory/learned.md`

> [!NOTE] HOTFIX DURDU
> +prime,
> `../workspace/memory/backlog/BXX-[bug-name].md` hotfix süreci durduruldu.
> Sebep: [kısa sebep]
> Detaylar: `../workspace/reports/delivery-reports.md`
> Komutunu bekliyorum.
