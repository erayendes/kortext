# Değişiklik günlüğü

🇬🇧 [For English press 9](../CHANGELOG.md)

## [Unreleased]

- **El sıkışma kartı sadeleşti.** Başlık ve belge sayısı solda, **Export documents** düğmesi
  sağda; dişliyi açmak gerekmez. EXPERIENCE teklifi komut kartlarıyla aynı ağırlıkta ve en
  üstte — karar bekleyen tek şey, üç başlama yolunun önünde. Açıklama metinleri gitti.

## [3.2.0] — 2026-09-20

- **EXPERIENCE.md, isteğe bağlı.** Zincirin kendiliğinden yazmadığı, el sıkışmada sunulan
  bir belge daha: tasarımı yapacak yapay zekânın ihtiyacı olan brief — yolculuklar, her ekran
  durumlarıyla, metinler birebir — ve yapıştırmaya hazır prompt'lar: bir ana prompt, yolculuk
  başına bir prompt, hangi tasarım aracı olursa olsun. El sıkışma kartında *Write
  EXPERIENCE.md*'ye basın; motor ve model düğmenin üstündeki satırdan seçilir. Tasarım zaten
  elinizdeyse atlayın. Proje klasöründe zaten bir tasarım varsa `DESIGN.md` yenisini uydurmaz,
  onu belgeler. El sıkışmadan sonra belge proje sahibinindir.
- **n/a artık prime'ın kararı.** Yazarın "bu projeye gerekmez" dediği belge artık kendiliğinden
  kesinleşmiyor: Action Needed'a `n/a?` olarak gelir, *Approve n/a* kesinleştirir. Katılmıyorsanız
  bir not bırakıp revizyon isteyin; yazar döner, belgeyi yazar.
- **Export.** Belge panelden dosya olarak çıkar: çekmecedeki **Export** açık belgeyi indirir,
  projenin dişlisindeki **Export documents** yazılmış her belgeyi tikli listeler — All, None ya
  da seçin — ve seçtiklerinizi tek bir zip olarak indirir. `.kortext/` gizli bir klasördür,
  dosya seçme penceresi göstermez; `EXPERIENCE.md` tasarım yapay zekâsına böyle ulaşır.
- **Soru-cevap yanıtın yanında kalır.** Başka yere tıklayınca yazma kutusu kapanır; yanıta
  tıklayınca ek soru için yeniden açılır; üstündeki × soru-cevabı kaldırır. *Suggest* yalnız bir
  soruda ya da bir istekte görünür — yazarın önerecek bir şeyi olduğu yerde; düz bir satırda
  değil.

- **macOS için menü çubuğu uygulaması.** Sürümün yanında `Kortext.zip`, notarize edilmiş,
  kendini güncelleyen. Proje başına bir kart: sizi bekleyen belgeler — `approve`, `review`,
  `failed` — ve yazılmakta olanlar, gri; satıra basınca panel o belgede açılır. ⏻ sunucuyu
  başlatır ya da iki basışta durdurur; uygulama kalır. Uygulama açılınca sunucuyu da
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
- **Stable version / Try beta version.** Uygulamanın ayarlarında iki satır; her biri kendi
  türünün en yenisini ve sizde kurulu olup olmadığını gösterir. Birine basınca kurulur —
  sunucu yeniden başlar, uygulama aynı kanala geçer; ötekine basınca geri dönersiniz. Panelin
  durum çubuğu aynı çifti taşır: çalışan kanal bir basışta denetler, öteki bir basışta
  kurulur. Güncelleme şeridi kanalınızı izler.
- **Kısa sürümler** her yerde: `3.2-beta3`, `3.2`, `3.1.2`.
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