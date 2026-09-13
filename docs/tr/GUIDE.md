# Kortext — Kılavuz

🇬🇧 [For English press 9](../GUIDE.md)

Kurulum ve genel bakış [README](README.md)'de; burası bir proje ekrana geldikten sonra ne yapılacağını anlatır.

---

## Zihinsel model

Kortext **sizin** ajan CLI'ınızı repo'nun içinde çalıştırır. Her analiz koşusu bir belge üretir ve taslak olarak işaretler.
Taslakları yalnızca siz onaylarsınız.

- **Her belgenin bir durumu vardır.** `waiting` (sırası gelmedi ya da yazıldı, onayınızı bekliyor) → `writing` (şu an yazılıyor) → `approved`. Yazımı durdurursanız `paused` olur, devam ettirebilirsiniz; hata alırsa `failed` olur, yeniden başlatabilirsiniz. Projede işlevi olmayan bir belge `n/a` olarak görünür.
- **Durumun yanında bir rozet olabilir.** `approve` (onayınızı bekliyor), `review` (soruları ya da istekleri var), `recheck` (okuduğu bir belge değişti, yeniden okunacak), `revision` (ilk yazım değil, yeniden yazım).
- **Sıra bir tercih değildir.** Bir belge, bağlı olduğu her şey yerine oturduktan sonra yazılır. `SECURITY`'nin `ARCHITECTURE`'ı beklemesi gibi. Bir belgeyi onaylamanın başka belgeyi başlatması bundandır.
- **Çalıştığınız tek yer paneldir.**

![Proje listesi — proje başına bir kart, her birinde neyin yerine oturduğu](../assets/panel-projects.png)

## Başlangıç

**Yeni bir proje** yazdığınız brief'le oluşturulur. Brief ne yapıldığını, kimin için olduğunu, ürünün hangi dili konuştuğunu, işe yaradığını nasıl anlayacağınızı ve neyin kapsam dışı olduğunu söylemiyorsa analiz başlamaz — sorular gelir ve brief **Action needed**'a düşer.
Soruları brief'te yanıtlayın ve onaylayın. Tekrar değerlendirmeye girer.

**Bu kapı tek bir nedenle vardır.** Üç cümleden ürün gereksinimleri belgesi yazması istenen bir ajan yazar — ürünü uydurur, o kadar. Bir soru bir dakikaya mal olur; uydurulmuş bir ürün bütün analize.

Ya da **mevcut projeniz** için repo'sunu gösterin. Kortext kodu inceleyerek çalışmaya başlar.

## Bir belgeyi incelemek

Listeden herhangi bir belgeyi açın.

![Çekmecede bir belge: durumu, yazarı ve sorduğu sorular](../assets/panel-document.png)

**Approve** — belge kendinden sonrakilerin zemini olur, zincir ilerler.

**Ask** — bir satır seçin ve sorunuzu sorun. Belgeyi yazan persona o pasaj hakkında yanıt verir.
Sorular anlamak içindir, değiştirmek için değil. Bu yüzden kaydedilmezler.

**Add note** — notlarınız belgenin yeniden yazılmasını sağlar. Belgenin açık sorularından birine bırakılan not o sorunun yanıtı sayılır: soru kaybolur, ortaya koyduğu bilgi ise belgenin parçası olur.

**Edit** — ajana gerek olmayan bir sayı ya da bir cümle için dosyayı kendiniz yazın. Sadece metni günceller; değişiklik isteklerini kapatmaz, açık soruları silmez. İstekler varken ikinci bir düğme çıkar: **Save, requests done** — metni kaydeder ve istekleri kapatır.

**Preview** — yalnız `DESIGN.md`'de. Tasarımcının yazdığı token'lar — renkler, yazı tipleri ve ölçeği, boşluklar, köşe yarıçapları, gölgeler — gerçeğe döndürülmüş ve görselleştirilmiş hali. Butonun rengini ve kenarlarını görmek HEX ve radius bilgisinden çok daha iyidir. Açık ve karanlık modu da destekler. Aynı sayfa repo'nuzda `.kortext/DESIGN.html` olarak da durur.

**Action Needed** — belgenin üstünde. Bu belgenin sizden beklediği her şey, iki grupta ve tek düğmenin altında.

*Questions* — belgenin size sordukları. Birine tıklayın, yanıtlayın, Add note. Yanıtlanmadan belge onaylanamaz.

*Change Requests* — başka belgelerin bundan istedikleri. Örneğin `ENVIRONMENT`, log satırlarının log-yok kararıyla çeliştiğini söylüyor olabilir. Satırı seçin, **Accept** ya da **Deny**; isterseniz nedenini yazın. Neden açık değilse **Ask** ile isteği yapan belgeye sorun.

**Apply** hepsini tek seferde gönderir. Yanıtlarınız ve kabul ettiğiniz istekler tek bir yeniden yazıma girer; reddettikleriniz nedeniyle belgenin `## Decisions` bölümüne yazılır.

**Bir belge başka bir belgeden değişiklik isteyebilir.** İsteyen belge hâlâ taslakken bu istek *Outgoing Requests* altında durur: **Send** ya da **Discard**. Siz göndermeden hiçbir şey çıkmaz; kararsız bir istek varken belge onaylanamaz. Gönderilince hedef belgede *Incoming Requests* altında görünür ve sizi bekler. Kabul edilip yazıldığında kaybolur; reddedildiğinde nedeniyle `## Decisions`'a iner. Bir daha sorulmaz; kod yazan ajan onu oradan okur.

