# AGENTS.md — Devir Anayasası (Kortext v1.0)

> Bu proje **Kortext** ile analiz edildi: brief'ten yola çıkan tüm analiz belgeleri üretildi,
> +prime (insan) tek tek onayladı ve Kortext görevini tamamlayıp çekildi. Bu dosya, bundan
> sonraki geliştirme ilişkisinin anayasasıdır — projede çalışan HER ajan buna uyar.

## 1. Kutsal guideline — `.kortext/`

Kararlarını koddan tahmin ederek değil, buradan okuyarak ver:

- **Kök** (`.kortext/*.md`) — *canlı çekirdek, günlük başvurun*:
  `ARCHITECTURE` (sistemin biçimi) · `STACK` (teknoloji + araçlar) · `STRUCTURE`
  (standartlar + klasörler + terminoloji) · `API` · `DATABASE` · `SECURITY` · `DESIGN` ·
  `TEST` · `LEGAL` · `GROWTH` · `CONTENT` · `ENVIRONMENT` — kod ve içerik üretirken bunlara uy.
  `status: not-applicable` olan dosya bu proje için bilinçli olarak boş bırakılmıştır.
- **`foundation/`** — *donmuş başlangıç*: `BRD` (brief), `PRD`, `TRD`, `PFD`. Bağlam
  gerektiğinde oku; keyfince değiştirme.
- **`DECISIONS.md`** — karar günlüğü (aşağıda §3).
- **`.kopeng/`** (varsa) — görev yapısı: Version → Epic → Task dosyaları. Görev takibi
  Kopeng'in işidir; kuruluysa sıradaki işini oradan al, durumunu orada güncelle.

## 2. Çalışma kuralları

- **Belgeye uy, uymuyorsan belgeyi güncelle.** Bir kararın guideline'la çeliştiğini
  görürsen sessizce sapma: ya karara uy, ya +prime'la konuşup İLGİLİ BELGEYİ de güncelle
  (değişikliği DECISIONS.md'ye yaz). Belge ile kod birbirinden kopmasın — bu proje
  hafızasının bütün değeri budur.
- **Görevler:** `.kopeng/` varsa oradan yürü. Yoksa +prime'ın talimatıyla çalış; isterse
  işi önce görevlere bölüp listeyi göster.
- **+prime'a düşen işler** (hesap açma, API key, satın alma, onay): sen yapamazsın —
  bildir, bekleme yaratıyorsa görünür kıl.

## 3. Karar günlüğü — DECISIONS.md

Sürece yön veren her kararı (teknik/ürün/tasarım/güvenlik) **verildiği anda**
`.kortext/DECISIONS.md`'nin EN ÜSTÜNE ekle; eskiler silinmez:

```
## YYYY-MM-DD — [karar başlığı]
[Tek paragraf: gerekçe; varsa elenen alternatif ve neden.]
```

Sonraki oturum (ya da başka bir ajan) "neden böyle" sorusunun cevabını buradan okur.
**Read-before-Write:** paylaşılan dosyaya yazmadan önce güncel halini oku.

## 4. Davranış anayasası (öz)

- **Dil:** +prime ile iletişim +prime'ın dilinde; kod, commit, değişken, yorum İngilizce;
  ürün-içi metin hedef proje dilinde.
- **Secrets:** API anahtarı/şifre/token asla koda, belgeye, şablona yazılmaz — yalnız `.env`
  (repo dışı) + anahtar isimleri `.env.example`'da. Sızıntı fark edersen: durdur, +prime'a
  bildir, anahtarın iptalini öner; git geçmişi temizliği +prime kararıdır.
- **Tıkanma (3-deneme kuralı):** aynı engelde 3 farklı yöntem başarısızsa DUR; denemeleri
  ve önerini DECISIONS.md'ye not düş, +prime'a sor. Sessiz workaround'la ilerleme.
- **Çelişki:** belgeler arası çelişki görürsen üretimi durdur, +prime'a sor; sessizce seçme.
- **Test disiplini:** TEST.md'deki kalite çıtasına uy; "bitti" demek oradaki ölçütleri
  karşılamak demektir.
