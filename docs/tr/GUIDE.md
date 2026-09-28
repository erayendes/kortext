# Kortext — Kullanım Kılavuzu

🇬🇧 [For English press 9](../GUIDE.md)

Genel bakış [README](README.md)'de, kurulum [INSTALL](INSTALL.md)'da, menü çubuğu uygulaması [MACOS](MACOS.md)'ta; burası bir proje eklendikten sonra ne yapılacağını anlatır.

## Başlatma ve durdurma

Kortext’i başlatmak için terminale `kortext` yazmanız yeterli. Başlattıktan sonra terminal penceresini kapatabilirsiniz; Kortext arka planda çalışmaya devam eder. 
Sunucuyu durdurmak için panelin durum çubuğundaki ⏻ düğmesine basın. 

Yeniden başlatmak için terminale tekrar `kortext` yazmanız yeter.
Arka plandaki sunucunun yazdıkları `~/.kortext/kortext.db.log` dosyasında birikir.

```sh
kortext              # arka planda başlat, paneli aç
kortext --stop       # arka plandaki sunucuyu durdur
```

> [!TIP]
> Ne düğme ne `--stop` koşan bir adımı yarıda keser; biri sürerken beklemenizi ister. Böylece bir analiz yazımın ortasında kesilmez.

## Başlangıç

![Proje listesi — proje başına bir kart, her birinde neyin yerine oturduğu](../assets/panel-projects.png)

Kortext paneli sizi sezgisel olarak yönlendirecektir. 

Projenizin adını ve vermek istediğiniz proje kodunu verdikten sonra yeni projenizin yazılacağı dizini ya da mevcut projenizin olduğu dizini seçin.
Eğer mevcut projenize Kortext’i entegre edecekseniz, çalıştırmak istediğiniz modeli seçip başlatın.
Yeni bir proje içinse sizden brief bekleyecektir. 

> [!IMPORTANT]
> Brief ne yapıldığını, kimin için olduğunu, ürünün hangi dili konuştuğunu, işe yaradığını nasıl anlayacağınızı ve neyin kapsam dışı olduğunu söylemiyorsa analiz başlamaz — sorular gelir ve brief **Action needed**'a düşer. Soruları brief'te yanıtlayın ve onaylayın. Tekrar değerlendirmeye girer.
> **Bu kapı tek bir nedenle vardır.** Üç cümleden ürün gereksinimleri belgesi yazması istenen bir ajan yazar — ürünü uydurur, o kadar. Bir soru bir dakikaya mal olur; uydurulmuş bir ürün bütün analize.

### Elinizde olan bir şey varsa

Karar verilmiş bir şey — beğendiğiniz bir tasarım, kullanacağınız teknoloji, alınmış bir alan adı, uymanız gereken bir mevzuat, "bunu asla yapmayacağız" dediğiniz bir şey — brief'e yazılır. Brief her belgenin girdisidir; orada olan hiçbir şey yeniden icat edilmez, orada olmayan her şey ajanın takdirine kalır.

- **Tasarım:** ekranları, export'ları, token dosyasını veya `.pen` dosyasını repo'da bir klasöre koyun (`design/` gibi) ve brief'te söyleyin: *"Tasarım hazır, `design/` referanstır; yeni tasarım önerilmeyecek."* `DESIGN.md` o tasarımı belgeler, yanına ikincisini uydurmaz. Beğendiğiniz bir web sitesiyse dosya yok; adresini ve neyi beğendiğinizi yazın — boşlukları, yazı tipini, koyu zemini. Ajan siteyi gezemez, tarifinizi uygular.
- **Teknoloji:** *"Next.js ve Sanity, tartışmasız."* — `STACK.md` seçeneği tartışmaz, kararı yazar.
- **Kural ve sınır:** *"Çerez yok, form yok, yalnız e-posta."* — `LEGAL.md`, `SECURITY.md` ve `GROWTH.md` bunu veri kabul eder.
- **Kapsam dışı:** brief'in kendi bölümü var; oraya yazın. Yazılmayan şey kapsam içi sayılır.