**Findings** — hiçbir belgenin sahiplenmediği dosyalardaki sorunlar (bir `.gitignore` eksiği gibi), belgeye yazılmış. Sizden bir şey istemez.

**Related documents** — üstte, mavi. Bu belgeyi okuyan belgeler. Bunu değiştirirseniz onlar da yeniden okunur. Henüz yazılmamış olanlar üstü çizili durur.

**Recheck** — kehribar rozet. Belge onaylı ama okuduğu bir belge değişti. Sizin işiniz değil; sırası gelince yeniden okunur ve yalnız gerçekten çelişki varsa size bir istek düşer. Okuma sürerken satır **Doing**'de `reading` olarak durur; bu sırada belgeyi düzenleyebilirsiniz.

## Gruplar

`Action needed` · `Doing` · `To do` · `Done`. Sonuncusu kapalı gelir.

Bir hata ya da sizi bekleyen bir şey taşıyan her belge **Action needed**'a çıkar.

## Çalıştırma, duraklatma, motoru değiştirme

Motor — `claude`, `codex`, `antigravity`, `gemini` ve listedeki diğerleri — projeye aittir. Açılır liste kurulu olanları gösterir; *untested* işaretliler gerçek bir makinede henüz denenmedi. Projeyi eklerken seçersiniz, Start'ın yanındaki listeden değiştirirsiniz. Kota bittiğinde yapılacak şey budur: değiştirin, sonraki adımlar yeni CLI'da koşar. O anda koşan adım eskisinde biter.

İkinci liste **model**. `default` seçimi CLI'ın kendi ayarını kullanır. Bir model seçerseniz her koşuda CLI'a geçilir (`claude --model`, `codex -m`).

- **Pause** yeni adımların başlamasını durdurur; koşan adım da durur.
- **Continue** kaldığı yerden devam eder.
- **Restart** analiz belgelerini siler, `BRIEF.md`'yi olduğu gibi korur. Proje duraklatılmış gelir; **Start** ile yeniden başlar.
- **Archive** biten projeyi rafa kaldırır. Repo'ya dokunmaz.
- **Cancel** `.kortext/` klasörünü (brief dahil), `AGENTS.md`'deki Kortext bloğunu, `CLAUDE.md`'deki işaret satırını ve projenin loglarını siler; projeyi listeden çıkarır. `AGENTS.md` ve `CLAUDE.md`'deki kendi yazdıklarınız kalır.

## El sıkışma

![El sıkışma kartı — tıklayınca kopyalanan üç başlangıç komutu](../assets/panel-handshake.png)

Bütün belgeler onaylandığında analiz biter. Kart size üç başlangıç komutu verir; birini kendi ajanınıza kopyalayın. Ajan `AGENTS.md`'yi ve `.kortext/` belgelerini okuyarak başlar.

Buradan sonra Kortext işin içinde değildir.

## Kopeng'e aktarım — isteğe bağlı

`kopeng` kuruluysa kartta **Transfer to Kopeng** görünür: onaylı belgeler `.kopeng/` altında sürüm, epic ve görevlere bölünür. **Approve plan** son imzadır. Kopeng kurulu değilse kart bir kurulum notu gösterir; el sıkışma yine tamamdır.

## Panelin kendisi

**Durum çubuğu**, altta. Yeşil nokta sunucu ayakta demektir. ⏻ düğmesi iki tıkla durdurur: ilki sorar, ikincisi kapatır. Bir belge yazılırken kapatmaz.

**Güncelleme şeridi**, üstte, yalnız npm'de yeni sürüm varsa görünür. **Update now** kurar; sonra kortext'i kapatıp yeniden açmanız gerekir.

**Tema.** Sağ üstteki düğme auto → light → dark döner.

**Milowda kartları.** Proje listesinin altındaki diğer Milowda araçları. × ile kalıcı olarak gizleyebilirsiniz.

## Bir şey ters gittiğinde

**Bir adım başarısız oldu.** Satırda nedeni yazar. En sık neden kurulu ama oturum açmamış bir CLI'dır: terminalde bir kez çalıştırın, sonra **Retry**.

**Panel CLI bulamadı diyor.** `PATH`'inizde hiçbiri yok. Birini kurun ve sayfayı yenileyin.

**Bir adım çok uzun sürüyor.** Adımlar dakikalar sürer; on beş dakikada durdurulur. Kopeng planlaması otuz dakikada. Ham çıktı `~/.kortext/kortext.db.logs/` altındadır.

**Kortext bir adımın ortasında yeniden başladı.** Adım "kortext restarted mid-step — retry" ile işaretlenir. Retry'a basın.

**Bir belge Action needed'dan çıkmıyor.** Açık bir soru, bekleyen bir istek ya da başarısız bir koşu vardır.

## Neresi nerede

| | |
| --- | --- |
| `~/.kortext/kortext.db` | proje kaydı |
| `~/.kortext/kortext.db.logs/` | her CLI koşusunun ham çıktısı |
| `~/.kortext/kortext.db.log` | arka plan sunucusunun yazdıkları |
| `<repo>/AGENTS.md` | ajanın sözleşmesi, işaretli bir blok içinde |
| `<repo>/.kortext/` | analiz belgeleri; yeni projede `BRIEF.md` de burada |
| `<repo>/.kortext/DESIGN.html` | `DESIGN.md`'nin görsel hali |

Belgeler düz markdown'dır. Commit'leyin: projenin hafızasıdır; repo'yu açan bir sonraki ajan bir satır yazmadan önce onları okur.
