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

**Yapay zekâ destekli geliştirmenin proje beyni.** Kortext bir brief'i (ya da mevcut bir kod
tabanını) onaylı bir analiz temeline çevirir — ve bunu yazması için **senin** kodlama ajanını
(Claude Code, Codex, Gemini CLI…) sürer. Analiz boyunca panelden çıkmazsın: belgeler taslak
olarak iner, sen onaylar, not düşer ya da revizyon istersin; zincir senin onaylarınla ilerler.
Her belge yerine oturduğunda Kortext çekilir — belgeler projenin kılavuzu olur, `AGENTS.md`
ajanına sözleşmeyi teslim eder.

Kortext'in API anahtarı yoktur ve kendi adına hiçbir LLM API'sini çağırmaz — zaten kurulu olan
ve ücretini ödediğin ajan CLI'ını, repo'nun içinde, arayüzsüz çalıştırır.

<p align="center">
  <img src="../assets/panel-documents.png" alt="Analiz sürerken: belgeler bağımlılık sırasında, her birinin yazarı ve durumu" width="880">
</p>

## Nasıl çalışır

1. **Proje ekle.** Repo klasörünü ve çalışacağı ajan CLI'ını seç — seçim projeye aittir, iki
   proje iki ayrı CLI'da durabilir. *Yeni proje* formda yazdığın ya da yüklediğin bir brief'ten
   başlar; *mevcut proje* doğrudan koddan. Kortext repo köküne `AGENTS.md`, `.kortext/` altına
   belge iskeletlerini kurar.
2. **Analiz.** Kortext ajan CLI'ını, bağımlılık kapılı bir iş akışında adım adım çalıştırır.
   Her adım bir belge yazar (ARCHITECTURE, STACK, SECURITY, DATABASE, DESIGN, LEGAL, …), bir
   persona olarak (architect, security-engineer, …), ve `draft` olarak indirir. Girdilerini
   onaylamadığın bir belge asla yazılmaz. Birbirinden bağımsız en fazla üç adım paralel koşar;
   onayın zinciri uyandırır.
3. **Panelde incele.** Herhangi bir belgeyi aç: onayla, bir satır seçip yazar personaya sor
   (geçici soru-cevap — hiçbir şey kaydedilmez) ya da not bırakıp revizyon iste (üreten adım
   notlarınla yeniden koşar). Bir belge gerekçesiyle `not-applicable` olarak da yerine oturabilir.
4. **El sıkışma.** Her belge onaylandığında ya da uygulanamaz sayıldığında analiz tamamdır.
   Belgeler artık projenin dokunulmaz kılavuzu, `AGENTS.md` devir anayasasıdır. Başlangıç
   komutlarından birini istemcine (CLI ya da uygulama) kopyala ve inşaya başla.

## Gereksinimler

| | en az | neden |
| --- | --- | --- |
| **Node.js** | 22 | çalışma ortamı |
| **npm** | 10 | Node 22 ile gelir |
| **Bir ajan CLI'ı** | aşağıdaki dörtten biri | Kortext'in sürdüğü motor |

Kortext anahtar tutmaz: zaten kullandığın CLI'ın arkasındaki aboneliği harcar. Hangisiyse onu
kur — Kortext için hepsi eşittir, `PATH`'inde hangisini bulursa onu alır (Cursor, Copilot,
OpenCode, Amp, Droid, Goose, Qwen Code ve Cline de hazırdır; gerçek bir makinede belge
yazana kadar *untested* işaretiyle). Git gerekmez.

```sh
npm install -g @anthropic-ai/claude-code    # claude
npm install -g @openai/codex                # codex
npm install -g @google/gemini-cli           # gemini
# antigravity: Antigravity uygulamasını kur, sonra `agy install`
```

## Kurulum

```sh
npm install -g kortext
```

npm artık paketlerin kurulum betiklerini varsayılan olarak çalıştırmıyor. Kortext'in SQLite
bağlayıcısı yaygın platformlar için derlenmiş ikililerle geldiğinden bu genellikle yeterlidir;
`kortext` açılıp veritabanını açamazsa betiğe bir kerelik izin vererek kur:

```sh
npm install -g --allow-scripts=better-sqlite3 kortext
```

Node 22'nin kendisi, platforma göre:

<details>
<summary><b>macOS</b></summary>

```sh
brew install node@22
```

Birden çok Node sürümü mü? `brew install fnm && fnm install 22 && fnm default 22`.
</details>

<details>
<summary><b>Windows</b> — deneysel</summary>

