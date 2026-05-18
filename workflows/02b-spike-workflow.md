# Spike Workflow (`!start spike`)

Bu akış, bir geliştirme görevine başlamadan önce "acaba bu teknik çözüm işe yarar mı?" sorusunu yanıtlamak için kullanılır. Time-boxed bir araştırma/deneme sürecidir. Sprint kapsamını değiştirmez; çıktısı ya bir `decisions.md` ADR kaydı ya da yeni bir backlog Task item'ıdır.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Bir görevi planlamadan veya başlatmadan önce teknik belirsizlik varsa ve bunu çözmek için araştırma/deneme gerekiyorsa.
- **Girdi:** +prime veya +engineering-manager'dan gelen spike konusu ve time-box süresi.
- **Çıktı:** `workspace/memory/decisions.md` içinde ADR kaydı **veya** yeni backlog Task item (kapsam netleştiyse).
- **Sonraki akış:** ADR onaylandıktan sonra `04-development-cycle.md`; kapsam belirsizleştiyse `02-planning-pipeline.md`.

> [!NOTE]
> Spike bir özellik değildir. Kod yazılabilir ama o kod production'a gitmez. Öğrenim hedeftir, çıktı değil.

## Time-Box Kuralı

Spike başlamadan önce süre netleştirilir. Süre aşıldığında devam edilmez; mevcut öğrenimle karar alınır.

| Spike Türü | Önerilen Süre | Uzatma |
|---|---|---|
| Kısa araştırma (API inceleme, dokümantasyon okuma) | 2 saat | Yok |
| Teknik PoC (küçük deneme kodu) | 4-8 saat | +prime onayıyla bir kez |
| Kapsamlı mimari araştırma | 1 gün | +prime onayıyla |

## Akış

### 1. Spike Tanımı

**Sorumlu:** +engineering-manager (teknik spikeler), +product-manager (ürün spikeler)

1. Spike konusunu ve sorusunu netleştir:
   - **Hipotez:** "X yöntemi ile Y sorunu çözülebilir."
   - **Başarı kriteri:** "Bunu doğrulamak için ne görmeliyim?"
   - **Time-box:** Kaç saat/gün?
2. `workspace/memory/context/[agent-name]-active.md` dosyasını oluştur.
3. +prime'a bildir:

> [!NOTE] SPİKE BAŞLIYOR
> +prime,
> **Konu:** [spike sorusu]
> **Hipotez:** [X yöntemiyle Y çözülebilir]
> **Time-box:** [süre]
> Başlıyorum.

---

### 2. Araştırma / Deneme

**Sorumlu:** İlgili ajan (+engineering-manager, +backend-developer, vb.)

1. Hipotezi test et:
   - Dokümantasyon ve kaynak tara.
   - Gerekirse küçük bir PoC (Proof of Concept) yaz — `workspace/archive/spike-[konu]/` dizinine kaydet.
2. Bulguları not al:
   - Hipotez doğrulandı mı?
   - Beklenmedik kısıtlamalar var mı?
   - Hangi alternatif yollar keşfedildi?
3. Time-box dolmadan sonuca ulaşılırsa ilerle; doluyorsa mevcut bilgiyle karar al.

> [!WARNING]
> Time-box dolduğunda "biraz daha araştırayım" deme. Durumu +prime'a bildir ve mevcut öğrenimle karar al.

---

### 3. Karar ve Çıktı

**Sorumlu:** +engineering-manager

Spike tamamlandığında iki seçenek:

| Durum | Aksiyon |
|---|---|
| Hipotez doğrulandı, yol netleşti | `workspace/memory/decisions.md`'ye ADR yaz → `04-development-cycle.md` |
| Kapsam belirsizleşti veya yeni Task gerekli | `kortext-backlog-add.py` ile Task aç → `02-planning-pipeline.md` |
| Hipotez reddedildi, alternatif yol gerekli | +prime'a sun, karar bekle |

---

### 4. ADR Formatı (Spike Çıktısı)

`workspace/memory/decisions.md` içine şu formatta eklenir:

```md
## [YYYY-MM-DD] — Spike: [konu-başlığı]

**Soru:** [Araştırılan teknik soru]
**Hipotez:** [Test edilen hipotez]
**Time-box:** [harcanan süre]

### Bulgular
[Ne öğrenildi? Kısa maddeler halinde]

### Karar
[Hipotez doğrulandı / reddedildi / kısmen doğrulandı]
**Seçilen yol:** [hangi yaklaşım benimseniyor]
**Red edilen yol:** [hangi alternatif neden reddedildi]

### Sonraki Adım
[Backlog Task ID veya "ADR geçerli, geliştirme başlayabilir"]
```

---

## Bildirim

> [!NOTE] SPİKE TAMAMLANDI
> +prime,
> **Konu:** [spike sorusu]
> **Süre:** [harcanan süre / time-box]
> **Sonuç:** [Doğrulandı / Reddedildi / Kısmen]
> **Karar:** [decisions.md kaydı veya yeni Task ID]
> Devam için onayını bekliyorum.

> [!NOTE] SPİKE TIME-BOX DOLDU
> +prime,
> **Konu:** [spike sorusu]
> **Durum:** Time-box doldu. Sonuca ulaşılamadı.
> **Mevcut bulgular:** [kısa özet]
> **Seçenekler:** [a) daha fazla araştırma — ek süre / b) mevcut bilgiyle karar al / c) iptal]
> Komutunu bekliyorum.
