# Değişiklik günlüğü

🇬🇧 [For English press 9](../CHANGELOG.md)

## [Unreleased]

- **macOS için menü çubuğu uygulaması.** Sürümün yanında `Kortext.zip`, notarize edilmiş,
  kendini güncelleyen. Proje başına bir kart: sizi bekleyen belgeler — `approve`, `review`,
  `failed` — ve yazılmakta olanlar, gri; satıra basınca panel o belgede açılır. ⏻ sunucuyu
  başlatır ya da iki basışta durdurup uygulamadan çıkar. Login'de açılınca sunucuyu da
  kaldırır. Bir belge geldiğinde, bir adım başarısız olduğunda, bir brief geri döndüğünde ya da
  bir zincir tamamlandığında bildirim — projenin dilinde, paneli olayın olduğu yerde açan.
  Uygulaması olmayan Mac'te panel onu güncelleme şeridinin yerinde sunar — bir seferde tek
  şerit.
- **Motor satırı kontrolün kendisi.** Start'ın yanındaki `codex · default · high ›` seçiciyi
  açar; *Change model* gitti. Proje ekleme de aynı satırı ve aynı seçiciyi taşır, efor hep
  yazılı.
- **Proje adının yanındaki ⚙** Restart, Archive ve Remove'u yolun altında açar, her biri
  yerinde onay ister; sayfanın altı boş. Restart kehribar. El sıkışmadan sonra motor satırı ve
  düğmeleri gider — kortext o projeden çekilmiştir.
- **Approve anyway.** Şablon satırını olduğu gibi taşıyan taslak yine reddedilir, ama panel
  artık satırı gösterir — tıklayınca oraya gider — ve ısrar etme yolu drawer'ın altında,
  Request revision'ın yanında, okumanız bitene kadar bekler.
- **Try the beta.** Uygulamanın ayarlarında, Check for updates'in altında: npm'deki beta,
  ikinci basışta kurulur; betadayken Check for updates sürüme dönüşü sunar.
- **Continue tutar** adım koşar görülene kadar; ikinci basış artık tekrar duraklatmaz. Başka
  yerden — menü çubuğu uygulaması, başka sekme — yapılan duraklatma panele ulaşır.
- İki URL içeri girer: `/?project=<id>` ve `/?project=<id>&doc=<rel>`. Diğer araçlar
  belgelerin altında, üstünde değil. Remove'un uyarısı Kopeng'den söz etmez.

## [3.1.2] — 2026-09-14

- **Güncelleme şeridi görünür.** Başlığın altında herhangi bir kart gibi duran gri satır yerine
  iki ekranda da başlığın altında, mavi, düğmesi sağda. Kurulumdan sonra **Quit** sunar; yeniden
  başlatmak bir basış ve bir `kortext`. Panel açılışta ve sonra her saat sürüm bakar, sunucu npm'e altı saatte bir yerine en
  çok saatte bir sorar — gün boyu açık duran panele de sürüm düşer.

## [3.1.1] — 2026-09-14

- **Change model.** CLI, model ve effort düğmelerin altında, proje adının sağında tek satır —
  `claude · sonnet · high` — ve CLI'ların kendi ekranı gibi bir seçicide değişir: chip'ler, her biri bir satır açıklamalı
  model listesi, effort segmenti. Her seçim anında kaydedilir.
- **Proje başına effort.** Aynı pencerede üçüncü bir seçim, bu kavramı bilen CLI'lar için:
  `claude --effort`, codex'in `model_reasoning_effort`'u, `agy --effort` — her CLI'ın kendi
  seçicisinin sunduğu seviye ve modellerle.
- Satırdaki hata nedeni belge adının altında kendi satırında durur, kesilmeden önce iki satır;
  çekmecede düz yazı 100 karaktere kadar uzar.
- **Logo.** Yeni yazı markası ve ikon: açık temada eskiz kılavuzları üzerinde çizgi harfler,
  koyuda dolu; favicon tek başına `x`. Panel başlığı, README ve favicon bunları kullanır.
- **Daha geniş çekmece.** 720'den 880px'e; bantlar, tablolar, kod ve tasarım sayfası için.
  Düz yazı 78 karakterlik ölçüsünü korur.
- **İstek başına tek karar.** İsteyen belgede kabul edilen istek hedefe işaretli olarak iner —
  *accepted there* — aynı kişiye ikinci kez sorulmaz; işaret yine kaldırılabilir ve istek hedefin
  bir sonraki yeniden yazımına oradaki her şeyle birlikte girer. Send, Accept oldu.
- **Gönderilmiş tepsi tek belgeye aittir.** Apply'dan sonra tepsi bir sonraki açılan belgede de
  salt okunur kalıyordu — × yok, Apply pasif — ve yeniden yazım çekmece kapalıyken inerse
  sonsuza dek; bir belgenin notları başka belgede işaretsiz duruyordu. Artık belge, sürümü ya
  da koşunun sonucu değişince temizleniyor.
- **Öneri iste, yanıtı al.** Ask'in yanındaki **Suggest** tek kelime yazmadan yazara ne
  önerdiğini sorar; her yanıtın altındaki **Use as my answer** onu tek basışta sorunun notu
  yapar — istek satırında ise Accept ya da Deny için not kutusunu doldurur.
- **Tasarım önizlemesi tasarımcının yazdığını okur.** `--color-primary` kadar `color.primary`
  adları; tek satırda `light #X, dark #Y`; düz yazıda `space.md = 16`, px olarak çizilir. Eskiden
  "karar verilmiş token yok" diyen gerçek bir DESIGN.md artık paletini iki modda çiziyor.
- **Brief kabul etmez, taslak hazırlar.** Brief'e gelen bir istek, nedeni tooltip'te saklı
  kapalı bir Accept yerine satırında **Draft the change** gösterir.

## [3.1.0] — 2026-09-14

İlk açık sürüm.

3.1.0'dan önce bu adla yayımlanan farklı bir araçtı. Kişisel olarak kullandım ve hiç piyasaya sürmedim. Bu benzer bir yerden başlayan ama yeni bir üründür.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)'a dayanır; Kortext [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.