# Rollback Pipeline

Bu akış, production deployment sonrası kritik hata tespit edildiğinde sistemi son kararlı sürüme güvenli şekilde döndürmek için kullanılır.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Production sonrası kritik eşiklerden en az biri aşılmış olmalıdır.
- **Girdi:** Delivery kayıtları, monitoring sinyalleri, smoke test sonucu ve son kararlı artifact bilgisi.
- **Çıkış:** Güvenli geri dönüş, blocked release kaydı, learned kaydı ve ilgili Bug item.
- **Sonraki akış:** Sorun sürüyorsa `08-hotfix-pipeline.md`; kalıcı düzeltme gerekiyorsa `04-development-cycle.md`.

**Sorumlu:** +devops-engineer teknik yürütmeden, +operation-manager kriz koordinasyonundan sorumludur.

## Rollback Kararı

+devops-engineer aşağıdaki eşiklerden biri aşıldığında rollback kararını başlatır:

| Tetikleyici | Eşik |
|---|---|
| Hata oranı (5xx) | Deployment öncesine göre %5'in üzerine çıktı |
| Response time (p95) | 2 katına çıktı veya SLA limitini aştı |
| Kritik iş akışı | Login, ödeme veya veri kaydı tamamen bozuldu |
| Monitoring alarmı | Deployment sonrası otomatik alert tetiklendi |
| Post-deploy smoke test | Herhangi bir kritik test başarısız oldu |

**Karar yetki sırası:** +devops-engineer -> +operation-manager -> +prime

P0 durumda +devops-engineer +prime onayını beklemeksizin rollback'i başlatabilir; +prime onayı eş zamanlı alınır.

## Triage

Rollback kararından önce veya P0 durumda rollback başlatılırken en fazla 5 dakika içinde şunlar belirlenir:

- [ ] Hatanın kaynağı bu deployment mı, yoksa bağımlı bir servis mi?
- [ ] DB migration uygulandı mı?
- [ ] Rollback'in kendisi veri kaybına yol açar mı?
- [ ] Hotfix daha hızlı ve daha güvenli çözüm mü? Bkz. `08-hotfix-pipeline.md`.

DB migration uygulandıysa ve geri alınamaz türdeyse rollback durdurulur; +prime kararı olmadan devam edilmez.

## Kullanıcı Bildirimi

**Sorumlu:** +operation-manager, +copywriter

P0/P1 etkisi varsa teknik adımlar ile paralel olarak kullanıcı iletişimi hazırlanır:
- Etkilenen kullanıcılara durum sayfası, e-posta veya in-app bildirim hazırlanır.
- Dış iletişim yalnızca +prime onayıyla yayınlanır.
- Mesaj kısa, durumu kabul eden ve çözümün sürdüğünü belirten formatta olur.

## Kod Rollback

**Sorumlu:** +devops-engineer

- `main` geçmişi bozulmaz.
- Force push yapılmaz.
- `git reset --hard` kullanılmaz.
- Hatalı merge veya commit revert edilir.
- Geri dönüş yapılacak son kararlı tag/artifact `../workspace/reports/delivery-reports.md` içinden doğrulanır.
- Merge commit revert edilecekse parent seçimi doğrulanır; emin olunmadan revert yapılmaz.
- Birden fazla commit geri alınacaksa revert sırası ve etki alanı `../workspace/reports/delivery-reports.md` içinde kaydedilir.
- Kod rollback PR veya emergency change olarak izlenebilir olmalıdır; yapılan işlem audit trail bırakmalıdır.

> [!WARNING]
> `main` geçmişini değiştiren destructive git komutları yasaktır. Rollback için revert veya platformun güvenli rollback mekanizması kullanılır.

## DB Migration Rollback

**Sorumlu:** +db-admin

DB migration uygulandıysa rollback öncesinde şunlar yapılır:

1. Deployment öncesi snapshot/dump erişilebilir mi doğrula.
2. Migration için geri alma yolu var mı doğrula.
3. Geri alma yolu yoksa migration irreversible kabul edilir.
4. Irreversible migration varsa +prime kararı olmadan rollback devam etmez; hotfix değerlendirilir.
5. Geri alma uygulanırsa migration öncesi ve sonrası kritik tablo/kayıt kontrolleri yapılır.
6. Veri kaybı riski veya müşteri etkisi varsa +operation-manager ve +prime bilgilendirilir.
7. DB rollback sonucu `../workspace/reports/delivery-reports.md` dosyasına yazılır.

## Deployment Rollback

**Sorumlu:** +devops-engineer

1. Rollback stratejisi `../workspace/reports/delivery-reports.md` içindeki deployment stratejisine göre seçilir.
2. Önceki başarılı artifact/image/tag doğrulanır.
3. Proje-spesifik rollback komutu CI/CD yapılandırması veya proje dokümantasyonundan alınır.
4. Platform rollback'i tamamlanana kadar deployment izlenir.
5. Rollback sırasında kullanılan artifact/tag, ortam, başlangıç/bitiş zamanı ve operatör `../workspace/reports/delivery-reports.md` dosyasına yazılır.

## Post-Rollback Doğrulama

**Sorumlu:** +qa-engineer, +devops-engineer

Rollback tamamlandıktan sonra production üzerinde smoke test yapılır:

