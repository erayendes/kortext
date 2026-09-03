# Kortext — Tasarım Sistemi

> Panelin görsel dili. Hangi renk ne anlama gelir, hangi boy nerede kullanılır, bir düğme
> ne zaman hangi biçimi alır. Canlı hâli: `dev/concepts/` altındaki tasarım sistemi dosyası.
>
> **Açıklamalar Türkçe, token ve sınıf adları İngilizce.** Bir şeyin adı çevrilmez —
> `--fs-body` her dilde `--fs-body`'dir.

---

## 0 · İlkeler

Sonraki her karar bu beşten çıkar.

**Sessiz olan doğrudur.** Kortext bir araç, bir gösteri değil. Bir düzine ajan paralel
çalışırken ekranın sakin, yoğun ve sessiz kalması gerekir. Renk yalnız bir şey söylemesi
gerektiğinde girer; geri kalan her şey nötr.

**Renk anlam taşır.** Yeşil onaydır, kırmızı hatadır, pembe bir taleptir. Dekoratif renk
yok — bir rengi görüyorsan bir sebebi vardır.

**Her token bir işe aittir.** Ölçek değil, rol. `--fs-body` nerede kullanılacağını söyler;
`--fs-13` yalnız bir sayıdır. Sayıyı değil işi seçersin.

**Makine ile insan farklı yazar.** Dosya yolu, id, komut — mono. İnsanın okuduğu her cümle —
Barlow. Karışırsa ikisi de güven kaybeder.

**Tek konfigürasyon.** Kimsenin değiştirmediği ayar, ayar değildir. Tek eksen kaldı: tema,
çünkü insanın fikri olan tek şey o.

**Olmayacaklar:** gradyan yok, emoji yok, dekoratif SVG yok, sol kenarı vurgulu yuvarlak
kart yok, Inter/Roboto yok.

---

## 1 · Tema

Üç durum. **Auto** işletim sistemini takip eder ve ilk açılışın hâlidir. **Light** ve **Dark**
senin seçimindir; sistemi ezer ve hatırlanır. Başka görünüm ayarı yoktur.

```css
:root                    { /* açık — §2 */ }
:root[data-theme='dark'] { /* koyu — §2, aynı adlar başka değerler */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* koyu, ikinci kez */ }
}
```

Koyu değerler iki kez yazılır. Düz CSS'te blok takma adı yoktur; alternatifi — script'in
takıp çıkardığı bir sınıf — sayfa yüklenirken yanlış temayı gösterir, yani her açılışta bir
flaş. Tekrar daha ucuz dürüstlüktür.

`data-theme`'i panel başlığındaki tek kontrol yazar (**Auto · Light · Dark**, §7'nin
segmented control'ü) ve saklar. Nitelik yoksa auto demektir.

> Karanlık tema açığın filtrelenmiş hâli değildir: yüzeyler yükseldikçe açılır, kenarlıklar
> sessiz kalır, renkli zeminler içine renk karışmış bir siyahtır — açık moddaki değerin
> açılmışı değil.

---

## 2 · Renk

### Yüzeyler ve kenarlıklar

Arayüzün zemini. Sıralama önemli: `--bg` en alt katman, `--bg-active` en üst. Bir yüzey ne
kadar yukarıdaysa o kadar açıktır (koyu temada da öyle — orada "açık" demek daha az siyah).

```css
--bg:#ffffff;         /* sayfanın zemini      */  --bg-subtle:#fbfbfc;  /* kart, panel        */
--bg-muted:#f5f5f6;   /* gömük yuva           */  --bg-inset:#f7f7f8;   /* kod kutusu         */
--bg-hover:#f2f2f4;   /* imlecin altındaki    */  --bg-active:#ececef;  /* basılı, seçili     */

--border:#e4e4e7;         /* varsayılan çizgi   */  --border-strong:#d4d4d8;  /* kontrol kenarı */
--border-faint:#eeeef1;   /* ayraç              */  --border-hover:#c6c6cc;   /* imleç altı     */
--scroll-thumb:#e0e0e4;
```

