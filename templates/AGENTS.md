# AGENTS.md — Kortext devir sözleşmesi (v1.0)

> **Bu dosyayı ilk sen okursun.** Kortext bu projenin **analiz + planlamasını** bitirdi
> ve tüm kaynak gerçeği (`source of truth`) `.kortext/` içine yazdı. Kortext **geliştirmeyi
> kendisi yürütmez** — onu **sen** (hangi model olursan ol) yaparsın. Kortext yalnızca
> görev durumunu gösterir ve takip eder.

## Nereden başlarsın

1. **`.kortext/memory/handover.md`** — önceki oturum nerede kaldı, ne yarım kaldı, sıradaki dikkat noktası. Önce bunu oku (varsa).
2. **`.kortext/memory/TODO.md`** — tek canlı görev listesi (version → epic → task, checkbox'lı). İşaretsiz (`- [ ]`) ilk uygun görev senin sıradaki işin.
3. Görevin bağlamı için ilgili **foundation + references** dosyalarını oku (aşağıda).

## Her zaman uyacağın kaynaklar

- **`.kortext/foundation/`** — *ne yapılacak*: `BRD, PRD, TRD, PFD`. Analizden sonra **dondu**; değiştirme, yalnız oku. `PFD.md` north-star.
- **`.kortext/references/`** — *nasıl davranılacak* (ALL-CAPS canlı kurallar): `ACCESS, API, CONTENT, DATABASE, DESIGN, ENVIRONMENT, GLOSSARY, GROWTH, LEGAL, SECURITY, STACK, STRUCTURE, TEST`. Bunlar projenin değişmez davranış kuralları — kod yazarken bunlara uy (örn. `STACK.md` teknoloji seçimini, `DESIGN.md` tasarım kurallarını, `SECURITY.md` güvenlik şartlarını belirler). `status: uninitialized` olan bir dosya o proje için geçerli değildir, atla.

## Çalışma döngüsü (sözleşme)

Her görev için:

1. **Seç** — TODO.md'den sıradaki işaretsiz görevi al. **Sıraya uy**: bir görev kendinden önce gelenler bitmeden başlamamalı (liste bağımlılık sırasındadır).
2. **Yap** — işi references'a uyarak tamamla.
3. **İşaretle** — bitince TODO.md'de o satırı `- [ ]` → `- [x]` yap. (Dashboard bunu otomatik gösterir.)
4. **Kaydet** — *üret + KAYDET*, yoksa boşlukta kaybolur:
   - `.kortext/memory/decisions.md` — önemli bir karar verdiysen tek satır + kısa gerekçe (üstüne ekle, silme).
   - `.kortext/memory/learned.md` — bir ders çıktıysa ekle.
   - `.kortext/memory/handover.md` — **şu an neredeyim / ne yaptım / hangi dosyalara dokundum / sıradaki ne** — bir sonraki oturum buradan devam eder.

## Boşluk sonrası devam (resume)

Yeni bir oturuma başladığında **önce handover.md + TODO.md oku**. Görev ortasında bırakıldıysa, handover.md'deki serbest-metin "nerede kaldım" notu yarım işi kaldığın yerden sürdürmeni sağlar. Kaldığın yeri yazmamak en sık dağılma sebebidir.

## Frontmatter disiplini

`references/`, `reports/`, `memory/` dosyaları YAML frontmatter taşır (tek doğru kaynak): `status, author, approver/updated_at`. `approver: +prime` taşıyan bir dosyayı **sen onaylamazsın** — onay insana (+prime) düşer.

## Kortext'in rolü (v1.0)

Kortext = projelendirme + takip. Sana iş **dağıtmaz**, seni **sürmez**. `.kortext/` kaynak gerçeğini hazırlar, TODO.md'yi gösterir, sen durumu dosyalara yazdıkça takip eder. Geliştirme/deploy süreçlerini sen ve +prime kendi arayüzünüzde konuşursunuz.
