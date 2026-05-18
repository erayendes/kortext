# Acil Durum Prosedürleri

Sistemin kararlılığını veya güvenliğini tehdit eden durumlarda uygulanacak prosedürler.

## Kritik Hata Tanımları

Aşağıdaki durumlar "Acil Durum" olarak kabul edilir:

- **Sonsuz Döngü:** Bir görevin belirlenen adım sayısını (Loop Protection (4-Step Rule) — bkz. `rules/behavior.md`) aşması ve ilerleme kaydetmemesi.
- **API Kesintisi:** Kritik bir servisin (LLM, Veritabanı vb.) retry ve fallback mekanizmaları tükendikten sonra da hata vermeye devam etmesi (bkz. Self-Healing Protocol).
- **Yetki İhlali:** Bir personanın yetkisi olmayan bir dosyayı değiştirmeye çalışması.
- **Veri Kaybı Riski:** Yanlışlıkla silme veya üzerine yazma girişimi tespiti.
- **Yazma Çakışması:** İki ajanın Distributed Context kuralına uymayıp aynı dosyayı eş zamanlı güncellediğinin tespiti.

## Severity Seviyeleri

| Seviye | Kriter | Beklenen Aksiyon |
| :--- | :--- | :--- |
| `P0` | Sistem tamamen çöktü, tüm kullanıcılar etkileniyor veya veri kaybı riski var | Güvenli rollback veya hotfix hemen başlatılır; +prime eş zamanlı bilgilendirilir |
| `P1` | Temel iş akışı bozuldu veya büyük kullanıcı grubu etkileniyor | Rollback/hotfix kararı hızlıca alınır; +prime bilgilendirilir |
| `P2` | Sınırlı etki var, workaround mevcut veya kullanıcı etkisi düşük | Normal geliştirme döngüsüne alınabilir; gerekirse +prime kararı istenir |

## Production Acil Durum Kararı

Production ortamında kritik hata tespit edilirse aşağıdaki karar kuralı uygulanır:

| Durum | Akış |
| :--- | :--- |
| Son deployment kaynaklı ve güvenli şekilde geri alınabilir | `workflows/07-rollback-pipeline.md` |
| Rollback veri kaybı, irreversible migration veya daha büyük risk doğuruyorsa | `workflows/08-hotfix-pipeline.md` |
| Hata eski sürümde de vardı veya izole bir modülde hızlı düzeltilebilir | `workflows/08-hotfix-pipeline.md` |
| Etki sınırlı ve workaround varsa | `workflows/04-development-cycle.md` içinde Bug/Debt olarak planlanır |

P0 durumda +devops-engineer veya ilgili sorumlu ajan +prime onayını beklemeden güvenli rollback/hotfix hazırlığını başlatabilir. +prime bilgilendirmesi eş zamanlı yapılır.

## Self-Healing Protocol

Sistem kesintilerinde ajan aşağıdaki adımları sırayla uygular. Adım tükenmeden bir sonraki aşamaya geçilmez.

### API / LLM Kesintisi

| Adım | Eylem | Bekleme |
|---|---|---|
| **1. Retry** | Aynı model ile isteği tekrarla | 5 sn |
| **2. Retry** | İkinci deneme | 15 sn |
| **3. Retry** | Üçüncü deneme | 30 sn |
| **4. Fallback** | `rules/models.md` → Fallback modele geç, isteği tekrarla | — |
| **5. Fallback Retry** | Fallback model ile ikinci deneme | 15 sn |
| **6. HALT** | Tüm denemeler başarısız → işlemi durdur, eskalasyon başlat | — |

> Fallback model `deep-research` görevde devreye girerse sonuç kalitesi düşebilir. Bu riski eskalasyon mesajında +prime'a bildir.

### Git Komut Hataları

| Adım | Eylem | Bekleme |
|---|---|---|
| **1. Retry** | Aynı komutu tekrar çalıştır | 3 sn |
| **2. Retry** | İkinci deneme | 10 sn |
| **3. Diagnose** | `git status` çalıştır; durumu `workspace/memory/context/[agent-name]-active.md` dosyasına yaz | — |
| **4. Blocked** | Komutu ve çıktısını kaydet; görevi `Blocked` yap; +devops-engineer'a eskalasyon | — |

**Kategori bazlı yönlendirme:**
- **Network / auth hatası** (403, 401, SSH): +devops-engineer → credentials kontrol
- **Merge conflict**: +devops-engineer → `07-rollback-pipeline.md`'ye bak, çözülmezse +engineering-manager
- **Permission denied**: +prime → repo access kontrol
- **Repository corrupt / object hatası**: +devops-engineer → +prime