> 12 adımlı gri rampa kaldırıldı. Semantik token'ları hiç beslemiyordu — onlar zaten düz
> hex — yani başka yerde yazılı değerlerin on iki kopyasıydı ve yalnız ikisi kullanılıyordu.
> O ikisi yukarıda, işiyle adlandırılmış hâlde.

### Metin

Dört basamak. Aşağı indikçe önem azalır — `--fg` okunması gereken, `--fg-faint` orada
olduğu bilinsin yeter.

```css
--fg:#18181b;        /* ana metin   */  --fg-secondary:#51515a;  /* açıklama */
--fg-muted:#71717a;  /* etiket, meta */  --fg-faint:#a3a3ad;      /* en sessiz */
```

### Vurgu

Tek vurgu rengi, o da nötr. Kortext bir marka gösterisi değil; birincil eylem siyahtır,
çünkü dikkat çekmesi gereken tek şey odur.

```css
--accent:#18181b; --accent-hover:#000000; --accent-fg:#ffffff;
--accent-tint:#f4f4f5; --accent-tint-border:#e2e2e6; --accent-ring:rgba(24,24,27,0.16);
```

Koyu temada `--accent-hover` **daha koyu** olmalı, daha beyaz değil: orada accent zaten
neredeyse beyazdır (`#ededef`), `#ffffff` hover'ı hiçbir yere götürmez. Açık zeminli bir
kontrol tepki vermek için kararır.

```css
:root[data-theme='dark'] { --accent:#ededef; --accent-fg:#0a0a0b; --accent-hover:#cfcfd4; }
```

### Durum renkleri

Arayüzdeki **tek** nötr olmayan renkler. Her biri üçlü gelir: metin, zemin, kenarlık. Bu
setin dışında bir durum rengi icat edilmez.

```css
--green:#157a52;  --green-bg:#eaf5ef;  --green-border:#cfe9dd;   /* onaylandı, geçti      */
--amber:#9a6a16;  --amber-bg:#faf2e2;  --amber-border:#ecdcb8;   /* sıra sende, duraklatıldı */
--red:#c5392f;    --red-bg:#fbeceb;    --red-border:#f1cfcc;     /* düştü, yıkıcı         */
--blue:#2563c9;   --blue-bg:#eaf1fc;   --blue-border:#cfe0f6;    /* yazılıyor, bilgi      */
--violet:#5b4bcc; --violet-bg:#efedfb; --violet-border:#dad5f4;  /* incelemede            */
--pink:#c02a72;   --pink-bg:#fdebf3;   --pink-border:#f6cede;    /* talep, hareketli girdi */
```

---

## 3 · Tipografi

İki aile. **Barlow** insanın dilini yazar — başlık, cümle, düğme. **Overpass Mono** makinenin
sahip olduğu her şeyi — dosya yolu, id, komut, zaman damgası. Ölçüt basit: kullanıcı ezberden
yazamıyorsa mono.

```css
--font-sans:'Barlow', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono:'Overpass Mono', ui-monospace, 'SF Mono', Menlo, monospace;
```

### Yedi rol

Ölçek sayıyla değil **görevle** adlandırılır. "Hangi boyu kullanayım?" sorusunun cevabı
vardır: kart adı yazıyorsan `heading`, buton yazıyorsan `ui`.

```css
--fs-title:18px;    /* sayfanın veya belgenin tek başlığı        h1 */
--fs-section:16px;  /* belge içindeki bölüm                      h2 */
--fs-heading:14px;  /* kart adı, drawer başlığı, panel başı      h3 */
--fs-body:13px;     /* düzyazı, input — taban                        */
--fs-ui:12px;       /* buton, kontrol, panel kromu                   */
--fs-label:11px;    /* meta, id, sayaç, footer                       */
--fs-micro:10px;    /* rozet, mono eyebrow                           */
```

Taban: `font-family:var(--font-sans); font-size:var(--fs-body); line-height:1.5; color:var(--fg);`
Rakamlar için `font-feature-settings:"cv01","ss01","tnum";` — tabular, yani bir sütunda alt
alta gelen sayılar hizalanır.

**İki sözlük, tek ölçek.** Panel kromu rol adıyla konuşur — `Dismiss` düğmesi bir başlık
değildir. Belgenin içindeki markdown h1/h2/h3 der. İkisi aynı yedi boyu paylaşır, farklı
kelimelerle.