- [ ] Ana sayfa ve kritik sayfalar yükleniyor
- [ ] Kullanıcı login/logout akışı çalışıyor
- [ ] Veri okuma işlemleri başarılı
- [ ] Veri yazma işlemleri başarılı
- [ ] Ödeme veya kritik iş akışı tamamlanabilir durumda
- [ ] API endpoint'leri 200 dönüyor
- [ ] Hata oranı rollback öncesi seviyeye indi
- [ ] Response time normale döndü
- [ ] DB migration revert başarıyla uygulandı veya gerekli değil

15 dakika boyunca monitoring dashboard izlenir. Hata oranı düşmüyorsa +operation-manager escalation başlatır ve +prime bilgilendirilir.

Doğrulama sonucu `../workspace/reports/test-reports.md` içine yeni kayıt olarak eklenir. Rollback başarılı sayılmadan önce smoke test sonucu `PASS` olmalıdır.

## Hatalı Sürümü Dondur

**Sorumlu:** +devops-engineer

Hatalı release tekrar deploy edilmesin diye sürüm `../workspace/reports/delivery-reports.md` içinde `blocked release` olarak işaretlenir.

Git tag veya registry işaretleme gerekiyorsa proje-spesifik güvenli yöntem kullanılır; force push veya history rewrite yapılmaz.

`blocked release` kaydında en az şu bilgiler olmalıdır:
- Hatalı sürüm veya artifact
- Bloklama sebebi
- Rollback zamanı
- İlgili Bug item
- Tekrar deploy için gereken koşul

## Kök Neden Analizi

**Sorumlu:** +devops-engineer koordinasyonunda ilgili geliştirici ajan

Rollback başarıyla tamamlandıktan sonra `../workspace/memory/learned.md` dosyasına yeni kayıt eklenir:

```md
## [YYYY-MM-DD] - Rollback: v[A.B.C] -> v[A.B.X]

**Tetikleyici:** [Hangi eşik aşıldı?]
**Tespit Süresi:** [Deploy zamanı] -> [Rollback kararı]
**Toplam Etki Süresi:** [Kullanıcıların etkilendiği süre]

### Kök Neden
[Hangi değişiklik hataya yol açtı?]

### Tespit
[Hata nasıl ve kim tarafından fark edildi?]

### Rollback Kararı
[Hotfix neden seçilmedi? Rollback'in gerekçesi neydi?]

### Önlem
[Bu hatanın staging'de yakalanması için ne yapılmalıydı?]
```

## Raporlama ve Backlog

| Dosya | Sorumlu | İçerik |
|---|---|---|
| `../workspace/reports/delivery-reports.md` | +devops-engineer | Rollback zamanı, sürümler, etki özeti, blocked release |
| `../workspace/memory/learned.md` | İlgili geliştirici ajan | Post-mortem kaydı |
| `../workspace/memory/backlog/BXX-[bug-name].md` | +engineering-manager | Rollback'e neden olan hata için Bug item |
| `../workspace/memory/backlog/epic-dashboard.md` | +engineering-manager | Bug ilgili Epic ile ilişkilendirilir |
| `../workspace/memory/context/[agent-name]-active.md` | +operation-manager | Aktif rollback kaydı kapatılır |

Rollback tamamlandıktan sonra hata normal geliştirme döngüsüne (`04-development-cycle.md`) alınır. P0/P1 etki devam ediyorsa `08-hotfix-pipeline.md` değerlendirilir.

Bug item oluşturulurken:
- `Status` değeri `To Do` olmalıdır.
- `Assignee` +engineering-manager tarafından belirlenir.
- `Review Gates` en az `Code review` ve `Quality control` içermelidir.
- Eğer güvenlik veya veri bütünlüğü etkisi varsa `Security check` de eklenir.
- Hata `../workspace/memory/backlog/epic-dashboard.md` dosyasında ilgili Epic satırıyla ilişkilendirilir.

## Bildirim

Duruma göre yalnızca ilgili bildirimi gönder.

> [!NOTE] ROLLBACK BAŞLADI
> +prime,
> `[project-name]` v[A.B.C] için rollback başlatıldı.
> Sebep: [kısa sebep]
> Etki: [P0/P1/P2]
> Detaylar: `../workspace/reports/delivery-reports.md`

> [!NOTE] HOTFIX KARARI BEKLENİYOR
> +prime,
> `[project-name]` v[A.B.C] rollback öncesinde karar gerektiriyor.
> Sebep: [irreversible migration / hotfix daha güvenli / veri kaybı riski]
> Seçenekler: [rollback / hotfix / bekle]
> Komutunu bekliyorum.

> [!NOTE] ROLLBACK TAMAMLANDI
> +prime,
> `[project-name]` v[A.B.C] sürümünden son kararlı sürüme geri dönüldü.
> Tetikleyici: [hata özeti]
> Toplam etki süresi: [süre]
> DB rollback: [Uygulandı / Uygulanmadı / Gerekli değil]
> Detaylar: `../workspace/reports/delivery-reports.md`
> Kök neden kaydı: `../workspace/memory/learned.md`
> Hata item'ı: `../workspace/memory/backlog/BXX-[bug-name].md`

> [!NOTE] ROLLBACK DURDU
> +prime,
> `[project-name]` v[A.B.C] rollback süreci durduruldu.
> Sebep: [kısa sebep]
> Detaylar: `../workspace/reports/delivery-reports.md`
> Komutunu bekliyorum.
