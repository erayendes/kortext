# Kortext — Kılavuz

> [!NOTE]
> [For English press 1](../GUIDE.md)

Panel, anlatılmış. Kurulum ve beş adımlık genel bakış [README](README.md)'de; burası bir proje
ekrana geldikten sonra ne yapılacağı.

---

## Zihinsel model

Kortext **senin** ajan CLI'ını repo'nun içinde çalıştırır. Her analiz koşusu bir belge üretir;
girdileri yerine oturmuşsa proje başına en fazla üç belge aynı anda yazılır. Taslakları sen
onaylarsın; `n/a` işaretli bir belge de bağımlılıkları karşılar.

Bundan üç şey çıkar.

- **Her belgenin bir durumu vardır.** `waiting` (sırası gelmedi) → `writing` (CLI'ın şu an
  yazıyor) → `pending` (yazıldı, seni bekliyor) → `approved`. Bir belge `n/a` olarak da yerine
  oturabilir — adım girdileri okumuş, bu projenin ona ihtiyacı olmadığına karar vermiş ve
  nedenini söylemiştir.
- **Sıra bir tercih değildir.** Bir belge, bağlı olduğu her şey yerine oturduktan sonra
  yazılır. `SECURITY`'nin `ARCHITECTURE`'ı beklemesi, bir belgeyi onaylamanın çoğu zaman
  üçünü birden başlatması bundandır.
- **Çalıştığın tek yer paneldir.** `kortext`'ten sonra hiçbir şey terminal istemez.

![Proje listesi — proje başına bir kart, her birinde neyin yerine oturduğu](../assets/panel-projects.png)

## Başlangıç: kapı

**Start**'a bas; Kortext analiz belgelerini üretmeden önce kanıtını kontrol eder. İlk içerik
kontrolü yereldir. Onu geçen yeni bir projede brief bir de ajan CLI'ına yargılatılır; bu çağrı
CLI'ın kotasını ya da faturasını kullanır ve aynı brief için önbelleğe alınır.

**Yeni proje** brief'iyle yargılanır. Brief ne yapıldığını, kimin için olduğunu, ürünün hangi
dili konuştuğunu, işe yaradığını nasıl anlayacağını ve neyin kapsam dışı olduğunu söylemiyorsa
analiz başlamaz — sorular geri gelir ve brief **Action needed**'a düşer. Yerel kontrol sabit
İngilizce sorular kullanır; CLI'dan brief'in dilini kullanması istenir. Soruları brief'te yanıtla,
yeniden onayla, proje duraklatılmışsa Start'a bas.

**Mevcut proje** koduyla yargılanır: içinde neredeyse hiçbir şey olmayan bir klasörün analiz
edilecek bir yanı yoktur.

Bu kapı tek bir nedenle vardır. Üç cümleden ürün gereksinimleri belgesi yazması istenen bir
ajan yazar — ürünü uydurur, o kadar. Bir soru sana bir dakikaya mal olur; uydurulmuş bir ürün
bütün analize.

## Bir belgeyi incelemek

Listeden herhangi bir belgeyi aç. Her şey çekmecede olur.

![Çekmecede bir belge: durumu, yazarı ve sana sorduğu sorular](../assets/panel-document.png)

**Approve** — belge kendinden sonrakilerin zemini olur, zincir ilerler.

**Ask** — bir satır seç, yazarına sor. Belgeyi yazan persona o pasaj hakkında yanıt verir.
Hiçbir şey kaydedilmez: bu, onayladığını anlamak içindir, değiştirmek için değil.

**Add note → Request revision** — notların belgeyi yazan adıma döner ve belge onlarla yeniden
yazılır. Belgenin kendi açık sorularından birine bırakılan not o sorunun yanıtı sayılır: soru
kaybolur, ortaya koyduğu bilgi metnin parçası olur.

**Edit** — dosyayı kendin yaz. Sıradan bir kayıt metni günceller; değişiklik isteklerini
kapatmaz, açık soruları silmez. İstekler dururken ikinci bir düğme çıkar — **Save, requests
done** — metnini kaydeder ve istekleri kapatır; ajana gerek olmayan bir sayı ya da bir cümle
için. Brief'e istenen bir değişikliği **Propose** ile taslaklattığında o taslağı kaydetmek de
yanıtladığı gelen istekleri kapatır.