### Ağırlık

`400` gövde · `500` kontrol ve etiket · `600` bölüm başlığı · `650` sayfa başlığı.

### Mono

Mono, yanındaki düzyazıyla **aynı boyu** kullanır. `.mono` sınıfı yalnız aileyi değiştirir.

---

## 4 · Boşluk

Altı adım, hepsi 4'ün katı. Aradaki değerler yoktur — 13px diye bir boşluk yoksa arayüz
kendi kendine hizalanır.

```css
--sp-1:4px;   /* ikon ile yazı arası        */  --sp-4:16px;  /* bölüm içi     */
--sp-2:8px;   /* kontrol içi, küçük boşluk  */  --sp-5:24px;  /* bölümler arası */
--sp-3:12px;  /* kart içi padding           */  --sp-6:32px;  /* sayfa kenarı  */
```

---

## 5 · Köşe, gölge, hareket

```css
--r-sm:4px;    /* kontrol */   --r-md:8px;   /* kart  */
--r-lg:12px;   /* panel   */   --r-pill:999px; /* rozet */

--shadow-xs:0 1px 1px rgba(24,24,27,0.03);                                  /* sayfadan az yukarıda */
--shadow-lg:0 6px 18px rgba(24,24,27,0.07), 0 1px 3px rgba(24,24,27,0.04);  /* sayfanın üstünde     */
:root[data-theme='dark'] { --shadow-lg:0 6px 18px rgba(0,0,0,0.5); }

--speed:130ms;  --ease:cubic-bezier(0.2, 0, 0, 1);
```

İki yükseklik yeter: bir şey ya sayfadan **hafifçe ayrık**tır (kontrol), ya da **üstünde
durur** (drawer, popover). Arası yoktur.

Hareket işlevsel: 130ms geçiş, ve "canlı" için tek bir yavaş nabız (1.8s). Başka animasyon yok.

---

## 6 · Butonlar

Tek boy. İki aile: **solid** kutusunu hep gösterir, **link** ancak üstüne gelince gösterir —
ve o an solid ikizine dönüşür. Bir ekranda yalnız **bir** birincil düğme olur.

`.btn` her kontrolün taşıdığı **tabandır**: boyut, font, odak halkası, pasif hâl. Tek başına
kullanılmaz; üstüne her zaman bir varyant biner ve **hover varyantındır**. Tabanın kendi
hover'ı yoktur — orada bir kural varyantınkini sessizce ezerdi.

```css
.btn { display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:var(--control-h-sm); padding:0 9.6px;
  font-family:inherit; font-size:var(--fs-ui); font-weight:500; line-height:1;
  border-radius:var(--r-sm); border:1px solid transparent;
  background:var(--bg); color:var(--fg); cursor:pointer; white-space:nowrap; user-select:none;
  transition:background var(--speed) var(--ease), border-color var(--speed) var(--ease),
             box-shadow var(--speed) var(--ease), color var(--speed) var(--ease); }
.btn:focus-visible { outline:none; box-shadow:0 0 0 3px var(--accent-ring); }
.btn:hover { background:none; border-color:transparent; }   /* hover varyantındır */
.btn[disabled] { opacity:0.45; pointer-events:none; }        /* tek kural, her varyant */

/* solid — kutusu hep orada */
.btn-primary         { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
.btn-primary:hover   { background:var(--accent-hover); border-color:var(--accent-hover); }
.btn-secondary       { background:var(--bg); color:var(--fg); border-color:var(--border-strong); box-shadow:var(--shadow-xs); }
.btn-secondary:hover { background:var(--bg-active); border-color:var(--border-hover); }
.btn-success         { background:var(--green-bg); color:var(--green); border-color:var(--green-border); }
.btn-success:hover   { background:var(--green-bg); color:var(--green); border-color:var(--green); }
.btn-danger          { background:var(--red-bg); color:var(--red); border-color:var(--red-border); }
.btn-danger:hover    { background:var(--red-bg); color:var(--red); border-color:var(--red); }

/* link — duruşta kutusu yok, üstüne gelince solid ikizi */
.btn-link-primary, .btn-link-success, .btn-link-danger {
  height:var(--control-h-sm); padding:0 9.6px; border-radius:var(--r-sm);
  background:none; border-color:transparent; }
.btn-link-primary       { color:var(--fg-secondary); }
.btn-link-primary:hover { background:var(--bg-active); border-color:var(--border-strong); color:var(--fg); }
.btn-link-success       { color:var(--green); }
.btn-link-success:hover { background:var(--green-bg); border-color:var(--green-border); color:var(--green); }
.btn-link-danger        { color:var(--red); }
.btn-link-danger:hover  { background:var(--red-bg); border-color:var(--red-border); color:var(--red); }

/* tek istisna: 6px padding'li çipin içindeki × */
.btn-x       { height:auto; padding:0 4px; font-size:var(--fs-heading); margin-left:auto;
               background:none; border-color:transparent; color:var(--fg-faint); }
.btn-x:hover { background:none; border-color:transparent; color:var(--fg-secondary); }
```

