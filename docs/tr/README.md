<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/kortext-logo-dark.svg">
    <img src="../assets/kortext-logo-light.svg" alt="Kortext" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kortext"><img alt="npm" src="https://img.shields.io/npm/v/kortext.svg"></a>
  <a href="https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml"><img alt="CI" src="https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml/badge.svg"></a>
  <img alt="Node" src="https://img.shields.io/node/v/kortext">
  <a href="../../LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <a href="https://milowda.com"><img alt="Yerli üretim" src="https://img.shields.io/badge/YERL%C4%B0%20%C3%9CRET%C4%B0M-red?style=flat&label=%F0%9F%A4%9D&color=red&link=https%3A%2F%2Fmilowda.com"></a>
</p>

🇬🇧 [For English press 9](../../README.md)

Yapay zekayla ürün geliştirirken yaşadığım iki temel sorun var.

1. Proje durumunu görsel olarak takip edememek.
2. Bir noktada el sıkıştığımız kurallardan uzaklaşıp serbest gezen tavuğa bağlayıp doğaçlama yapması.

Biliyorum, siz de bu durumu yaşıyorsunuz, sadece henüz adını koyamadınız.

Ama ben koydum. Adı **Kortext**.

Kortext, ürün geliştirmeye başlamadan önce — arzu ettiğiniz demokrasi çerçevesinde — yapay zekayla el sıkıştığınız bir ürün anayasası.

Verdiğiniz **`BRIEF.md`** üzerinden alanında **uzman 10 farklı persona**nın hazırladığı **14 mimari belge**den oluşan anayasa sayesinde, modelin projenin gerçeğinden çıkmasını engelliyor.

Kullanımı basit ama kapsamlı.

- Muhteşem sadelikteki arayüzden proje bilgileri ve iş kapsamını girin.

- Personaların hazırladığı her bir belge onayınıza sunulur. 

- Pürüzsüz bir deneyim ya da denetim için üretilen belgeleri okuyun. Belgelerde size sorular gelebilir. Siz açıklama ya da değişiklik isteyebilirsiniz.

- Eğer istediğiniz değişiklik bir başka belgede değişiklik gerektiriyorsa, o belge tekrar pipeline’a girer.

- Anayasa belli olduktan sonra hangi yapay zekayı kullanıyorsanız süreci onunla dilediğiniz gibi yürütebilirsiniz.

Bu arada, daha önce başlamış projeleri de unutmadım. Kortext, mevcut kod tabanını analiz ederek oradan da başlayabiliyor.

## Bundan sonrası DAHA meraklısına

Tek bir insan rolü var, **Prime**. Diğer personalar; product manager, architect, designer, growth expert, security engineer, DevOps engineer, DBA, compliance expert, copywriter ve QA engineer.

