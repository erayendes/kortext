# Kortext — Kullanım Kılavuzu

🇬🇧 [For English press 9]

Genel bakış README, kurulum INSTALL'da; burası bir proje eklendikten geldikten sonra ne yapılacağını anlatır.

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

Kortext paneli sizi sezgisel olarak yönlendirecektir. 

Projenizin adını ve vermek istediğiniz proje kodunu verdikten sonra yeni projenizin yazılacağı dizini ya da mevcut projenizin olduğu dizini seçin.
Eğer mevcut projenize Kortext’i entegre edecekseniz, çalıştırmak istediğiniz modeli seçip başlatın.
Yeni bir proje içinse sizden brief bekleyecektir. 

> [!IMPORTANT]
> Brief ne yapıldığını, kimin için olduğunu, ürünün hangi dili konuştuğunu, işe yaradığını nasıl anlayacağınızı ve neyin kapsam dışı olduğunu söylemiyorsa analiz başlamaz — sorular gelir ve brief **Action needed**'a düşer. Soruları brief'te yanıtlayın ve onaylayın. Tekrar değerlendirmeye girer.
> **Bu kapı tek bir nedenle vardır.** Üç cümleden ürün gereksinimleri belgesi yazması istenen bir ajan yazar — ürünü uydurur, o kadar. Bir soru bir dakikaya mal olur; uydurulmuş bir ürün bütün analize.

Kortext repo'nun köküne `.kortext/` dizinini ve içine belge iskeletlerini, bir de `AGENTS.md` yerleştirir. `AGENTS.md` zaten varsa içine işaretli bir blok ekler; sizin yazdıklarınıza dokunmaz.

Kortext, belgelerin bağımlılık sırasına uyan bir iş akışında adım adım çalışır. Her adım tek bir belge yazar — `PRODUCT.md`, `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `DESIGN.md`, `GROWTH.md`, `SECURITY.md`, `ENVIRONMENT.md`, `DATABASE.md`, `API.md`, `LEGAL.md`, `CONTENT.md`, `ENGINEERING.md`, `TEST.md`, `EXPERIENCE.md` (isteğe bağlı) — ve bunu bir persona olarak yapar: `product manager`, `architect`, `designer`, `growth expert`, `security engineer`, `DevOps engineer`, `DBA`, `compliance expert`, `copywriter` ve `QA engineer`.

> Bir belge "bu projede buna gerek yok" gerekçesiyle, `not-applicable` olarak işaretlenebilir.

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
- `recheck` → okuduğu bir belge değişti, yeniden okunacak,
- `revision` ilk yazım değil, yeniden yazım

## Bir belgeyi incelemek

Listeden herhangi bir belgeyi açın.

**Approve** — belgenin onayı olur ve kendinden sonrakilerin referansı olur, zincir ilerler.

**Ask** — bir satır seçin ve sorunuzu sorun. Belgeyi yazan persona o pasaj hakkında yanıt verir.
Sorular anlamak içindir, değiştirmek için değil. Bu yüzden kaydedilmezler. Ama tutmak isterseniz **Use this answer**

**Suggest** yazarın önerisini alır.

**Add note** — notlarınız belgenin yeniden yazılmasını sağlar. Belgenin açık sorularından birine bırakılan not o sorunun yanıtı sayılır: soru kaybolur, ortaya koyduğu bilgi ise belgenin parçası olur.

**Edit** — ajana gerek olmayan bir düzletme için dosyayı kendiniz yazın. Sadece metni günceller; değişiklik isteklerini kapatmaz, açık soruları silmez. İstekler varken ikinci bir düğme çıkar: **Save, requests done** — metni kaydeder ve istekleri kapatır.

**Preview** — yalnız `DESIGN.md`'de. Tasarımcının yazdığı token'ların — renkler, yazı tipleri, boşluklar, köşe yarıçapları, gölgeler — gerçeğe döndürülmüş ve görselleştirilmiş hali. Butonun rengini ve kenarlarını görmek HEX ve radius bilgisinden çok daha iyidir. Açık ve karanlık modu da destekler. Repo'nuzda `.kortext/DESIGN.html` olarak da durur.

**Action Needed** — belgenin üstünde. Bu belgenin sizden beklediği her şey, iki grupta toplanır.

*Questions* — belgenin size sordukları. Birine tıklayın, yanıtlayın ve Add note. Tüm sorular yanıtlanmadan belge onaylanamaz.

*Change Requests* — başka belgelerin bu belgeye gönderdiği revize istekleri. Örneğin `ENVIRONMENT`, log satırlarının log-yok kararıyla çeliştiğini söylüyor olabilir. Satırı seçin, **Accept** ya da **Deny**. Deny ise nedenini yazın. Eğer talep anlaşılmıyorsa **Ask** ile isteği yapan belgeye sorun.

Brief'te Accept yoktur — onu bir persona değil siz yazdınız. Satırda onun yerine **Draft the change** durur: ajan, isteği işlenmiş brief'i taslak olarak hazırlar ve editörde açar; **Save** derseniz brief güncellenir, istek kapanır.

**Apply** hepsini tek seferde gönderir. Yanıtlarınız ve kabul ettiğiniz istekler tek seferde yeniden yazıma girer. Reddettiklerinizse nedeniyle birlikte belgenin `## Decisions` bölümüne yazılır.

**Findings** — hiçbir belgenin sahiplenmediği dosyalardaki sorunları (bir `.gitignore` eksiği gibi), belgeye bilgilendirme için yazar. Sizden bir şey istemez.

**Related documents** — bu belgeyi okuyan belgeler. Bunu değiştirirseniz onlar da yeniden okunur. Henüz yazılmamış olanlar üstü çizili durur.

**Recheck** — belge onaylı ama okuduğu bir belge değişti. Sizin işiniz değil; sırası gelince yeniden okunur ve yalnız gerçekten çelişki varsa size bir istek düşer.

## Çalıştırma, duraklatma, motoru değiştirme

Motor — `claude`, `codex`, `antigravity` ve listedeki diğerleri. 
Sağda, düğmelerin altındaki satır onu neyin çalıştırdığını söyler — `claude · sonnet · high` — ve model seçiciyi açar. 
Ajanı’ı projeyi eklerken seçersiniz ama istediğiniz zaman değiştirebilirsiniz. Kota bittiğinde de yapılacak tek şey değiştirmek. 

- **Pause** yeni adımların başlamasını durdurur; koşan adım da durur.
- **Continue** kaldığı yerden devam eder.
- **Restart** analiz belgelerini siler, `BRIEF.md`'yi olduğu gibi korur. Proje duraklatılmış gelir; **Start** ile yeniden başlar.
- **Archive** biten projeyi rafa kaldırır. Repo'ya dokunmaz.
- **Remove** `.kortext/` klasörünü (brief dahil), `AGENTS.md`'deki Kortext bloğunu, `CLAUDE.md`'deki işaret satırını ve projenin loglarını siler; projeyi listeden çıkarır. `AGENTS.md` ve `CLAUDE.md`'deki kendi yazdıklarınız kalır.

## El sıkışma

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