> [!WARNING]
> `main` branch'te hiçbir git komutu self-healing kapsamında çalıştırılmaz. Force push ve reset --hard kesinlikle yasaktır.

### CI/CD Pipeline Hataları

| Adım | Eylem | Bekleme |
|---|---|---|
| **1. Log Oku** | Pipeline logunu oku, hata kategorisini belirle | — |
| **2. Kategorize** | Tablo aşağıda — kategoriye göre sorumlu ajan belirlenir | — |
| **3. Notify** | Sorumlu ajana hata kategorisini ve log referansını ilet | — |
| **4. Blocked** | Sorumlu ajan 3 deneme içinde çözemezse görevi `Blocked` yap; +operation-manager'a eskalasyon | — |

**Hata kategorileri:**

| Hata Türü | İlk Sorumlu | Aksiyon |
|---|---|---|
| Test fail (unit/integration) | +qa-engineer | Test kodunu incele, düzelt |
| Build fail (syntax/compile) | İlgili geliştirici ajan | Kodu incele, düzelt |
| Environment/env var eksik | +devops-engineer | `.env.example` kontrol, +prime'a eksik key sor |
| Docker/container hatası | +devops-engineer | Image ve Dockerfile incele |
| Secrets scan fail | +security-engineer | Sızdırılan key tespit, acil eskalasyon |
| Timeout | +devops-engineer | Kaynak kullanımı ve pipeline konfigürasyonunu kontrol et |



1. Ardışık 3 hata → servisi devre dışı kabul et.
2. İlgili görev dosyasını (`workspace/memory/backlog/[TXX|BXX|DXX]-[item-name].md`) **Blocked** olarak işaretle; blocker nedenini yaz.
3. +operation-manager'a eskalasyon başlat.
4. +operation-manager koordinasyonunda ilgili manager geçici çözüm (mock, stub, fallback servis veya bekleme) kararını verene kadar bekle.

## Eskalasyon Zinciri

Bir acil durum tespit edildiğinde aşağıdaki zincir takip edilir:

1. **Durdur:** İşlemi derhal durdur.
2. **Raporla:** Hatayı ve bağlamı ilgili yöneticiye bildir.
3. **Bekle:** Yöneticinin talimatı gelene kadar yeni işlem başlatma.

**Eskalasyon Sırası:**
- Geliştirici personalar → +engineering-manager veya +product-manager (ilgili alana göre)
- Manager personalar → +operation-manager
- +operation-manager → +prime

## Kullanıcı Bildirimi Protokolü

P0/P1 sınıfındaki bir acil durumda (production kesintisi, veri kaybı riski) son kullanıcıların bilgilendirilmesi zorunludur. Bu karar +prime'a aittir; ajan sadece hazırlığı yapar.

**Sorumluluk:** +operation-manager bildirimi hazırlar, +prime onaylar ve gönderir.

**Bildirim Şablonu:**
```
[Hizmet Adı] — Teknik Kesinti Bildirimi
Tarih / Saat: [UTC+3]

Etkilenen özellik: [kısa açıklama]
Beklenen etki: [kullanıcılar hangi işlemleri yapamıyor?]
Tahmini çözüm süresi: [X dakika / saat]

Çözüm tamamlandığında ikinci bir bildirim gönderilecektir.
```

**Çözüm Sonrası Bildirim:**
```
[Hizmet Adı] — Hizmet Normalüne Döndü
Kesinti süresi: [başlangıç] → [bitiş] ([X dakika])
Etkilenen alan: [kısa açıklama]
Alınan önlem: [kısa teknik not]
```

## Acil Durum Sonrası

- Olay ilgili manager persona tarafından `workspace/memory/learned.md` dosyasına kaydedilir:
	- Ne oldu?
	- Neden oldu?
	- Nasıl çözüldü?
	- Tekrarını önlemek için ne yapılmalı?
- Manager persona +prime için `workspace/reports/status-reports.md` dosyasını hazırlar.

## Bildirim

Yukarıdaki adımlar tamamlandığında bildir. 

```
---
ACİL DURUM PROTOKOLÜ UYGULANDI
+prime, [sebep] sebebiyle acil durum protokolüne geçildi.
Durum: [başladı / devam ediyor / çözüldü]
Durum raporu: workspace/reports/status-reports.md
Komutunu bekliyorum.
---
```

P0 dışındaki durumlarda komut gelene kadar hazırda bekle ve kuralları koru. P0 durumda güvenli rollback/hotfix hazırlığı durdurulmaz; +prime eş zamanlı bilgilendirilir.