**Preview** — yalnız `DESIGN.md`'de, çekmecenin içinde: düğme metni sayfayla değiştirir, geri
alır. Tasarımcının yazdığı token'lar — renkler, yazı ölçeği, boşluklar, köşe yarıçapları,
gölgeler — örnek kartlar, yazı numuneleri ve canlı düğmeler olarak çizilir; her rengin WCAG
kontrastı gerçekten üzerinde durduğu yüzeye göre ölçülür. Üstte Light · Dark · System anahtarı
vardır: sayfayı yeniden boyar; belge koyu bir palet bildiriyorsa (`Dark` sütunu, `## Dark mode`
tablosu ya da `-dark` token'ları) kartlar, bileşenler ve kontrast notları onunla değişir.
Bildirmiyorsa sayfa tasarımda koyu tema varmış gibi yapmaz, olmadığını söyler. Belgenin
kendisinden üretildiği için belgenin söylemediğini asla söyleyemez. Sayfa çekmece içinde kendi
belgesidir; paleti ile panelinki karışmaz — panel koyuyken tasarım açıkta okunabilir. Ayrıca
repo'nda `.kortext/DESIGN.html` olarak durur; panel çalışmadan herhangi bir tarayıcıda açılır.

**Action Needed** — pembe, belgenin üstünde. Bu belgeye borçlu olunan her şey, iki grupta ve
tek düğmenin altında.

*Questions* — belgenin *sana* sordukları. Birine tıkla, yanıtla, Add note. Yanıtlanmadan belge
onaylanamaz.

*Change Requests* — başka belgelerin bundan istedikleri: `ENVIRONMENT` diyelim ki erişim log
satırlarının log-yok kararıyla çeliştiğini söylüyor. Bir satır seç, Accept ya da Deny, istersen
nedenini yaz. Neden açık değilse isteği yapan belgeye sor.

Tek düğme hepsini gönderir. İki grup da bu belgeyi yeniden yazdırır ve bir belge bir kez yeniden
yazılır — yanıtların ve kabul ettiğin değişiklikler tek bir yeniden yazıma girer; yazar da
onları öyle görür: birlikte.

**Bir istek tek yerde yaşar: hakkında olduğu belgede.** İsteyen belge hâlâ taslakken istek onun
Action Needed listesinde *Outgoing Requests* altında durur: seç, **Send** ya da **Discard**.
Sen göndermeden hiçbir şey çıkmaz; biri kararsızken belge onaylanamaz. Gönderilince hedefe gider,
orada isteyen belgeden `from` olarak görünür ve *Incoming Requests* altında seni bekler. Kabul
edilip yazıldığında kaybolur — belge artık istenen şeyi söylüyordur. Reddedildiğinde belgenin
`## Decisions` bölümüne, altında senin nedeninle iner. O satır anlaşmazlığın bütün kaydıdır —
hiçbir şey seni bir daha onunla ilgili sormaz, inşa aşaması onu oradan okur.

**Findings** — hiçbir belgenin sahiplenmediği dosyalardaki sorunlar, belgeye yazılmış. Senden
bir şey istemez.

**Related documents** — mavi, üstte. Bu belgeyi okuyan belgeler. Yapılacak bir şey yok: bunu
değiştirirsen neyin değişeceği, sen değiştirmeden söylenmiş. Henüz yazılmamış bir okuyucu
üstü çizili durur — sırası gelince bunu okuyacaktır.

**Recheck** — kehribar. Bu belge onaylı ama okuduğu bir şey hareket ediyor. Sana iş değil;
hangi girdi olduğunu görmek için kelimenin üstüne gel, o yerine oturunca bu belge ona karşı
yeniden okunur ve yalnız gerçekten bir şey bozulduysa haberin olur. Okuma sürerken satır
**Doing**'de `reading` olarak durur, yazma gibi mavi; bu sırada belgeyi düzenleyebilirsin.

## Gruplar

`Action needed` · `Doing` · `To do` · `Done`. Sonuncusu kapalı gelir — bitmiştir; bilerek
atlanan belgeler de içinde, soluk çerçeveyle durur.

Bir hata ya da açık bir talep taşıyan her şey, durumu ne derse desin **Action needed**'a
tırmanır.

## Çalıştırma, duraklatma, motoru değiştirme

Motor — `claude`, `codex`, `antigravity` ya da `gemini`; arkalarında `cursor`, `copilot`,
`opencode`, `amp`, `droid`, `goose`, `qwen` ve `cline` — Kortext'e değil projeye aittir. Açılır
liste kurulu olanları gösterir; *untested* işaretli olanlar CLI'larının belgelerinden
hazırlandı ve gerçek bir makinede henüz belge yazmadı — birini dene, nasıl gittiğini söyle.
Projeyi eklerken seçersin, Start'ın yanındaki açılır liste sonradan değiştirir. Kota bittiğinde
yapılacak hamle budur: geç, ondan sonra başlayan adımlar öteki CLI'da koşar. O anda koşan
eskisinde biter.

İki proje iki ayrı CLI'da durabilir, biri ötekini rahatsız etmez. Bir projenin kullandığı CLI'ı
kaldırırsan proje durmaz — kurulu kalan CLI'a düşer, açılır liste neye düştüğünü gösterir.

İkinci açılır liste **modeli** adlandırır. `default` işi CLI'a bırakır — `~/.codex/config.toml`
ya da `claude`'un ayarları ne diyorsa. Birini seç, Kortext her koşuda geçirir: `claude --model`,
`codex -m`, `gemini -m`. Motor gibi, ayarladıktan sonra başlayan adımlara ve recheck'lere
ulaşır; her koşunun logu tam komutu kaydeder, bir belgeyi hangi modelin yazdığını hep
görebilirsin.

- **Pause** yeni adımların başlamasını durdurur; koşan adım da durdurulur.
- **Continue** zinciri kaldığı yerden alır.
- **Restart** analiz belgelerini ve hazırlık sonucunu temizler, `BRIEF.md`'yi onay durumu dahil
  olduğu gibi korur. Proje duraklatılmış iner; hazır olunca **Start**. `.kopeng/` bağımsızdır,
  dokunulmaz.
- **Archive** biten projeyi rafa kaldırır. Satır kalır, repo'ya dokunulmaz.
- **Cancel** Kortext'in analizini kaldırır — `.kortext/` klasörünün tamamı, brief'in ve içindeki
  elle düzenlemelerin dahil — `AGENTS.md`'deki bloğunu, `CLAUDE.md`'deki işaret satırını ve
  projenin loglarını, sonra projenin kaydını siler. `.kopeng/` ve diğer proje dosyaları kalır;
  `AGENTS.md` ve `CLAUDE.md`'deki kendi içeriğin de kalır. İki aracı da kaldırmaz.

## El sıkışma

![El sıkışma kartı — tıklayınca kopyalanan üç başlangıç komutu](../assets/panel-handshake.png)

Her belge onaylandığında ya da `n/a` olduğunda, açık hiçbir şey kalmadığında analiz tamamdır ve
Kortext işini bitirmiştir. Tamamlanma kartı üç başlangıç komutu verir; birini kendi ajanına — CLI
ya da uygulama — kopyala; `AGENTS.md`'yi ve `.kortext/` belgelerini okuyarak başlar.

Buradan sonra Kortext döngüde değildir. Belgeler sözleşmedir, ajanın onlara karşı çalışır.

## Kopeng'e aktarım — isteğe bağlı

`kopeng` `PATH`'indeyse tamamlanma kartına **Transfer to Kopeng** eklenir: tek bir uzun koşu
onaylı belgeleri `.kopeng/` altında sürümlere, epic'lere ve görevlere böler; kimlikler proje
kodunu taşır (`ACME-E01`, `ACME-T001`). Panel planı gösterir; **Approve plan** son imzadır.
kopeng kurulu değilse kart onun yerine bir kurulum notu gösterir, başka hiçbir şey değişmez — el
sıkışma iki durumda da tamamdır.

## Panelin kendi kontrolleri

Kortext arka planda çalışır: onu başlatan terminal kapatılabilir, panel kalır. Panelin kendisi
hakkında söyledikleri iki şeritte yaşar.

**Durum çubuğu**, altta. Yeşil nokta sunucunun yanıt verdiğini söyler; sunucu gittiği an
kırmızıya döner, `kortext`'i yeniden başlattığında kendiliğinden yeşile. Yanında: çalışan sürüm
ve ⏻ düğmesi. Durdurmak iki tık ister — ilki kurar ve söyler, ikincisi sunucuyu durdurur. Bir
adım yazarken reddeder, böylece analiz belgenin ortasında kesilmez; terminaldeki `kortext --stop`
da aynı kurala uyar. Sağdaki imza, diğer Milowda araçlarının kısa listesini açar.

**Güncelleme şeridi**, başlığın altında, yalnız npm'de çalışandan yeni bir sürüm varsa görünür.
**Update now** kurulumu senin yerine çalıştırır; sürerken sunucuya her başka çağrı reddedilir,
sonrasında şerit kortext'i kapatıp yeniden açmanı söyler — ekrandaki süreç hâlâ eskisidir.
Kurulum başarısız olursa şerit söyler ve kendin çalıştıracağın komutu verir.

**Tema.** Başlığın sağındaki düğme auto → light → dark döner. Auto işletim sistemini izler; öbür
ikisi bu tarayıcıda hatırlanır.

**Milowda'dan.** Proje listesinin altındaki kartlar ve proje ekranındaki tek satırlık kayan
şerit diğer Milowda araçlarını sayar. × onları bu tarayıcıda kalıcı olarak gizler; yapmadan bir
kez sorar, bir ekranda gizlemek ikisinde de gizler.

## Bir şey ters gittiğinde

**Bir adım başarısız oldu.** Satır nedenini CLI'ın kendi sözleriyle söyler. Olağan neden kurulu
ama oturum açmamış bir ajan CLI'ıdır — terminalde bir kez tek başına çalıştır, sonra Retry.

**Başlık ajan CLI'ı bulunamadı diyor.** Bilinen CLI'ların hiçbiri `PATH`'inde değil. Birini kur
(bkz. [README](README.md)) ve sayfayı yenile.

**Bir adım uzun süredir koşuyor.** Analiz adımları dakikalar sürer; takılan adım on beşte
durdurulur. İsteğe bağlı Kopeng planlama koşusunun sınırı otuz dakikadır. Ham CLI çıktısı
varsayılan olarak `~/.kortext/kortext.db.logs/`'ta; özel `--db` ile `<db-yolu>.logs/`'ta.

**Bir adım koşarken Kortext yeniden başladı.** O adım "kortext restarted mid-step — retry" ile
başarısız işaretlenir; yapılacak tam olarak budur.

**Bir belge "Action needed"dan çıkmıyor.** Başarısız bir koşu, açık bir soru ya da duran bir
değişiklik isteği ara. Açık sorular onayı engeller. Tek başına bir değişiklik isteği onayı
engellemez ama onaylamak onu kapatmaz: belge hâlâ ilgi ister, istek ele alınmadan analiz
bitemez.

**Diskteki değişikliklerin görünmüyor.** Panel birkaç saniyede bir yoklar; bir an ver.

## Neresi nerede

| | |
| --- | --- |
| `~/.kortext/kortext.db` | proje kaydı — tek veritabanı, her proje |
| `~/.kortext/kortext.db.logs/` | her CLI koşusunun ham çıktısı |
| `~/.kortext/kortext.db.log` | arka plan sunucusunun yazdıkları |
| `<repo>/AGENTS.md` | devir sözleşmesi, işaretli bir blok içinde |
| `<repo>/.kortext/` | on dört analiz belgesi; yeni projede bir de `BRIEF.md`, toplam on beş |
| `<repo>/.kortext/DESIGN.html` | çizilmiş tasarım token'ları — `DESIGN.md`'den yeniden üretilir |

`--db /yol/ad.sqlite` ile kayıt `/yol/ad.sqlite`, CLI logları `/yol/ad.sqlite.logs/`, arka plan
sunucusu `/yol/ad.sqlite.log`'a yazar.

Belgeler repo'nda düz markdown'dır. Commit'le: projenin hafızasıdır; repo'yu açan bir sonraki
ajan bir satır yazmadan önce onları okur.