**BRIEF.md**, sizin verdiğiniz belge. Bu belgeden referansla Kortext’in ürettiği belgeler; `PRODUCT.md`, `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `DESIGN.md`, `GROWTH.md`, `SECURITY.md`, `ENVIRONMENT.md`, `DATABASE.md`, `API.md`, `LEGAL.md`, `CONTENT.md`, `ENGINEERING.md`, `TEST.md`

`BRIEF.md`'nin bir örneği var. Eğer yazdığınız brief yeterli değilse, bunu belirtiyor.

Mevcut bir projeyi Kortext'e eklediğinizde, projenin durumuna ve gidişatına göre yeni öneriler sunabilir. Ukala.

Kendi yapay zeka ajanınızı çalıştırıyorsunuz. 

Fena zaman token tüketmiyor ama sonradan boşa gidecek tokenların ve zamanın önüne geçiyor. Toplamda çok daha karlı.

Kortext hiçbir bilgi almıyor, telemetry tutmuyor. Ama ne kadar kullanılacağını çok merak ediyorum. 

## Nasıl Çalışır

<p align="center">
  <img src="../assets/panel-documents.png" alt="Analiz sürerken: belgeler bağımlılık sırasında, her birinin yazarı ve durumu" width="880">
</p>

1. Proje klasörünü ve hangi ajan CLI'ıyla çalışacağını seçin. Bu seçim projeye aittir; iki projeniz iki ayrı CLI'da rahatça çalışabilir. *Yeni proje* formda yazdığınız ya da yüklediğiniz bir brief'le başlar, *mevcut proje* ise doğrudan mevcut koddan başlar.

2. Kortext repo'nun köküne `.kortext/` dizinini ve içine belge iskeletlerini, bir de `AGENTS.md`'yi yerleştirir. `AGENTS.md` zaten varsa içine işaretli bir blok ekler; sizin yazdıklarınıza dokunmaz.

3. Kortext, ajan CLI'ınızı belgelerin bağımlılık sırasına uyan bir iş akışında adım adım çalıştırır. Her adım tek bir belge yazar — ARCHITECTURE, STACK, SECURITY, DATABASE, DESIGN, LEGAL… — ve bunu bir persona olarak yapar: mimar, güvenlik mühendisi, tasarımcı.
   Her belge `draft` olarak gelir ve onaylamadığınız bir belge asla yazılmaz.

4. Herhangi bir belgeyi açın. Onaylayabilirsiniz; bir satır seçip “bunu neden böyle yazdın?" diye sorabilirsiniz (bu sohbet geçicidir, hiçbir yere yazılmaz); ya da notlar bırakıp revizyon isteyebilirsiniz. Revizyon istediğinizde belge yeniden koşar. 
   
5. Bütün belgeler onaylandığında ya da gerek yok dendiğinde analiz bitmiştir. Belgeler artık projenin anayasası, `AGENTS.md` de devir teslim metnidir. Başlangıç komutlarından birini kendi istemcinize — CLI ya da uygulama, hangisini kullanıyorsanız — kopyalayın ve yapmaya başlayın.

> Bir belge "bu projede buna gerek yok" diyerek, gerekçesiyle, `not-applicable` olarak da kapanabilir.

## Kurulum

**Node 22 veya üstü** ve PATH'inizde en az bir ajan CLI'ı olsun yeter
(`claude`, `codex`, `antigravity` ya da bir başkası).

Sonrası terminale yazacağınız hepi topu tek bir komut; `npm install -g kortext`

> npm artık paketlerin kurulum betiklerini kendiliğinden çalıştırmıyor. Kortext'in SQLite bağlayıcısı yaygın platformlar için hazır derlenmiş geldiğinden bu komut çoğu zaman yeter.
`kortext` açılıp da veritabanını açamazsa, betiğe bir kerelik izin vererek yeniden kurun:

```sh
npm install -g --allow-scripts=better-sqlite3 kortext
```

Kurulum bittikten sonra `kortext` yazın. Sunucu ayağa kalkar, tarayıcınız açılır ve Kortext paneli karşınıza gelir. Hepsi bu.

> Sunucu 3441 portunu kullanır; isterseniz `--port` ile değiştirebilirsiniz.
> Verileriniz tek bir global SQLite veritabanında durur: `~/.kortext/kortext.db`. Onu da `--db` ile değiştirebilirsiniz.

<details>
<summary><b>Gereksinimler</b></summary>
<br/>

### Node.js `22`ve npm `10`

<details>
<summary><b>macOS için Node 22</b></summary>

```sh
brew install node@22
```
</details>

<details>
<summary><b>Windows için Node 22</b></summary>

> **Windows desteği deneyseldir.** Kortext macOS ve Linux'ta geliştiriliyor ve orada test ediliyor. Windows'a özgü kısımlar — ajan CLI'ını `where` ile bulmak, npm'in kurduğu `.cmd` shim'ini çalıştırmak — belgelenmiş davranışa göre yazıldı ama gerçek bir Windows’ta koşturulmadı. Bir şey çalışmazsa lütfen [bir issue açın](https://github.com/erayendes/kortext/issues); sorun sizin kurulumunuz değil, benim eksiğimdir.

Node 22'yi **nodejs.org**'dan kurun (v22.x etiketli LTS). *Tools for Native Modules* ekranında **"Automatically install the necessary tools"** kutusunu işaretleyin; Kortext'in SQLite bağlayıcısının bunlara ihtiyacı var.

Global kurulumda `EACCES` ya da izin hatası alırsanız, yönetici kabuğu açmak yerine npm'in global klasörünü kendi klasörünüze çevirin:

```powershell
npm config set prefix "$env:APPDATA\npm"
```

ve `%APPDATA%\npm`'i `PATH`'inize ekleyin.
</details>

<details>
<summary><b>Linux</b></summary>

```sh
sudo apt install -y curl build-essential python3      # SQLite bağlayıcısı için gcc/make
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 22 && nvm alias default 22
```

`sudo npm install -g` yapmayın. `EACCES` görürseniz:
`npm config set prefix ~/.npm-global`, sonra `~/.npm-global/bin`'i `PATH`'inize ekleyin.
</details>

### Ajan CLI’ı

```sh
npm install -g @anthropic-ai/claude-code    # claude
npm install -g @openai/codex                # codex
npm install -g @google/gemini-cli           # gemini
```

> [!NOTE]
> Kortext'e anahtar vermezsiniz; zaten kullandığınız CLI'ın aboneliğini kullanır. Cursor, Copilot, OpenCode, Amp, Droid, Goose, Qwen Code ve Cline için de tanımlar hazır.

</details>

## Başlatma ve durdurma

Kortext’i başlattıktan sonra terminal penceresini kapatabilirsiniz; Kortext arka planda çalışmaya devam eder. 

Durdurmak için panelin durum çubuğundaki ⏻ düğmesine basın. 

Yeniden başlatmak için tekrar `kortext` yazmanız yeter.

```sh
kortext              # arka planda başlat, paneli aç
kortext --stop       # arka plandaki sunucuyu durdur
kortext --no-detach  # bu terminalde tut, Ctrl+C ile durdur
```

Ne düğme ne `--stop` koşan bir adımı yarıda keser; biri sürerken beklemenizi ister. Böylece bir analiz yazımın ortasında kesilmez.

Arka plandaki sunucunun yazdıkları `~/.kortext/kortext.db.log` dosyasında birikir.

## Güncelleme ve kaldırma

Yeni bir sürüm çıktığında panel başlığın altında bir şeritle haber verir. **Update now** düğmesi kurulumu sizin yerinize yapar; yeni sürüm, kortext'i kapatıp yeniden açtığınızda devreye girer. Düğme, koşan bir adım varsa dosyaları onun altından değiştirmez, bitmesini bekler. Elle yapmak isterseniz, ya da düğme hata verirse:

```sh
npm update -g kortext
npm uninstall -g kortext
```

Kaldırmak yalnızca programı siler. Proje kaydınız ve loglar `~/.kortext/`'te, belgeleriniz de repo'nuzda olduğu gibi kalır. Tertemiz bir başlangıç istiyorsanız ikisini de kendiniz silin.

## Geliştirme

```sh
npm install && npm --prefix ui install
npm run dev        # sunucu :3441 (tsx watch)
npm run dev:web    # vite panel :3442 (proxy /api → 3441)
npm test           # node:test takımı
npm run typecheck  # sunucu + panel
npm run format     # prettier yazar; format:check doğrular (CI bu kontrolü çalıştırır)
npm run build      # tsc → dist/ + vite → ui/dist/
```

Issue ve pull request’leriniz için — bkz. [CONTRIBUTING](../../.github/CONTRIBUTING.md),
[SUPPORT](../../.github/SUPPORT.md) ve [güvenlik politikası](../../.github/SECURITY.md).

Kortext ücretsizdir ve MIT lisanslıdır. İşinizde bir yer edinirse,
[sponsor olmanız](https://buymeacoffee.com/erayendes) bakımının sürmesini sağlar.

## Belgeler

[Kılavuz](GUIDE.md) — panelin anlatımı · [Değişiklik günlüğü](CHANGELOG.md)

## Lisans

MIT © Eray Endes
