# Kortext v1.0 — Uçtan Uca Simülasyon

> Kaynak: kodun birebir izi (5 paralel okuyucu, `file:line` referanslı) · Dal: `v1` · Tarih: 2026-06-26
> Örnek proje: **"Acme CRM"** (kod `ACME`)
>
> Bu doküman, Kortext v1.0'ın **kurulumdan dış-LLM devrine** kadarki akışını,
> gerçek kodun yaptığı sırayla adım adım simüle eder. Yorumlarını satır satır ekleyebilirsin.

---

## Perde 1 — Kurulum

**1. Sen** → terminalde `npm install -g kortext`
**Kortext** → `postinstall` hook çalışır, hoşgeldin mesajı basar.
**Görürsün:** `Kortext installed. Start (opens setup wizard): kortext start`
→ `scripts/postinstall.mjs:4-18`

**2. Sen** → `kortext start`
**Kortext** → `bin/kortext.js` derlenmiş `dist/` var mı bakar.
- ✅ var (npm install) → in-process çalışır
- ❌ yok (kaynak checkout) → **durur**, `kortext serve` gerektirir
→ `bin/kortext.js:13-22`

> ⚠️ **Pratik tuzak #1:** npm'den kurup `npm run build` yapmazsan `dist/` olmaz ve
> `kortext start` "Source checkout (no dist/)" hatası verir. (UAT'taki "yine bu hatayı verdi" buydu.)

**3. Kortext** → kayıtlı proje yok → `{ kind: 'onboard' }` → **bootstrap sihirbazını** ayağa kaldırır.
- Geçici ev: `~/.kortext/bootstrap/`
- Port: **3199** (sabit, sihirbaza özel)
- 1.2 sn sonra tarayıcı açılır.
**Görürsün:** Tarayıcıda `http://localhost:3199/` → Onboarding ekranı.
→ `server/cli/cmd-bootstrap.ts:66-85`, `bin/kortext.ts:136-149`

---

## Perde 2 — Onboarding (proje tanımı)

**4. Sen** → formu doldurursun:

| Alan | Örnek | Kural |
|---|---|---|
| Proje adı | `Acme CRM` | 2–60 karakter |
| Kod | `ACME` | 2–6 büyük harf/rakam (`ACME-001` gibi id öneki olur) |
| Tip | `New project` / `Existing code` | radio |
| Dizin | `/Users/erayendes/projects/acme` | **bootstrap'ta zorunlu** |
| Executor | sürükle-sırala: `claude → codex → mock` | ilki birincil, gerisi yedek |
| BRD | sağ panel "Write" sekmesi | ≥10 karakter, markdown yapıştır veya dosya yükle |

→ `src/components/OnboardingScreen.tsx`, doğrulama `server/routes/blueprint.ts:78-151`

> ⚠️ **Pratik tuzak #2:** bootstrap modunda **dizin boş bırakılamaz** — "projectDir is required" 422 verir.
>
> 📝 v1.0 temizliği: **Target Platform alanı kaldırıldı** (validation'da boş dizi olarak duruyor ama UI
> sormuyor). "Paste" sekmesi → **"Write"**; dosya yüklersen içerik direkt Write editörüne dolar.

**5. Sen** → **"Initialize project"**
**Kortext** → `createProjectAndLaunch()` sırayla:
1. `.kortext/` iskeletini kurar (`foundation/ references/ reports/ memory/ data/` + `kortext.db`)
2. `git init` (best-effort)
3. `.kortext/foundation/BRD.md` yazar → frontmatter `status: approved, owner: +prime`
4. `.kortext/project.json` yazar (ad/kod/executor zinciri)
5. Boş port ayırır (3200–3299) → **gerçek proje daemon'unu** o portta başlatır
6. `/api/health` 200 dönene kadar bekler (≤12 sn) → tarayıcıyı yeni porta yönlendirir
**Görürsün:** Tarayıcı `http://localhost:3200/`'e geçer; bootstrap (3199) 2 sn sonra kendini kapatır.
→ `server/blueprint/create-project.ts:41-69`

> **İki daemon, iki port.** Sihirbaz (3199) sadece dosyaları yazıp dağılan, kayıt edilmeyen geçici bir
> süreç; gerçek iş kalıcı proje daemon'unda (3200+) döner. BRD `status: approved` yazıldığı için yeni
> daemon **boot anında analizi kendiliğinden tetikler**.

---

## Perde 3 — Analiz (otomatik başlar)

**6. Kortext** → yeni daemon `BRD.md status:approved` görür → `new-project-analysis` workflow'unu
tetikler. Zincir `chainThroughWorkflowId: 'planning-pipeline'` ile kurulu → **analiz + planlama çalışır,
orada DURUR** (v1.0'da driver/deploy yok).
→ `server/index.ts:214-307`

**7. Executor** (seçtiğin: `claude` ya da UAT'taki `mock`) analiz adımlarını sırayla koşar, her adım
çıktısını diske yazar:
- `.kortext/references/` → `STACK.md, DESIGN.md, SECURITY.md, API.md, DATABASE.md, LEGAL.md …`
- `.kortext/foundation/` → `PRD.md, TRD.md`
**Görürsün:** Setup ekranında adımlar akar: `running → review → approved`.

**8. +prime onay kapısı (gate).** Workflow adımındaki `approver: +prime` alanından türetilir. Adım bitince
motor durur, bir **PendingQuestion** açar.
**Görürsün:** ReviewDrawer açılır → ilgili dokümanı (ör. `PFD.md`) gösterir → **Onayla / Revize et**.
- Onayla → `POST /api/questions/:id/answer {answer:'approve'}` → motor devam eder
- Revize → gerekçe yazarsın → adım reddedilir
→ `server/orchestrator/queue-gate-controller.ts:26-48`, `src/components/SetupScreen.tsx:424-654`

> 📝 "approver: +prime" sadece workflow dosyasındaki bir alandan ibaret; onayı **sen** (insan)
> drawer'dan verirsin.

---

## Perde 4 — Planlama → tek `TODO.md`

**9. Kortext** → planlama adımları backlog'u üretir: agent `backlog.yaml` / `backlog.patch.yaml` yazar →
motor SQLite `backlog_items` tablosuna işler (id, type, title, parent_id, version, frontmatter…).
→ `server/engine/backlog-ingest.ts`

**10. Kortext** → `ensureBacklogStructure()` (eksik epic yarat, öksüz task'ları epic'e bağla, versiyonları
topla) → sonra **`writeTodoFromDb()`** SQLite'tan okuyup tek `.kortext/memory/TODO.md` üretir.
→ `server/engine/todo-generator.ts:95-138`, `server/index.ts:275-305`

**Üretilen güncel format** (versiyon → epic → task, bağımlılık sırasıyla):
```
# TODO
- [ ] v0.1
    - [ ] ACME-E01 - Auth: kullanıcı girişi
        - [ ] ACME-001 - OAuth akışı: Google ile giriş
        - [ ] ACME-002 - Oturum yönetimi: token yenileme
- [ ] v0.2
    - [ ] ACME-E02 - CRM çekirdek
        - [ ] ACME-003 - Kişi listesi: CRUD ekranı
```

> ⚠️ **Hedef formatla tek fark:** İstediğin `- [ ] v0.1 - version-name` (versiyona **isim**) henüz yok —
> şu an versiyon satırı isimsiz (`- [ ] v0.1`). Bu, bekleyen **planlama yeniden-kurma** işinin parçası
> (Backlog → Epic bağları → **Versiyonlama (isim üret)** → TODO review).

**11. Son onay = TODO.md.** Planlama başarıyla biter → `TODO.md` son +prime inceleme artefaktı olur.
**Görürsün:** "Review your plan: TODO.md" → **Onayla** → daemon planlamayı `succeeded` işaretler →
Dashboard'a geçersin.

> **Backlog iç kaynak, TODO.md tek vitrin.** Agent `backlog.yaml` yazar; `TODO.md`'yi **motor üretir,
> agent yazmaz** (`planning-pipeline.md` içinde "MOTOR ÜRETİR, SEN YAZMA" notu var).

---

## Perde 5 — Dashboard (salt-okunur takip)

**12. Sen** → Dashboard. Artık aktivite akışı / driver kontrolü **yok** — sadece **TODO ağacı**.
**Kortext** → `TodoTree` bileşeni her **5 sn**'de `GET /api/docs/memory/TODO.md` çeker, `parseTodo()` ile
satırları ayrıştırır, salt-okunur iç içe checkbox ağacı çizer.
**Görürsün:** "Görevler" kartı + ilerleme rozeti (`3/7`), biten maddeler üstü çizili, sıradaki açık madde
en üstte.
→ `src/routes/dashboard.tsx:554-640`

---

## Perde 6 — Dış LLM'e devir (AGENTS.md sözleşmesi)

**13. Dış LLM** (Claude/Codex, kendi arayüzünde) projeyi ilk açtığında `AGENTS.md`'yi okur — devir
sözleşmesi:
1. `memory/handover.md` oku → ne yapıldı, ne kaldı
2. `memory/TODO.md`'den **sıradaki işaretsiz görevi** al
3. `foundation/` + `references/` kurallarına **uy**
4. İş bitince:
   - `TODO.md`'de kutuyu `[ ] → [x]` yap (**lokal dosya düzenleme — Kortext sürmüyor**)
   - `memory/decisions.md` (karar), `memory/learned.md` (ders), `memory/handover.md` (neredeyim/sıradaki ne) yaz
→ `templates/AGENTS.md`, `server/cli/init.ts` (DEFAULT_AGENTS_MD)

**14. Geri akış.** Dış LLM `TODO.md`'de kutuyu işaretler → Dashboard sıradaki 5 sn poll'ünde dosyayı taze
okur → ☐ yeşil ☑ olur, üstü çizilir, rozet `4/7` olur.
→ `src/routes/dashboard.tsx:573-636`

> **Süreklilik katmanı, orkestratör değil.** v1.0'ın tezi: Kortext işi *yürütmez*, **dosya tabanlı tek
> gerçeklik** (`.kortext/`) tutar ve **salt-okunur gösterir**. Dış LLM in-session orkestrasyonu zaten iyi
> yapar; Kortext'in çözdüğü tek şey **oturumlar-arası süreklilik**.

---

## Bilmen gereken 3 gerçek tuzak (koddan)

1. **`dist/` zorunlu** — npm kurulumda `npm run build` yapılmazsa `kortext start` çalışmaz.
2. **Executor varlığı kontrol edilmez** — `claude` seçip CLI kurulu değilse ilk run patlar; hata run
   satırına düşer, elle düzeltip yeniden çalıştırırsın. (UAT'ta `mock` kullanmanın sebebi.)
3. **TODO.md kırılgan parse** — dış LLM tam `- [ ] ` formatını (4 boşluk = bir seviye) bozarsa o satır
   sessizce atlanır; işaretlemeyi unutursa iş bitse de ilerleme takılı görünür.

---

## Açık nokta

- Akış tutarlı ve uçtan uca çalışıyor — tek eksik **versiyon-isimli TODO formatı** (`v0.1 - version-name`),
  o da bekleyen **planlama yeniden-kurma** işinde (Backlog → Epic bağları → Versiyonlama → TODO review).