| varyant | ne zaman |
|---|---|
| `.btn-primary` | ekrandaki asıl eylem — devam ettiren tek düğme |
| `.btn-secondary` | alternatif eylem — vazgeç, kapat, reddet |
| `.btn-success` | onaylama — yalnız **Approve** |
| `.btn-danger` | geri alınamayan işlem |
| `.btn-link-primary` | ikincil, sessiz — Close, Edit, Ask, Add note |
| `.btn-link-success` | olumlu ama sessiz — Archive |
| `.btn-link-danger` | yıkıcı ama sessiz — tehlike bölgesi |
| `.btn-x` | çip içindeki ×. Aileyi taşır, boyunu taşımaz; hover'ı yoktur çünkü nişan aldığın bir kontrol değil, okuduğun bir satırda durur |

**Eylem sırası** bir talebin altında: `Apply · Dismiss · Add note · Ask` — önce karar, sonra
karara ek, en sonda soru.

---

## 7 · Girdiler

```css
--control-h:36px;      /* input, select */
--control-h-sm:29px;   /* her buton — §6, tek boy vardır */

.input,.select { height:var(--control-h); width:100%; padding:0 10px; font-size:var(--fs-body);
  border:1px solid var(--border-strong); border-radius:var(--r-sm);
  background:var(--bg); color:var(--fg); }
.input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-ring); }
.input::placeholder { color:var(--fg-faint); }

.seg { display:inline-flex; padding:2px; gap:2px; background:var(--bg-muted);
  border:1px solid var(--border); border-radius:var(--r-md); }
.seg button { height:29px; padding:0 11px; border:none; background:transparent;
  font-family:inherit; font-size:var(--fs-ui); font-weight:500; color:var(--fg-muted);
  border-radius:calc(var(--r-md) - 2px); cursor:pointer; white-space:nowrap; }
.seg button:hover { color:var(--fg-secondary); }
.seg button.on { background:var(--bg); color:var(--fg); box-shadow:var(--shadow-xs); }
```

Segmented control, aralarından **birinin** seçili olduğu durumlar içindir. Üç düğme "hangisine
basıldı?" diye sordurur; segment "hangisi açık" diye gösterir. Tema anahtarı budur.

---

## 8 · Durum sözlüğü

Sistemin kalbi. Bir belge **tam olarak bir durumdadır** — bu onun nerede olduğudur. Üstüne
binen rozetler ise **ne borcu olduğunu** söyler. İki farklı soru, o yüzden iki ayrı gösterim.

### Durumlar — biri, yalnız biri

| durum | ne demek | renk |
|---|---|---|
| `waiting` | sırasını bekliyor, zincir henüz gelmedi | nötr |
| `writing` | ajan şu an yazıyor | mavi, yavaş nabız |
| `paused` | yazım durduruldu | amber |
| `pending` | yazıldı, onayını bekliyor | mor |
| `approved` | onayladın | yeşil |
| `n/a` | değerlendirildi, bilerek atlandı | rozetsiz, silik çerçeve |

`n/a` bir renk değildir, rengin yokluğudur: metnin kendi mürekkebinde bir çerçeve, palete
katılmadan "atlandı" der.

### Rozetler — durumun üstüne biner