Kısa yeter; bir cümle bir soruyu keser. Brief'te olmayan her karar, ilk belgeden itibaren soru olarak geri gelir.

Kortext repo'nun köküne `.kortext/` dizinini ve içine belge iskeletlerini, bir de `AGENTS.md` yerleştirir. `AGENTS.md` zaten varsa içine işaretli bir blok ekler; sizin yazdıklarınıza dokunmaz.

Kortext, belgelerin bağımlılık sırasına uyan bir iş akışında adım adım çalışır. Her adım tek bir belge yazar — `PRODUCT.md`, `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `DESIGN.md`, `GROWTH.md`, `SECURITY.md`, `ENVIRONMENT.md`, `DATABASE.md`, `API.md`, `LEGAL.md`, `CONTENT.md`, `ENGINEERING.md`, `TEST.md`, `EXPERIENCE.md` (isteğe bağlı) — ve bunu bir persona olarak yapar: `product manager`, `architect`, `designer`, `growth expert`, `security engineer`, `DevOps engineer`, `DBA`, `compliance expert`, `copywriter` ve `QA engineer`.

> Bir belge "bu projede buna gerek yok" gerekçesiyle, `not-applicable` olarak önerebilir.

Yazılan her belge onayınıza sunulur.

Herhangi bir belgeyi açın. Onaylayabilirsiniz; bir satır seçip “bunu neden böyle yazdın?" diye sorabilirsiniz (bu sohbet geçicidir, hiçbir yere yazılmaz); ya da notlar bırakıp revizyon isteyebilirsiniz. Revizyon istediğinizde belge yeniden yazılır.

Bir belge, kendinden önce yazılmış bir belgede değişiklik talep edebilir ya da kendinden sonra yazılacak bir belge için not bırakabilir. Bunlar da sizin onayınıza tabidir. 

Bütün belgeler onaylandığında ya da gerek yok dendiğinde analiz bitmiştir. Belgeler artık projenin anayasası, `AGENTS.md` de devir teslim metnidir. 
Başlangıç komutlarından birini kendi istemcinize — CLI ya da uygulama, hangisini kullanıyorsanız — kopyalayın ve geliştirmeye başlayın.

## Kavramlar

Her belge bir grup altında durumlarına göre listelenir. Böylece hangi aşamada olduğunuzu net bir şekilde görebilirsiniz.
`Action needed` · `Doing` · `To do` · `Done`. Sizden aksiyon bekleyen her belge **Action needed**'a çıkar.

Belge durumları ise; 
- `waiting` → sırası gelmedi ya da yazıldı, onayınızı bekliyor
- `writing` → şu an yazılıyor
- `approved` → onaylanmış
- Yazımı durdurursanız `paused` olur, devam ettirebilirsiniz
- Hata alırsa `failed` olur, yeniden başlatabilirsiniz.
- Projede işlevi olmayan belgelerse `n/a` olarak görünür.

Ayrıca durumun yanında bir rozet görebilirsiniz. 
- `approve` → onayınızı bekliyor
- `review` → soruları ya da istekleri var, incelemenizi bekliyor
- `recheck` → okuduğu bir belge değişti, yeniden okunacak
- `revision` → ilk yazım değil, yeniden yazım

## Bir belgeyi incelemek

![Çekmecede bir belge: durumu, sorduğu sorular, gelen ve giden istekleri, metnindeki CHANGED, NEW ve SUGGESTION etiketleri](../assets/panel-document.png)

Listeden herhangi bir belgeyi açın.

**Üst bar** — solda belgenin adı ve durumu, sağda **⋯**, **Approve** ve **Close**.

**Approve** — belgenin onayı olur ve kendinden sonrakilerin referansı olur, zincir ilerler. Cevaplanmamış soru ya da gönderilmeyi bekleyen bir karar varken kapalıdır; üstüne gelince nedenini söyler.

**Belgenin adı** — yanında aşağı bakan bir ok varsa belgenin eski sürümleri vardır. Ada tıklayın, bir tarih seçin: metin o sürümden bu yana neyin değiştiğini gösterir. Değişen satırın sonunda **CHANGED** etiketi durur, tıklarsanız eski hâli altında açılır. Yeni eklenen satırlarda **NEW** yazar.

**⋯** — belgeye yapılan işler, karar değil:
- **Edit** — dosyayı kendiniz düzeltin. **Save** dediğinizde belge taslağa döner ve onu yazan persona değişikliğinizi okur: yaptığınız değişiklik bir isteği karşılıyorsa o isteği kapatır, belgenin başka bir yeriyle çelişiyor ya da yarım bir şey bırakıyorsa size soru olarak sorar. Sonra belge yeniden onayınıza gelir. Brief'i düzenlerseniz onu okuyan belgeler yeni brief'e göre yeniden kontrol edilir.
- **Export** — açık belgenin bir kopyasını dosya olarak indirir. `.kortext/` gizli bir klasördür, dosya seçme penceresi göstermez; bir tasarım yapay zekasına `EXPERIENCE.md` vermenin yolu budur.
- **Preview** — yalnız `DESIGN.md`'de. Tasarımcının yazdığı token'ların — renkler, yazı tipleri, boşluklar, köşe yarıçapları, gölgeler — gerçeğe döndürülmüş ve görselleştirilmiş hali. Butonun rengini ve kenarlarını görmek HEX ve radius bilgisinden çok daha iyidir. Açık ve karanlık modu da destekler. Repo'nuzda `.kortext/DESIGN.html` olarak da durur.

**Bir satıra tıklamak** — altında bir kutu açılır. Solda soru sormak, sağda karar vermek durur:
- **Ask** — sorunuzu sorun, belgeyi yazan persona o pasaj hakkında yanıt verir. Sorular anlamak içindir, değiştirmek için değil; kaydedilmezler. Yanıtı kullanmak isterseniz altındaki **Use this** onu kutuya taşır.
- **Add note** — satıra not düşer. Notlarınız **Apply** ile belgenin yeniden yazılmasını sağlar. Notlu satırın sonunda **NOTE #1** gibi bir etiket durur.

Enter her yerde yeni satır açar; göndermek için düğmeye basın.

**SUGGESTION** etiketli satırlar — bunu persona girdilerde bulmadı, kendisi öneriyor. Belgeyi onaylarsanız öneriyi de kabul etmiş olursunuz.

**Action Needed** — belgenin üstünde. Bu belgenin sizden beklediği her şey, üç grupta toplanır. Bir satıra tıklayın, altındaki kutuda kararınızı verin.

*Questions* — belgenin size sordukları. Yanıtınızı yazın ve **Add answer**. Ne diyeceğinizi bilmiyorsanız **Get a suggestion** personanın önerisini alır. Tüm sorular yanıtlanmadan belge onaylanamaz.

*Incoming Requests* — başka belgelerin bu belgeye gönderdiği değişiklik istekleri, `→ STACK` gibi. Örneğin `ENVIRONMENT`, log satırlarının log-yok kararıyla çeliştiğini söylüyor olabilir. **Accept** ya da **Reject**. Reject ise nedenini kutuya yazın; persona o konuyu bir daha açmaz. Talep anlaşılmıyorsa **Ask** ile isteği yapan belgeye sorun.

*Outgoing Requests* — bu belgenin başka belgelerden istedikleri, `← BRIEF` gibi. **Accept** derseniz istek karşı belgeye kabul edilmiş olarak gider; o belgede yeniden karar vermezsiniz, yalnız onun Apply'ına basarsınız. **Reject** isteği siler.

Karar verdiğiniz satırın yanında **ANSWERED**, **ACCEPTED** ya da **REJECTED** yazar.

**Apply** — her şeye karar verdiğinizde açılır; o zamana kadar yanında kaçına karar verdiğiniz yazar (`2 of 3 decided`). Yanıtlarınız ve kabul ettiğiniz istekler tek seferde yeniden yazıma girer. Reddettiklerinizse nedeniyle birlikte belgenin `## Decisions` bölümüne yazılır. Belge yazılırken düğme **Writing…** yazar.