> **Windows desteği deneyseldir.** Kortext macOS ve Linux'ta geliştirilir ve test edilir.
> Windows yolları — ajan CLI'ını `where` ile bulmak, npm'in kurduğu `.cmd` shim'ini çalıştırmak —
> belgelenmiş davranıştan yazıldı, Windows'ta koşturulmadı. Bir şey çalışmazsa
> [issue aç](https://github.com/erayendes/kortext/issues); bu bir eksik, senin kurulumun değil.

Node 22'yi **nodejs.org**'dan kur (v22.x etiketli LTS). *Tools for Native Modules* ekranında
**"Automatically install the necessary tools"** kutusunu işaretle — Kortext'in SQLite
bağlayıcısı bunlara ihtiyaç duyar.

Global kurulumda `EACCES` ya da izin hatası mı? Yönetici kabuğu yerine npm'in global
öneki senin bir klasörüne yönlendir:

```powershell
npm config set prefix "$env:APPDATA\npm"
```

ve `%APPDATA%\npm`'i `PATH`'ine ekle.
</details>

<details>
<summary><b>Linux</b></summary>

```sh
sudo apt install -y curl build-essential python3      # SQLite bağlayıcısı için gcc/make
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
nvm install 22 && nvm alias default 22
```

Asla `sudo npm install -g`. `EACCES` görürsen:
`npm config set prefix ~/.npm-global` ve `~/.npm-global/bin`'i `PATH`'ine ekle.
</details>

## Hızlı başlangıç

**Node ≥ 22** ve PATH'te en az bir ajan CLI'ı gerekir
(`claude`, `codex`, `antigravity` ya da `gemini`).

```sh
npm install -g kortext
kortext
```

Sunucu **3441** portunda açılır (`--port` ile değişir) ve paneli açar. Veri tek bir global
SQLite veritabanında durur: `~/.kortext/kortext.db` (`--db` ile değişir); belgeler
repo'nda yaşar.

## Repo'na ne iner

```
AGENTS.md                  ajanın giriş sözleşmesi (devir anayasası)
.kortext/                  her belge, tek raf, yazıldıkları sırayla
  BRIEF.md PRODUCT.md STACK.md STRUCTURE.md ARCHITECTURE.md SECURITY.md
  ENVIRONMENT.md DATABASE.md API.md DESIGN.md GROWTH.md LEGAL.md
  CONTENT.md ENGINEERING.md TEST.md
```

Frontmatter'daki `status` tek doğru kaynaktır:
`uninitialized → draft → approved` (ya da `not-applicable`).

## Çalıştığını doğrula

```sh
node --version                          # v22 ya da üstü
kortext --version
which claude || which codex || which agy || which gemini
```

Kurulu bir CLI oturum açmış bir CLI demek değildir: Kortext'i gerçek bir projeye yöneltmeden
önce kendi CLI'ını bir kez tek başına çalıştır. CLI proje başına, Proje ekle formunda seçilir;
proje ekranında Start'ın yanında aynı açılır liste durur, kota bitince oradan geçersin. Hiçbiri
kurulu değilse panel bunu başlığında söyler.

## Başlatma ve durdurma

`kortext` sunucuyu arka planda başlatır ve paneli açar — terminal penceresi kapatılabilir, panel
çalışmaya devam eder. Panelin durum çubuğundaki ⏻ düğmesiyle durdur; aynı çubuğun noktası
sunucu ayaktayken yeşil, gittiğinde kırmızıdır. Yeniden başlatmak için tekrar `kortext`.

```sh
kortext            # arka planda başlat, paneli aç
kortext --stop     # arka plan sunucusunu durdur
kortext --no-detach  # bu terminalde tut, Ctrl+C ile durdur
```

Ne düğme ne `--stop` koşan bir adımı keser: biri sürerken reddederler, böylece bir analiz
yazımın ortasında kesilmez.

Arka plan sunucusu yazdıklarını `~/.kortext/kortext.db.log`'a yazar.

## Güncelleme ve kaldırma

Yeni bir sürüm yayımlandığında panel başlığın altında bir şeritle söyler; **Update now** düğmesi
kurulumu senin yerine çalıştırır — yeni sürüm, kortext'i kapatıp yeniden açtığında devrededir.
Düğme, dosyaları altından değiştirmek yerine koşan adımın bitmesini bekler. Elle, ya da düğme
hata bildirirse:

```sh
npm update -g kortext
npm uninstall -g kortext
```

Kaldırmak yalnız ikiliyi siler. Kayıt ve loglar `~/.kortext/`'te, her belge repo'nda kalır —
temiz bir sayfa istiyorsan ikisini de kendin sil.

## Geliştirme

```sh
npm install && npm --prefix ui install
npm run dev        # sunucu :3441 (tsx watch)
npm run dev:web    # vite panel :3442 (proxy /api → 3441)
npm test           # node:test takımı
npm run typecheck  # sunucu + panel
npm run format     # prettier yazar; format:check doğrular (CI kontrolü çalıştırır)
npm run build      # tsc → dist/ + vite → ui/dist/
```

Issue ve pull request'ler hoş gelir — bkz. [CONTRIBUTING](../../.github/CONTRIBUTING.md),
[SUPPORT](../../.github/SUPPORT.md) ve [güvenlik politikası](../../.github/SECURITY.md).

Kortext ücretsiz ve MIT lisanslıdır. İşinde yer edinirse
[sponsor olmak](https://buymeacoffee.com/erayendes) bakımını sürdürür.

## Belgeler

[Kılavuz](GUIDE.md) — panel, anlatılmış · [Değişiklik günlüğü](CHANGELOG.md)

## Lisans

MIT © Eray Endes