| rozet | ne demek | renk |
|---|---|---|
| `failed` | son deneme düştü, sebep belgede yazıyor | kırmızı |
| `change request` | başka bir belge bunun değişmesini istiyor | pembe |
| `dependent` | girdisi oynuyor; oturunca yeniden okunacak | pembe, içi boş |

**Rozet grubu ezer.** `failed` ve `change request` taşıyan belge, durumu ne olursa olsun
**Needs you**'ya çıkar. Tek istisna `dependent`: o bir iş değil haberdir, belgeyi yerinden
oynatmaz.

### Gruplar

`Needs you` → `In progress` → `Next` → `Approved` → `Not applicable`. Son ikisi varsayılan
kapalıdır: biri bitmiş, öteki bilerek atlanmış.

---

## 9 · Satırlar ve kartlar

Belge satırının okuma sırası soldan sağa: **adı**, **yazarı**, **ne borcu var**, **nerede**.
Durum en sağdadır çünkü en son bakılan şeydir — önce hangi belge olduğunu, sonra sende bir iş
olup olmadığını görürsün.

```html
<button class="kx-doc-row">
  <span class="kx-doc-name">API</span>
  <span class="kx-doc-author mono">architect</span>
  <span class="kx-doc-spacer"></span>
  <span class="kx-badge kx-badge-change">change request</span>
  <span class="kx-status kx-status-approved">approved</span>
</button>
```

Komut kartı (`.kx-cmd-card`) tıklanınca içeriğini kopyalar; ipucu kartın içinde yazar,
ayrı bir düğme yoktur.

---

## 10 · Bantlar

Belgenin üstünde duran bilgi şeritleri. **Rengi, kimin sırada olduğunu söyler.**

Panel başlığı tek satır: **Kortext | project brain: [motor]**. Tema anahtarı footer'da —
bir kez kurulup unutulan bir ayar, her ekranda üstte durmasın.

| bant | renk | anlamı |
|---|---|---|
| Hazırlık kapısı `.kx-gate` | mavi zemin + mavi yazı, çerçevesiz | sistem okuyor |
| Talep `.kx-doc-changebar` | pembe zemin, pembe çerçeve ve yazı | bir karar bekleniyor |
| Bağımlılık `.kx-doc-dependbar` | zeminsiz, düz pembe çerçeve | yalnız haber |
| Açık soru `.kx-doc-askbar` | amber | sende, ve onayı kilitler |

Talep bandı `change request` rozetiyle **aynı rengi** taşır: satırda rozeti görüp belgeyi
açtığında aynı pembeyi bulursun. Bağımlılık bandı da `dependent` rozetinin büyük hâlidir —
içi boş, çerçeveli.

---

## 11 · Belge görünümü

Panelin render ettiği markdown. Aynı yedi boyu kullanır: gövde `--fs-body`, başlıklar
`--fs-title` / `--fs-section` / `--fs-heading`.

İki tür borç, iki renk:

- **amber blok** (`.open-q`) → `## Open Questions for prime` — senin cevaplaman gereken
- **pembe blok** (`.req-q`) → `## Revision Requests` — başka bir belgeye yazılmış talep

İkisi aynı rengi paylaşırsa hangisinin sende olduğu kaybolur.

---

## 12 · Yazı dili

- **Başlıklar, kod, adlar — her zaman İngilizce.** Bölüm başlıkları yapıdır ve başka belgeler
  onlara adıyla atıf yapar. Dosya adı, komut, tablo kolonu, API yolu, branch adı da öyle.
- **Düzyazı brief'in dilinde.** Belgeyi okuyan insan hangi dili konuşuyorsa o.
- **Ürün metni arayüz dilinde.** Kullanıcının okuduğu her string — buton yazısı, hata mesajı,
  e-posta. Bu, belgenin dilinden farklı olabilir.
- **Bir şeyin adı çevrilmez.** `PRD.md` her dilde `PRD.md`'dir.

---

## 13 · Kurallar

**Yap**
- Token'dan kur — bir token'ın karşıladığı değeri elle yazma
- Ekranda tek birincil düğme bırak
- Yıkıcı eylemi sayfanın en altına, sessiz link olarak koy
- Durum ile borcu ayrı göster
- Makinenin sahip olduğu her şeyi mono yaz
- Açık temayı varsayılan tut, koyuyu her değişiklikte kontrol et