Brief'te Apply farklı çalışır, çünkü onu bir persona değil siz yazdınız. Ajan, kabul ettiğiniz istekleri işlenmiş brief'i taslak olarak hazırlar ve editörde açar; **Save** derseniz brief güncellenir, istekler kapanır. **Discard** derseniz hiçbir şey değişmez.

**Findings** — hiçbir belgenin sahiplenmediği dosyalardaki sorunları (bir `.gitignore` eksiği gibi), belgeye bilgilendirme için yazar. Sizden bir şey istemez.

**Related documents** — bu belgeyi okuyan belgeler. Bunu değiştirirseniz onlar da yeniden okunur. Henüz yazılmamış olanlar üstü çizili durur.

**Recheck** — belge onaylı ama okuduğu bir belge değişti. Sizin işiniz değil; sırası gelince yeniden okunur ve yalnız gerçekten çelişki varsa size bir istek düşer.

## Çalıştırma, duraklatma, motoru değiştirme

Motor — `claude`, `codex`, `antigravity` ve listedeki diğerleri. 
Sağda, düğmelerin altındaki satır onu neyin çalıştırdığını söyler — `claude · sonnet · high` — ve model seçiciyi açar. 
Ajanı projeyi eklerken seçersiniz ama istediğiniz zaman değiştirebilirsiniz. Kota bittiğinde de yapılacak tek şey değiştirmek. 

