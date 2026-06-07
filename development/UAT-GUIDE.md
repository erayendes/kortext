# Kortext v3.1.0 — UAT Test Rehberi (Eray)

---

## ⭐ TAM & GERÇEK UAT — uçtan uca, gerçek Claude ajanı (2026-06-07)

> Paketlenmiş `kortext` + **gerçek claude executor** ile fikir→backlog→kod→review→release zincirini GUI'de doğrular. Sen **+prime**'sın: kapıları tarayıcıda sen onaylarsın. Aşağıdaki §0-§10 eski tur-1 testidir, referans.

### Önce bil (gerçekçi beklenti)
- **Gerçek claude koşar** → her adım dakikalar sürer; tam zincir uzun. **İlk UAT'ı KÜÇÜK tut** (5-8 özellikli minik fikir). Beğenince büyüt.
- **Maliyet:** gerçek claude = API/kullanım maliyeti.
- **Takılma riski:** bir adım çok uzun "running" kalırsa (bilinen hung-claude follow-up'ı) o koşuyu durdur/retry. (Canlı teyitte bir adım ~70dk takıldı.)
- **Sen +prime'sın:** hiçbir şey onayın olmadan kapıdan geçmez — UAT'ın özü bu.

### Adım 1 — Paketle + global kur (terminal, tek sefer)
> ⚠️ Komut bloklarında **inline `# yorum` KULLANMA** — zsh'de `setopt interactivecomments` kapalıysa yorum komuta argüman olur (`npm pack #` → "Invalid tag name"). Aşağısı yorumsuz; satır satır çalıştır.
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build
npm pack
npm install -g ./kortext-3.1.0.tgz
kortext --version
lsof -ti tcp:3200 | xargs kill 2>/dev/null
```
Beklenen: `kortext --version` → `3.1.0`.

### Adım 2 — Proje klasörü + git bootstrap + başlat (terminal)
```bash
cd <proje-klasörün>
kortext init --skip-preflight
git init -b main
git add -A
git commit -m "kortext scaffold"
git branch development
KORTEXT_DRIVE_ENABLED=1 KORTEXT_CLAUDE_BIN=$(which claude) kortext start .
```
(`init` `.kortext/`'i önce kurar ki `.gitignore` commit'e girsin; git bootstrap **`main` + `development`** branch'lerini yaratır — build fazının ön şartı. ⚠️ Ajanlar gerçek kodu bu repoya yazar.)
`init` `.kortext/`'i kurar (önce, ki `.gitignore` commit'e girsin); git bootstrap **`main` + `development` branch'lerini** yaratır (build fazının ön şartı); `start` daemon'u 3200'de başlatır + **tarayıcıyı açar**. `KORTEXT_DRIVE_ENABLED=1` build'i açar, `KORTEXT_CLAUDE_BIN` gerçek executor. Sonrası **tamamen GUI**. ⚠️ Ajanlar gerçek kodu bu repoya (worktree'lerde, `development`'a merge) yazar — kendi repon.

### Adım 3 — Onboarding (GUI)
Sihirbazda: proje **adı** + **kod** (örn. `DV`) + **agent = Claude** (binary `/opt/homebrew/bin/claude`) + **BRD** (fikrini sade dille; sıralı özellikler → doğal bağımlılık). Onayla → motor **analiz**'i başlatır.

### Adım 4 — Analiz (GUI, +prime kapıları)
"Active work"te koşan adımlar, "For review"da sana gelen +prime kapıları. Her artefaktı (BRD/PRD/TRD/references) incele → **Approve** (veya Reject + sebep). Onaylanınca motor **planning**'i başlatır.

### Adım 5 — Planning → Board dolar (GUI)
**Board**'da epic'ler + item'lar + **kodlu id'ler** (`DV-001`, `DV-E01`). **Bağımlılık doğrula:** bağımlısı olan item'lar **`blocked`**, köksüzler `to_do` (yeni bağımlılık-sıralı motor).

### Adım 6 — Build fazı (GUI)
Dashboard'da **"Auto"** (veya "Run once") → motor **bloksuz** item'ları gerçek claude ile kodlar (her biri ayrı git worktree). Blocker bitince bağımlıları otomatik `to_do`'ya düşer. Kodlanan item review'a girer → qa/security/designer + **UAT** sana gelir → Approve/Reject (Reject→motor bug açar).

### Adım 7 — Epic → staging → version → preprod → release (GUI)
Epic'in çocukları bitince → **staging** deploy (mock) + gate-persona raporları → **staging-onay** sorusu → Approve. Version'ın tüm epic'leri onaylı → **preprod** deploy + **preprod-onay** → Approve → motor **gerçek `development→main` merge + sürüm etiketi** (prod push hâlâ mock).

### Doğrulama checklist
- [ ] Onboarding→analiz→planning kesintisiz, +prime kapıları GUI'de
- [ ] Board: kodlu id'ler + gerçek bağımlılıklar + `blocked` durumları
- [ ] Build: bağımlılık sırasında kodlama, blocker bitince bağımlı açıldı
- [ ] Review gate'leri + UAT +prime'a geldi, onay/red çalıştı (red→bug)
- [ ] Epic→staging-onay, version→preprod-onay, son merge+tag

### Temizlik
```bash
kortext stop            # tüm daemon'ları durdur
kortext list            # kayıtlı projeler
kortext purge <proje>   # test projesini sicilden + .kortext/ sil (sorar)
```

---

## (Legacy) Faz 11-13 + CLI redesign tur-1 testi

> Bu dosya **Faz 11-13'ün** (onboarding wizard + dashboard polish + foundation/ kategorisi + ALL-CAPS references + 12 workflow rewrite) **+ CLI redesign**'ın lokal kullanıcı doğrulamasıdır. main HEAD `6dc2fb6`+. Bu UAT npm publish'ten **önce** koşulur; pass ederse v3.1.0 release flow tetiklenir.
> **Not:** CLI redesign implementation tamamlanana kadar UAT iki turda koşulur: (1) mevcut `init/serve` ile dashboard + foundation/ + workflow akışı, (2) v3.1 CLI redesign sonrası `start/stop/list/...` yeni komutlar + onboard akışı + multi-project. Aşağıdaki §1-§10 birinci turdur.
> Hedef: yeni `.kortext/` mimari'sinin gerçek kurulumda çalıştığını + ekranların açıldığını + temel akışların kırılmadığını teyit etmek.
> Süre: ~30-45 dakika.
> **Test klasörü:** `/Users/erayendes/Documents/_codebase/kortext-uat` (Eray'ın belirlediği)

---

## 0. Ön hazırlık

> ⚠️ **macOS zsh için tek seferlik ayar — şimdi yap:**
> ```bash
> setopt interactivecomments
> ```
> Bu komut açık olmadan, copy-paste sırasında `#` yorum satırları "command not found: #" hatası verir VE çoklu komut block'larında satır karışıklığı yaratır (kazara yanlış klasörde init yapma riski). Komutu çalıştırınca terminal oturumun süresince yorumlar çalışır. Kalıcı yapmak için `~/.zshrc`'ye ekle.

Aşağıdaki şartların doğru olduğundan emin ol — bunları **tek tek** ayrı satırlarda çalıştır, copy-paste değil:

- `node --version` — v22 veya üstü gerekli
- `git --version` — ≥ 2.30
- `which claude` — Claude CLI yüklü olmalı (executor seçimi için)
- `which agy` — opsiyonel (Antigravity)
- `which codex` — opsiyonel

Ayrıca **dashboard'da kullanılacak `KORTEXT_PORT=3200` portu boş olmalı**. Çakışırsa `kortext serve --port 3210` ile aç.

---

## 1. Build + pack (tgz üret)

main artık Faz 13 sonrası güncel. Doğrudan main'den çalış:

```bash
cd ~/Documents/_codebase/kortext
git checkout main
git pull --ff-only origin main
git log --oneline -3
# 6dc2fb6 (Faz 13 — workflow content rewrite + foundation/ category + docs konsolidasyon + repo housekeeping)
# (öncesinde Faz 11-12 commit'leri)

npm install
npm run build         # dist/ üretir (server + web)
npm pack              # kortext-3.0.0.tgz oluşur (package.json hâlâ 3.0.0)
ls -lh kortext-3.0.0.tgz
```

Çıktı: `kortext-3.0.0.tgz` ~5-10 MB.

> 💡 **Neden hâlâ `3.0.0.tgz`?** `package.json`'da version henüz `3.0.0`. v3.1.0 release flow (3.0.0 → 3.1.0 bump + CHANGELOG'a `[3.1.0]` bölümü + `git tag v3.1.0` + npm-publish workflow tetikleme) **bu UAT pass ettikten sonra** yapılır. UAT sırasında dosya adı önemli değil; pakettin içeriği `dist/` + `templates/` + `agents/` + `workflows/` + `rules/` doğru olmalı.