**Yapma**
- Yeni bir durum rengi icat etme — set kapalı
- Persona veya kategori için renk üretme
- Yarım piksel boy kullanma
- Aynı ekranda iki farklı düğme boyu kullanma
- Bir uyarıyı yalnız renge yükleme — metni de söylesin
- Gradyan, emoji, dekoratif SVG kullanma

---

## Ek A — Bu sistemden çıkanlar (2026-09-03)

| çıkan | sebep |
|---|---|
| `data-accent` · `data-density` · `data-radius` | Panel hiçbirini yazmıyordu; üçü de hiç değişemezdi. Ölçekledikleri değerler artık düz. |
| 12 adımlı gri rampa | Semantik token'ları beslemiyordu, ikisi kullanılıyordu. O ikisi `--border-hover` ve `--scroll-thumb` oldu. |
| 10 persona rengi (`--a-*`) | v6 dashboard'ıyla birlikte öldü. Persona bugün mono gri bir handle. |
| `--shadow-sm/md/pop` · `--r-xl` · `--row-h` · `--pad-x` · `--gap` | Hiç kullanılmadı. |
| `.btn-sm` | 21 kullanımın 19'undaydı — neredeyse hep açık olan bir modifier, modifier değildir. Küçük boy artık boyun kendisi. |
| `.btn-ghost` · `.btn-icon` | Tanımlıydı, hiç kullanılmadı. |
| Çıplak `.btn` varyantı | Duruşta kutusu olmayınca link'in ta kendisiydi. |
| `.kx-link*` ailesi | `.btn-link*` oldu ve 10.5px mono olmaktan çıktı — buton olan bir link buton gibi okunmalı. |
| `--fs-11 … --fs-40` | On token, yedi rol oldu. |
| §7'nin eski sözlüğü (16 persona, gate kareleri, board kolonları, item tipleri) | v6 ekranlarına aitti; v1.0'da karşılıkları yok. Yerine §8. |
| Lucide ikon haritası | Panel hiç SVG ikon kullanmıyor; birkaç metin glifi (`▶ ⏸ × ← →`) yeterli oldu. |

## Ek B — Uygulandı (2026-09-03)

Bu dokümanın tarif ettiği ama stil dosyasının uygulamadığı beş kalem vardı. Hepsi kapandı:

| kalem | ne yapıldı |
|---|---|
| **§3 yedi rol** | `--fs-*` token'ları tanımlandı, canlı kurallardaki **75** elle yazılmış boy role bağlandı. Yarım pikseller en yakın role yuvarlandı. Canlı kuralda elle yazılmış boy kalmadı. |
| **§4 boşluk ölçeği** | `--sp-1 … --sp-6` tanımlandı. |
| **§6 buton seti** | Yeni taban (tek boy, hover'sız), dört solid + üç link varyantı, `.btn-x`. `.btn-sm` ve `.kx-link*` çağrı yerleri taşındı; çıplak `.btn` kalmadı — hepsi `btn-link-primary` oldu. Talep eylemleri §6'nın sırasına geçti: **Apply · Dismiss · Add note · Ask**. |
| **§7 `.seg`** | v6'dan beri tanımlıydı, yazıldı. İlk kullanıcısı tema anahtarı. |
| **sekmeler** | `.kx-tab` de buton ailesine girdi (`btn btn-link-primary`); alt çizgi "hangisi açık"ı söylemeye devam ediyor. |
| **§1 tema** | `prefers-color-scheme` medya sorgusu + `data-theme` override. Panel başlığında **Auto · Light · Dark**; seçim `localStorage`'da. **Karanlık tema panelde ilk kez görünür oldu** — 54 token'lık blok bugüne dek erişilemiyordu. |

> Ek A'daki kaldırmalar **uygulanmadı**: eski token'lar (`--gray-*`, `--a-*`, `--fs-*`'in
> eski hâli yoktu zaten, `--shadow-sm/md/pop`, `--r-xl`, `data-accent/density/radius`) yerinde
> duruyor, çünkü henüz silinmemiş v6 CSS'i onlara dayanıyor. Ölü CSS turunda birlikte gidecekler.