- **Pause** yeni adımların başlamasını durdurur; koşan adım da durur.
- **Continue** kaldığı yerden devam eder.
- **Restart** analiz belgelerini siler, `BRIEF.md`'yi olduğu gibi korur. Proje duraklatılmış gelir; **Start** ile yeniden başlar.
- **Archive** biten projeyi rafa kaldırır. Repo'ya dokunmaz.
- **Export documents** yazılmış her belgeyi tikli listeler — **All**, **None** ya da seçin — ve seçtiklerinizi tek bir zip olarak indirir.
- **Remove** `.kortext/` klasörünü (brief dahil), `AGENTS.md`'deki Kortext bloğunu, `CLAUDE.md`'deki işaret satırını ve projenin loglarını siler; projeyi listeden çıkarır. `AGENTS.md` ve `CLAUDE.md`'deki kendi yazdıklarınız kalır.

## El sıkışma

![El sıkışma kartı — üç başlangıç komutu ve isteğe bağlı EXPERIENCE.md teklifi](../assets/panel-handshake.png)

Bütün belgeler onaylandığında analiz biter. Kart size üç başlangıç komutu verir; birini kendi ajanınıza kopyalayın. Ajan `AGENTS.md`'yi ve `.kortext/` belgelerini okuyarak başlar.

Eğer henüz tasarımınız yoksa ve yapay zekaya yaptıracaksanız, isteğe bağlı `EXPERIENCE.md` belgesini talep edebilirsiniz. Tüm belgeleri inceleyip tam bir tasarım brief’i sahibi olursunuz. 

Buradan sonra Kortext işin içinde değildir.

## Neresi nerede

| | |
| --- | --- |
| `~/.kortext/kortext.db` | proje kaydı |
| `~/.kortext/kortext.db.logs/` | her CLI koşusunun ham çıktısı |
| `~/.kortext/kortext.db.log` | arka plan sunucusunun yazdıkları |
| `<repo>/AGENTS.md` | ajanın sözleşmesi, işaretli bir blok içinde |
| `<repo>/.kortext/` | analiz belgeleri; yeni projede `BRIEF.md` de burada |
| `<repo>/.kortext/DESIGN.html` | `DESIGN.md`'nin görsel hali |

> [!WARNING]
> Belgeler projenizin hafızası olan markdown dosyalardır. Commit’leyin. Repo'yu açan bir sonraki ajan bir satır yazmadan önce onları okur. 

[README](README.md) · [INSTALL](INSTALL.md) · [GUIDE](GUIDE.md) · [MACOS](MACOS.md) · [SUPPORT](../../.github/SUPPORT.md) · [SECURITY](../../.github/SECURITY.md) · [CHANGELOG](CHANGELOG.md)
