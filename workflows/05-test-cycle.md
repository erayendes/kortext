# Test Cycle

Bu akış, `04-development-cycle.md` içindeki `Test` statüsünün nasıl yürütüleceğini tanımlar. Amaç, item'ın `Review` aşamasına geçmeden önce gerekli doğrulama kayıtlarını üretmek ve blokajları doğru ajana geri döndürmektir.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Item dosyası `Test` statüsünde olmalı ve PR/CI çıktıları hazır bulunmalıdır.
- **Girdi:** Item dosyası, acceptance criteria, review gates, PR ve CI kanıtları.
- **Çıkış:** `../workspace/reports/test-reports.md` içinde doğrulama kaydı ve item için `In Progress` veya `Review` kararı.
- **Sonraki akış:** Başarılıysa `04-development-cycle.md` içindeki Final Review adımı; başarısızsa item yeniden assignee ajana döner.

## Otomasyon Çağrıları

> [!TIP] Bu tablo workflow adımlarının hangi script/hook'a bağlandığını gösterir. Tek-kaynak referans: `../settings/INTEGRATION-MAP.md`.

| Adım | Tetikleyici Persona | Script / Hook | Beklenen Çıktı |
|---|---|---|---|
| Test başlangıç (status doğrulama) | Doğrulayan ajan | `scripts/kortext-item-check.py <item>` | Acceptance Criteria + Review Gates kontrolü (read-only) |
| Code review fail | +engineering-manager | `scripts/kortext-item-transition.py <item> --to "In Progress"` | Status `In Progress`, otomatik git commit |
| Code review pass | +engineering-manager | (rapor `../workspace/reports/test-reports.md`'ye yazılır) | Test raporu güncel |
| Quality control gate | +qa-engineer | (gate sonucu test-reports.md) | Gate sonuç kaydı |
| Security check gate | +security-engineer | (gate sonucu test-reports.md + gerekirse security-reports.md) | Gate sonuç kaydı |
| Design review gate | +designer | (gate sonucu test-reports.md) | Gate sonuç kaydı |
| Herhangi gate fail | Gate sahibi ajan | `scripts/kortext-item-transition.py <item> --to "In Progress"` | Status `In Progress`, otomatik git commit |
| Tüm gate'ler pass | Son gate ajanı | `scripts/kortext-item-transition.py <item> --to Review` | Status `Review`, otomatik git commit |

## Genel Prensipler

- Test cycle yalnızca item dosyası `Test` statüsündeyken çalışır.
- Test sonuçlarının ana kaydı `../workspace/reports/test-reports.md` dosyasına yazılır.
- Code review her item için zorunludur.
- `Quality control`, `Security check` ve `Design review` yalnızca item dosyasındaki `Review Gates` içinde işaretliyse çalıştırılır.
- Başarısız doğrulama varsa item `In Progress` yapılır ve assignee ajana geri atanır.
- +prime yalnızca kendisine atanmış kontrol/onay işi olduğunda, büyük/kritik blokajda veya kavşak durumunda bilgilendirilir.

## Girdi

- `../workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md`
- PR linki ve CI çıktıları
- Item dosyasındaki `Acceptance Criteria`
- Item dosyasındaki `Review Gates`
- Gerekli referans dosyaları: `../workspace/references/`

## Test Katmanları

### Local Checks

**Sorumlu:** Assignee ajan

Bu kontroller assignee ajan tarafından PR açılmadan önce tamamlanmış olmalıdır. Test cycle içinde bu kayıtların varlığı kontrol edilir:
- Linting
- Unit tests
- Statik analiz veya type check
- Değişiklik kapsamındaki minimum manuel doğrulama

### Pull Request / CI

**Sorumlu:** +engineering-manager

PR açıldığında aşağıdaki kontroller incelenir:
- Build sonucu
- Unit/integration test sonucu
- CI logları
- Kodun referans dosyalarına ve proje standartlarına uygunluğu

### Review Gates

| Gate | Sorumlu | Çıktı |
|---|---|---|
| Code review | +engineering-manager | `../workspace/reports/test-reports.md` |
| Quality control | +qa-engineer | `../workspace/reports/test-reports.md` |
| Security check | +security-engineer | `../workspace/reports/test-reports.md` |
| Design review | +designer | `../workspace/reports/test-reports.md` |

> [!NOTE]
> `Security check` sonucunda ayrıntılı güvenlik kaydı gerekiyorsa ek detay `../workspace/reports/security-reports.md` dosyasına yazılır. Ana geçiş kararı yine `../workspace/reports/test-reports.md` içinde özetlenir.

## Akış

1. Item dosyasının `Status` alanının `Test` olduğunu doğrula.
2. Item dosyasındaki `Acceptance Criteria` maddelerini oku.
3. Item dosyasındaki `Review Gates` maddelerini oku.
4. PR ve CI sonuçlarını incele.
5. Code review sonucunu `../workspace/reports/test-reports.md` dosyasına yaz.
6. Code review başarısızsa `../scripts/kortext-item-transition.py` aracıyla item'ı `In Progress` yap ve assignee ajana geri ata.
7. Code review başarılıysa işaretli `Quality control`, `Security check` ve `Design review` gate'leri ilgili ajanlara yönlendir.
8. Code review sonrası gate'ler birbirinden bağımsızsa paralel yürütülebilir.
9. Her gate sonucu `../workspace/reports/test-reports.md` dosyasına yazılır.
10. Herhangi bir gate başarısızsa:
   - `../scripts/kortext-item-transition.py` aracıyla item dosyasını `In Progress` yap.
   - Hata listesini item dosyasındaki `Work Log` veya `Notes` alanına ekle.
   - Item'ı assignee ajana geri ata.
11. Tüm zorunlu kontroller geçerse `../scripts/kortext-item-transition.py` aracıyla item dosyasını `Review` statüsüne taşı.
12. `../workspace/memory/context/[agent-name]-active.md` dosyasını ilgili doğrulama ajanı günceller.

## Blokaj Kuralı

Normal test hataları +prime'a bildirilmez. Ajanlar arası düzeltme döngüsü içinde çözülür.

+prime'a yalnızca şu durumlarda bildirim verilir:
- Blokaj item kapsamını değiştiriyorsa.
- Çözüm için birden fazla yol varsa ve karar gerekiyorsa.
- Risk büyük/kritik olarak işaretlendiyse.
- Final Review veya özel onay +prime'a atanmışsa.

## Bildirim

Normal test fail için bildirim gönderme. Item `In Progress` yapılır, assignee ajana geri atanır ve detaylar `../workspace/reports/test-reports.md` içine yazılır.

Duruma göre yalnızca ilgili bildirimi gönder:

> [!NOTE] TEST BLOKAJI
> +prime,
> `../workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md` test aşamasında karar gerektiren blokaja girdi.
> Rapor: `../workspace/reports/test-reports.md`
> Karar: [kısa karar konusu]
> Komutunu bekliyorum.

> [!NOTE] PRIME KONTROLÜ BEKLENİYOR
> +prime,
> `../workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md` için test kontrolü sana atandı.
> Rapor: `../workspace/reports/test-reports.md`
> Doğruysa onayını bekliyorum.
