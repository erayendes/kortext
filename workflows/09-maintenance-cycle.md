# Maintenance Cycle (`!maintenance`)

Bu akış, production'daki sistemin rutin bakımını gerçekleştirir. Sprint başlangıcında veya +prime'ın `!maintenance` komutuyla tetiklenir. Yeni özellik geliştirme içermez; sadece mevcut sistemin sağlığını korumaya yönelik kontroller ve temizlik işlemleri yapılır.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Production deployment'ı tamamlanmış ve sistem çalışır durumda olmalıdır.
- **Girdi:** Aktif `workspace/memory/learned.md`, `workspace/memory/decisions.md`, `workspace/memory/backlog/` ve mevcut bağımlılık listesi.
- **Çıktı:** Güncellenen bağımlılık listesi, temizlenmiş teknik borç listesi, aktif learned.md önerileri ve `workspace/reports/status-reports.md` güncellemesi.
- **Sonraki akış:** Aksiyona alınacak item varsa `04-development-cycle.md`.

## Bakım Kategorileri

Bakım döngüsü dört kategoride kontrol yapar. Her kategori bağımsız yürütülebilir.

---

### Kategori 1 — Bağımlılık Güncelleme Kontrolü

**Sorumlu:** +devops-engineer, +backend-developer, +frontend-developer

1. Projenin `workspace/references/tech-stack.md` dosyasındaki bağımlılıkları kontrol et.
2. Major ve minor güncellemeleri listele; breaking change içerenleri işaretle.
3. Güvenlik açığı bildirilen bağımlılıkları ayrıca listele — bunlar `!maintenance` beklemez, normal döngüde Bug olarak açılmalıdır.
4. Güncelleme kararını `workspace/memory/decisions.md`'ye kaydet:
   - Hangi bağımlılıklar güncellenecek?
   - Hangilerinin güncellenmesi erteleniyor ve neden?
5. Güncelleme kapsam dışıysa backlog'a Debt item aç.

> [!TIP]
> Major version güncellemesi daima breaking change riski taşır. Staging ortamında test edilmeden production'a taşıma.

---

### Kategori 2 — Teknik Borç Gözden Geçirmesi

**Sorumlu:** +engineering-manager

1. `workspace/memory/backlog/debt-dashboard.md` içindeki tüm Debt item'larını gözden geçir.
2. Her item için şunu değerlendir:
   - Hala geçerli mi?
   - Önceliği değişti mi?
   - Bir sonraki döngüde yapılabilir mi?
3. Kapatılabilecek (artık geçersiz) Debt item'larını Done yap ve kapat.
4. Yeni tespit edilen teknik borçları `kortext-backlog-add.py --type debt` ile ekle.
5. Öncelikleri `workspace/reports/status-reports.md`'ye yansıt.

---

### Kategori 3 — Learned.md Gözden Geçirmesi

**Sorumlu:** +operation-manager, +engineering-manager

Bu aşama sistemin hafızasını aktif hale getirir.

1. `workspace/memory/learned.md` dosyasını oku.
2. Son 30 gün içindeki kayıtları gözden geçir.
3. Her kayıt için sor:
   - Bu dersden alınan önlem uygulandı mı?
   - Eğer uygulanmadıysa neden? Backlog Debt item açılmalı mı?
4. Aksiyona alınan dersler için `workspace/memory/learned.md` dosyasında ilgili kayda not ekle:
   ```
   **Aksiyon:** [alınan önlem / açılan Debt ID]
   ```

---

### Kategori 4 — Sistem Sağlık Kontrolü

**Sorumlu:** +devops-engineer, +qa-engineer

1. Kortext backlog sağlık raporunu çalıştır:
   ```
   python scripts/kortext-backlog-health.py
   ```
2. Context tutarlılığını kontrol et:
   ```
   python scripts/kortext-context-check.py
   ```
3. Monitoring dashboard'larını kontrol et:
   - Hata oranı (5xx) son hafta trend?
   - Response time (p95) SLA dahilinde mi?
   - Disk/bellek kullanımı normal seviyelerde mi?
4. Sonuçları `workspace/reports/delivery-reports.md` dosyasına yaz.

---

### Kategori 5 — Güvenlik Taraması

**Sorumlu:** +security-engineer

1. Bağımlılıklarda bilinen güvenlik açığı var mı kontrol et.
2. `workspace/references/security-rules.md` güncel mi kontrol et.
3. Secrets scanning altyapısının hala çalıştığını doğrula (pre-commit hook, CI pipeline).
4. Tespit edilen güvenlik açıkları varsa hemen Bug item aç — `!maintenance` tamamlanmasını bekleme.
5. Sonucu `workspace/reports/security-reports.md` dosyasına yaz.

---

## Raporlama

| Dosya | Sorumlu | İçerik |
|---|---|---|
| `workspace/reports/status-reports.md` | +operation-manager | Bakım özeti: tamamlanan, ertelenen, yeni açılan itemlar |
| `workspace/memory/decisions.md` | +engineering-manager | Bağımlılık güncelleme ve borç önceliklendirme kararları |
| `workspace/reports/security-reports.md` | +security-engineer | Güvenlik taraması sonucu |
| `workspace/reports/delivery-reports.md` | +devops-engineer | Sistem sağlık metrikleri |

---

## Bildirim

> [!NOTE] BAKIM BAŞLADI
> +prime,
> Rutin bakım döngüsü başladı.
> Kategoriler: Bağımlılık | Teknik Borç | Learned | Sistem Sağlık | Güvenlik
> Tamamlandığında rapor sunulacak.

> [!NOTE] BAKIM TAMAMLANDI
> +prime,
> Rutin bakım tamamlandı.
> **Güncellenen bağımlılıklar:** [sayı]
> **Kapatılan borçlar:** [sayı]
> **Yeni açılan itemlar:** [sayı]
> **Güvenlik:** [Temiz / X açık tespit edildi]
> Detaylar: `workspace/reports/status-reports.md`
> Komutunu bekliyorum.

> [!NOTE] BAKIM BLOKLANDI
> +prime,
> Bakım döngüsünde karar gerektiren durum tespit edildi.
> **Konu:** [kısa açıklama]
> Komutunu bekliyorum.