Quick sanity:
```bash
tar tzf kortext-3.0.0.tgz | grep -E "(package/templates|package/agents|package/dist/server)" | head -10
# package/templates/AGENTS.md
# package/templates/.gitignore
# package/templates/references/blueprint.md
# package/agents/+product-manager.md
# package/dist/server/index.js
# package/dist/server/db/migrations/003_add_reports_index.sql
# package/dist/server/db/migrations/004_add_workflow_persona_index.sql
```

`templates/` + 4 SQL migration tgz'nin içinde görüyorsan **Faz 12 doğru paketlenmiş** demektir.

---

## 2. Test klasörü + global install

Eray'ın UAT klasörü: `/Users/erayendes/Documents/_codebase/kortext-uat` (boş klasör).

**Komutları tek tek çalıştır** (block paste DEĞİL — `kortext init` ilerideki adımda **yanlış klasörde** çalışırsa Kortext kaynak repo'sunu bozarsın):

```bash
npm uninstall -g kortext 2>/dev/null || true
```

```bash
cd ~/Documents/_codebase/kortext-uat
```

```bash
pwd
```
✅ Çıktı **kesinlikle** `/Users/erayendes/Documents/_codebase/kortext-uat` olmalı. Değilse `cd` tekrar.

```bash
ls -a
```
Klasör boş olmalı (`.` `..` ve belki `.DS_Store`). Yoksa:
```bash
rm -rf .kortext agents workflows rules workspace AGENTS.md .env.example .gitignore node_modules
```

```bash
npm install -g ~/Documents/_codebase/kortext/kortext-3.0.0.tgz
```

```bash
kortext --version
```
Beklenen: `3.0.0`

```bash
kortext --help
```
Beklenen: `init / serve / start / approve / status / logs / cleanup / archive / doctor / mcp` listede. `archive` subcommand'i v3.1 ile geldi (Faz 12.6) — listede görüyorsan **Faz 12 doğru paketlenmiş** demektir.

> **v3.1 CLI redesign uyarısı:** Yukarıdaki komut listesi v3.0 production durumudur. v3.1 implementation sırasında CLI 9 komutluk yeni yüzeye geçecek (`start/stop/pause/list/remove/purge/update/doctor/help`). UAT'ın ikinci turu redesign tamamlandıktan sonra koşulacak. Bkz. [DECISIONS Bölüm 0](./DECISIONS.md).

> ⚠️ **`npm install -g` izin hatası alırsan:** macOS'ta global npm dizini bazen root sahipliğinde olur. `sudo` kullanma yerine `npm config get prefix` ile yolu kontrol et; Eray'ın daha önceki kurulumunda muhtemelen düzeltilmiş olarak çalışıyor. Sorun çıkarsa `nvm` veya `npm config set prefix ~/.npm-global` ile user-local prefix kullan.

---

## 3. `kortext init` — yeni `.kortext/` layout

⚠️ **Çok önemli:** `init`'i çalıştırmadan önce `pwd` ile **tekrar teyit et** doğru klasörde olduğunu:

```bash
pwd
```
Çıktı `/Users/erayendes/Documents/_codebase/kortext-uat` değilse DURMA, `cd` ile geri dön. Yanlış klasörde init çalıştırırsan Kortext kaynak repo'sunda `.kortext/references|reports|memory/` oluşturur ve kafa karıştırır.

```bash
kortext init
```

Beklenen çıktı (örnek):
```
✓ Created AGENTS.md
✓ Created .gitignore
✓ Created .env.example
✓ Created .kortext/data/ (SQLite + log + worktree)
✓ Created .kortext/foundation/ (BRD + PRD + TRD + PFD)
✓ Created .kortext/references/ (13 templates, ALL-CAPS)
✓ Created .kortext/reports/ (8 scope templates)
✓ Created .kortext/memory/ (handover.md + decisions.md + learned.md)
Initialized Kortext project at /Users/erayendes/Documents/_codebase/kortext-uat
```

**Doğrulama (kritik):**

```bash
ls -a
# Beklenen: . .. .gitignore .env.example .kortext AGENTS.md
# Eski v3.0'da olan ama v3.1'de OLMAMASI gereken: agents/ workflows/ rules/ workspace/

ls .kortext/
# Beklenen: data foundation references reports memory

ls .kortext/foundation/ | wc -l       # 4 olmalı (BRD/PRD/TRD/PFD — Faz 13 yeni kategori)
ls .kortext/references/ | wc -l       # 13 olmalı (Faz 13: ALL-CAPS rename + required-skills.md silindi)
ls .kortext/reports/ | wc -l          # 8 olmalı (Faz 13: scope sayısı düşürüldü)
ls .kortext/memory/                    # decisions.md  handover.md  learned.md
ls .kortext/data/                      # kortext.db (init migrate koştu)
```

✅ Pass: proje kökünde `agents/workflows/rules/workspace/` **YOK**, `.kortext/` altında templates kopyalandı.
❌ Fail: `agents/` proje kökünde varsa Faz 12.2 yanlış paketlendi.

Frontmatter check:
```bash
head -8 .kortext/references/blueprint.md
# Beklenen:
# ---
# status: uninitialized
# author: +product-manager  (veya benzeri)
# approver: +prime
# ---
```

INFO callout sökülmüş olmalı — `grep "INFO" .kortext/references/*.md` boş dönmeli.

---

## 4. `kortext serve` — dashboard

```bash
kortext serve
```

Beklenen çıktı:
```
[engine] Boot: syncing personas + workflows into SQL index...
[engine] ✓ 14 personas + N workflow_steps indexed
[server] Listening on http://localhost:3200
[browser] Opening http://localhost:3200 ...
```

✅ **Beklenti (Faz 13 sonrası):** Workflow .md'lerinde `+ajan` placeholder **0 yer**. Boot başarılı: 14 valid persona handle + `+prime` synthetic row index'lenir. Log mesajında "0 step skipped — no persona handle" görmelisin.

⚠️ **Eğer boot'ta `fatal: workflow references unknown persona +X` hatası alırsan**: workflow .md'lerinde gerçek bir typo/geçersiz handle var demektir (Faz 13 rewrite kapsam dışı bir şey kalmış). Fatal throw mesajı hangi step + hangi handle olduğunu söyler; not al, fix turu açılır.

**Tarayıcı kontrolü** — http://localhost:3200 açıldığında:

- [ ] Sidebar görünüyor (Dashboard / Board / Memory / Reports / References + Settings sub-panes)
- [ ] Onboarding ekranı geliyor (`.kortext/references/blueprint.md` status `uninitialized` olduğu için)

---

## 5. Onboarding wizard

Onboarding ekranında:

1. **Project Name:** `Acme CRM UAT v3.1`
2. **Project Code:** `ACMEV31`
3. **Project Type:** `existing` veya `new`
4. **Target Platform:** Web (chip)
5. **Executor:** Mock seç (Claude/AGY testi için sonra)
6. **Blueprint:** Eray'ın yazdığı yeni bir blueprint markdown (eski `blueprint-helsinki.md` Faz 13 docs konsolidasyonunda kaldırıldı). En basit hali: 1-2 paragraflık problem tanımı + hedef + kısıtlar.
7. **Submit**

Beklenen:
- [ ] Form yeşil geçer, `Initializing…` durduktan sonra dashboard'a yönlendirilir
- [ ] `.kortext/foundation/BRD.md` status'u `approved` olur (`head -8` ile teyit) — Faz 13 ile blueprint artık `foundation/` altında, eski `references/blueprint.md` lokasyonunda DEĞİL
- [ ] `.kortext/data/kortext.db`'de yeni `run` satırı oluşur (mock executor new-project-analysis tetikler)
- [ ] Dashboard'da "Active work" tablosu yeni run'ı gösterir

⚠️ **Mock executor sahte success döner — gerçek dosya yazılmaz.** Foundation/references/reports dolduğunu doğrulamak için Claude executor ile yeniden koşman gerek (TODO Sırada §1).

---

## 6. Board ekranı "+ New Item" modal

Sidebar → Board.

- [ ] "Filter" + "+ New task" butonları görünür
- [ ] "+ New task" tıklayınca modal açılır
- [ ] Modal alanları: Type (dropdown) / Title (required) / Epic (dropdown) / Owner (persona) / Acceptance criteria / Dependencies / Notes
- [ ] Type=task, Title="UAT test login flow", Submit
- [ ] Modal kapanır, board'da `T01 — UAT test login flow` görünür

Sonra DB direkt teyit:
```bash
sqlite3 ~/Documents/_codebase/kortext-uat/.kortext/data/kortext.db \
  "SELECT id, type, title, status FROM backlog_items;"
# T01 | task | UAT test login flow | to_do
```

---

## 7. Settings readonly editor

Sidebar → Settings → Agents.

- [ ] Sol kolonda persona listesi (14 entry)
- [ ] Persona seçilince sağda markdown render gözüküyor
- [ ] "Edit" / "Save" butonları **YOK** — bunun yerine "Source / Rendered" toggle var
- [ ] Toggle: Rendered = HTML rendered markdown; Source = raw .md text

Workflows ve Rules pane'lerinde aynı pattern.

---

## 8. Prompt cache token usage delta (Faz 12.7)

Üç defa aynı pipeline'ı koş (mock değil — Claude executor ile):

```bash
# Onboarding'i Claude executor ile yeniden yap, ya da:
kortext start new-project-analysis --executor claude
# Log dosyasında token usage'ı oku:
tail -20 .kortext/data/logs/run-*-step-*.log | grep -i "token"
```

Üç koşumun token kullanımı:
- **İlk koş:** baseline (cache miss)
- **2. koş:** input tokens ~%90 azalmış olmalı (cache hit)
- **3. koş:** 2. ile benzer

Eğer fark yoksa: `claude --print` çıktısında `cache_read_input_tokens` field'ına bak — 0'dan büyükse cache çalışıyor demektir.

⚠️ Bu test gerçek Claude API çağrısı yapıyor — kredi yakıyor. 3× küçük task ile test et.

---

## 9. Handover rotation (Faz 12.6)

Manuel test:

```bash
# 6 fake entry yaz handover.md'ye
for i in $(seq 1 6); do
  cat >> .kortext/memory/handover.md <<EOF

---
status: approved
author: +product-manager
updated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
---

## Handover: UAT test entry $i

Test content $i

EOF
done

kortext archive handover
ls .kortext/memory/
# Beklenen: handover.md (boş) + handover-2026-05-25-XXXX.md (rotated)
```

✅ Pass: rotation çalıştı, archive dosyası timestamp suffix'iyle yazıldı.

---

## 10. Cleanup

UAT bitince:
```bash
cd ~
rm -rf ~/Documents/_codebase/kortext-uat
npm uninstall -g kortext
```

---

## Sonuç raporlama

Hangi adımda pass / fail olduğunu [development/HANDOVER.md](./HANDOVER.md) §1 "Şu an" bölümüne yaz. Fail varsa: hangi adım, hangi log, hangi screenshot. Sonraki oturum açar açmaz fix turuna geçilir.

✅ Hepsi pass: Release flow başlatılır. **Versiyon numarası belirsiz** — [TODO Açık sorular](./TODO.md)'deki v3.x naming çatışmasını Eray çözmeden numara verilmez. Genel akış:
1. main güncel + tag karar verilen versiyon
2. `package.json` 3.0.0 → karar verilen versiyon
3. `CHANGELOG.md` ilgili bölüm ekle
4. `git tag vX.Y.Z && git push origin vX.Y.Z` → npm-publish.yml otomatik tetikler
5. npm registry'de `kortext@X.Y.Z` yayınlanır (provenance-attested)

---

## Notlar

- **Faz 13 (workflow content rewrite)** main'de — `+ajan` placeholder yok, persona FK validation pass. Mock executor ile sahte success akışı + Claude executor ile gerçek foundation/reports yazımı ayrı testler (Claude testi: TODO Sırada §1).
- **Faz 12.9 yarım UI** (Reports SQL revamp + Memory archive dropdown) eksik ama mevcut ekranlar v3.0 endpoint'leriyle çalışır — UAT'da Reports/Memory ekranları açılıyor mu kontrol et, "tıkırında" olmayabilir. Bkz. [TODO v3.1.x follow-up](./TODO.md).
- **`app.listen` EADDRINUSE silent fail** hâlâ açık (Faz 10 borcu, [TODO v3.0.1 borç](./TODO.md)). Eğer `kortext serve` çıktısı boş geliyorsa port çakışmasıdır — `lsof -ti:3200 | xargs kill` ile temizle.
