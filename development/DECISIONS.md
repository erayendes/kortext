# Kortext — Decisions Log

Bu dosya Kortext'in **tüm mimari, workflow ve tasarım kararlarının** kronolojik kaydı. Yeni bir oturum bir şeyi değiştirmeye başlamadan önce burayı oku — eskiyi neden böyle yaptığımızı anlamadan değiştirme. Kanonik mimari yapı için [ARCHITECTURE.md](./ARCHITECTURE.md), görsel sistem için [DESIGN.md](./DESIGN.md).

---

## Bölüm 0 — CLI/Onboarding redesign (2026-05-27)

**Status:** Eray onayladı (design level) — **v3.1 devasa sürümünün CLI redesign parçası**, henüz koda dökülmedi. v3.0 `init/serve` modeli implementation tamamlanana kadar mevcut; v3.1.0 release ile clean break.

### 0.1 Multi-project daemon mimarisi

v3.1'in **tek-proje-tek-süreç** modeli yerine **tek-daemon-çok-proje** modeli.

- Global registry: `~/.kortext/projects.json` → `{ "acme-crm": "/Users/eray/Projects/acme-crm", "saas-app": "/Users/eray/Projects/saas-app" }`
- Tek daemon `localhost:3200`'de ayakta kalır, projeleri URL ile ayırır (`/acme-crm/dashboard`, `/saas-app/dashboard`).
- Paralel çalıştırma norm: birden fazla proje aynı sunucuya bağlı, aynı anda dashboard'da.

**Sebep:** Eray birden fazla projeyi paralel yürütüyor; "her proje için yeni terminal" akışı kırıcı. Bilgisayar yeniden başlatıldıktan sonra `kortext start acme-crm` ile aynı yere dönmek gerekiyor.

### 0.2 Postinstall otomatik onboarding

`npm install -g kortext` biter bitmez:
1. Postinstall script detached daemon spawn eder (`localhost:3200`).
2. Tarayıcı otomatik açılır: `localhost:3200/onboard`.
3. Registry boşsa direkt onboard ekranı; doluysa proje listesi + üstte "Yeni proje başlat" butonu (onboard akışına gider).

**Risk notu:** Postinstall'da background process spawn etmek bazı npm versiyonlarında izin/ortam sorunlu. `detached: true, stdio: 'ignore'` + `unref()` zorunlu. Spawn başarısız olursa fallback: "Kortext kuruldu — `kortext start` yaz" mesajı.

### 0.3 Native OS folder picker (backend API)

Onboard sırasında "Proje dizini seç" butonu browser'dan native OS diyaloğunu açar:
- macOS: `osascript -e 'choose folder'`
- Windows: PowerShell `[System.Windows.Forms.FolderBrowserDialog]`
- Linux: `zenity --file-selection --directory` (yedek: `kdialog`)

Backend endpoint: `POST /api/system/pick-folder` → child_process spawn → seçilen path döner.

**Sebep:** Browser `<input type="file" webkitdirectory>` güvenlik nedeniyle native path açıklamaz. Localhost daemon + native dialog browser kısıtını byp etmenin tek temiz yolu.

### 0.4 CLI yüzeyi: 9 komut (v3.1'in 10+ komutunu konsolide)

```
kortext start [proje]    daemon + proje aç; proje yoksa onboard'a git;
                         aynı komut "devam et" işlevini görür
kortext stop             tüm sistemi kapat (daemon shutdown)
kortext pause [proje]    bir projeyi duraklat (diğer projeler çalışmaya devam)
kortext list             kayıtlı projeleri göster
kortext remove [proje]   sadece registry'den çıkar; .kortext/ proje dizininde kalır
kortext purge [proje]    registry'den çıkar + .kortext/ klasörünü sil (onay sorusu)
kortext update           kortext'i npm üzerinden güncelle
kortext doctor           sağlık kontrolü
kortext help             komut listesi (--help, -h alias)
```

**Disiplin:**
- `start` her şeyi başlatır (daemon, proje, tarayıcı). Tek ana giriş.
- v3.1'in `init` ve `serve` komutları kalkar — `start` ikisini absorb eder.
- `approve/status/logs/cleanup/archive` dashboard'a taşınır. UI varken CLI'da paralel surface tutmak bakım yükü.
- Imperative kip tutarlılığı (`start/stop/pause/list/remove/purge`) — Docker/git/kubectl convention.

### 0.5 `remove` vs `purge`: ayrı komut (flag değil)

İki seçenek değerlendirildi:
- **A:** `kortext remove --purge` (flag pattern, Unix standardı)
- **B:** `kortext remove` + `kortext purge` (iki ayrı komut) ← seçilen

**Sebep:** Eray non-coder. Flag yazımı tipo riski yüksek; "remove yazıp yanlışlıkla `--purge`" senaryosu mümkün. İki ayrı kelime = bilinçli yazım. `kortext help` listesinde ikisi de ayrı uyarıyla görünür. Linux `rm` vs `shred` ayrımıyla aynı destructive-by-design kalıbı.

- **`remove`** (yumuşak): `~/.kortext/projects.json`'dan kaydı sil. `.kortext/` proje dizininde duruyor. Sonra `start <yol>` ile yeniden eklenebilir.
- **`purge`** (sert): kayıt + dizindeki `.kortext/` klasörü silinir. Interactive onay zorunlu (`Are you sure? [y/N]`).

### 0.6 CLI/UI sorumluluk ayrımı

- **CLI = sistem kontrolü:** daemon ayağa kaldırma, proje kayıt yönetimi, güncelleme, sağlık kontrolü. Eray buraya sadece "Kortext'i başlatmak/durdurmak" için gelir.
- **Dashboard = proje operasyonu:** workflow tetikleme, ajan kontrolü, run görüntüleme, approval queue, raporlar. Eray'ın asıl çalıştığı yüzey.

`kortext command` (proje-içi komutları listele) önerildi, reddedildi — UI'da zaten butonlar olacak; CLI'da paralel surface tutmak bakım yükü + Eray GUI-first.

### 0.7 v3.0 → v3.1 geçiş

v3.0 `init/serve` production'da kullanıcı yok (npm `kortext@3.0.0` EADDRINUSE bug ile broken), geriye dönük destek derdi yok. v3.1 clean break: argv parser yeniden, postinstall script, registry servisi, folder picker endpoint, onboard route, engine'in `projectId`-aware'leştirilmesi. Bu bölüm yön belgesidir; sıralı implementation [TODO.md](./TODO.md)'de işlenecek. v3.1 = devasa sürüm = Faz 11-13 birikmiş iş + bu redesign tek atışta yayımlanır.

---

## Bölüm 1 — Faz 13 kararları (2026-05-27)

### 1.1 Foundation / references / reports ayrımı (Eray'ın A kararı)

`product-requirements`, `tech-requirements`, `analysis-reports` üç dosyası **monolitik raporlar değil, analysis phase'inin donmuş çıktıları** — bir kez üretilir, sonra re-analysis overwrite'a kadar değişmez. Yeni kategori:

```
.kortext/foundation/
├── BRD.md    (Business Requirements — blueprint)
├── PRD.md    (Product Requirements)
├── TRD.md    (Technical Requirements)
└── PFD.md    (Product Foundation — konsolide analiz raporu)
```

- **`references/`** = canlı kaynaklar (proje boyunca güncellenir)
- **`reports/`** = per-file run-spesifik raporlar (`<scope>_<slug>_<ts>.md`)
- **`foundation/`** = donmuş phase çıktıları (yeni)

ALL-CAPS kısaltma standartları (PM/business dünyasının kanonik isimleri): AI ajan ve insan, "BRD" ifadesini "Business Requirements Document" diye direkt tanır.

### 1.2 References ALL-CAPS rename

`access.md` → `ACCESS.md` ... `test-strategy.md` → `TEST.md` (13 dosya). ALL-CAPS = canonical source sinyali (AGENTS.md / README.md / LICENSE convention).

Tek istisna: `env-setup.md` → `ENVIRONMENT.md` (tam kelime; `ENV.md` `.env` dosyasıyla karıştırılırdı, kısaltma değil).

`required-skills.md` **silindi** — spec §10 "skills/ kategorisi kaldırıldı" diyordu, dosya yanlışlıkla template'te kalmıştı. Persona body'sinde `capabilities` zaten var, duplikasyon.

### 1.3 Workflow gate detection: callout → approver-based (Eray cleanup)

Eski:
```markdown
3. **+product-manager:** ...
   - approver: +prime

> [!NOTE] RAPOR HAZIR
> +prime, LEGAL + GROWTH + PRD onayını bekliyorum.
```

Yeni:
```markdown
3. **+product-manager:** ...
   - approver: +prime
```

Parser `step.approver === '+prime'` → otomatik gate (`flushStep()` içinde). Callout block consume edilip ignore (backward-compat shim) ama gate üretmez.

**Sebep:** callout cosmetic markdown noise + workflow body'sinde iki yerden gate sinyali (sub-bullet vs callout) tutarsızlık + AI ajan promptunda gereksiz token. Tek-sinyal disipline.

### 1.4 Approver disipline: gate ≠ metadata

- **Gate-yapan dosyalar** (`pending_questions`'a düşer, +prime'a inbox'ta görünür): blueprint, LEGAL, GROWTH, PRD, CONTENT, STACK, DESIGN, PFD, planning-reports, release-readiness, hotfix-onayı, maintenance-raporu.
- **Metadata-only** (+engineering-manager kayıt, gate üretmez): SECURITY, DATABASE, API, TRD, TEST.

Approver +prime olmayan dosyalarda `approver:` satırı **tamamen kaldırıldı** (workflow body'sinde gürültü).

### 1.5 Reviewer satırları kaldırıldı

Eski: `- reviewer: +frontend-developer` (design-system) ve `- reviewer: +backend-developer` (api-reference). Pasif metadata — engine reviewer'ı runtime'da çalıştırmıyor. Eray sezgisiyle "frontend-developer gerçekten gelip review etsin mi?" sorusu doğru, ama runtime agent-to-agent review pattern Faz 13 scope dışı. v3.2'de geri getirilir.

### 1.6 Per-file rapor placeholder syntax + output-resolver

Workflow body'de:
```
outputs: .kortext/reports/test-reports_<slug>_<ts>.md
```

`server/engine/output-resolver.ts` runtime'da `<slug>` → `[a-z0-9][a-z0-9-]*`, `<ts>` → `\d{4}-\d{2}-\d{2}-\d{4}` regex'e çevirir. CLI executor "declared outputs not produced" check + worker-pool safety guards `findActualOutputFiles` ile pattern match yapar.

Foundation dosyaları (BRD/PRD/TRD/PFD) **static path** kullanır (overwrite semantic; git history tarih kaydı).

### 1.7 outputIndexer wiring (Faz 12.9 follow-up)

`server/index.ts` boot'unda `MarkdownSyncService` + `SafetyGuards.outputIndexer` kuruluyor; her başarılı step'in per-file output'u `reports_index`'e otomatik insert ediliyor. Dashboard Reports sayfası ekstra çağrı yapmadan günceli görür.

### 1.8 docs/ → development/ rename + konsolidasyon

`docs/` klasörü `development/` olarak yeniden adlandırıldı (geliştirici tarafı dokümantasyon olduğunu netleştirmek için). 22 dosya 4 ana doc + 1 concepts/ klasörüne konsolide:
- `DESIGN.md` ← 5 design/* + PALETTE-v3 birleşimi
- `DECISIONS.md` ← bu dosya (HANDOVER 64 + Faz 13 + design decisions)
- `ARCHITECTURE.md` ← v3.1-architecture-proposal + architecture.md Mermaid'leri
- `TODO.md` ← v3.1-todo + NEXT-STEPS + gelecek faz
- `concepts/` ← UI mockup/wireframe/concept HTML+MD

---

## Bölüm 2 — v3.1 mimari refactor kararları (Faz 11.4 + 12, 2026-05-25)

### 2.1 Hibrit data layer disipline (spec §2)

**Markdown vs SQL kuralı:**
> Markdown = "okumak / düşünmek için." SQL = "saymak / aramak / sıralamak için."

3 soru:
1. AI doğrudan okuyup ona göre davranacak mı? → Markdown
2. Dashboard'da filtrelenecek/sıralanacak/sayılacak mı? → SQL
3. İki ajan/kullanıcı aynı anda değiştirebilir mi? → SQL

Hibrit (`backlog_items`): structured alanlar SQL kolon, gövde markdown TEXT (`body_md`).

### 2.2 `.kortext/` encapsulation geri dönüşü (Faz 12.1)

v3.0 paketlemesinde `workspace/` üst klasör dağıtıldı (`agents/workflows/rules` proje köküne çıktı). v3.1'de **orijinal v2 disiplinine geri dönüş**: her şey `.kortext/` altında (`.git/` gibi). Proje kökü temiz (sadece `AGENTS.md`, `.env*`, `.gitignore`).

### 2.3 Global runtime (Faz 12.2)

`agents/workflows/rules` artık **`node_modules/kortext/` paket içinden** okunur, **proje köküne kopyalanmaz**. `kortext init` sadece `templates/` içeriğini kopyalar. Avantaj: paket upgrade otomatik yayılır (her proje init zamanı snapshot'unda donmaz).

### 2.4 v3.1 frontmatter standartları (spec §5)

**4 ayrı standart** — dosyanın **niteliği** (kanonik kaynak vs kayıt akışı vs devir notu vs ADR/ders) standardı belirler:

| Tür | Standart |
|---|---|
| **References** (file-level, kanonik) | `status, author, reviewer, approver` |
| **Reports** (file-level, kayıt) | `status, author, reviewer, updated_at` |
| **Handover** (entry-level) | her `## Handover: <id>` block kendi: `status, author, updated_at` (approver yok, `to` opsiyonel) |
| **ADR + Learned** (section-level) | `## ADR-NNN: title` + `**Author:** … \| **Status:** … \| **Approver:** …` + TOC otomatik |

**INFO callout (`> [!INFO]`) kaldırıldı** — tek YAML frontmatter standardı (duplikasyon yok).

### 2.5 Per-file rapor + reports_index (Faz 12.5)

Monolitik `test-reports.md`, `delivery-reports.md`, vb. → per-file `<scope>_<slug>_<YYYY-MM-DD-HHMM>.md`. Avantaj: doğal segment (archive gereksiz), paralel ajan çakışması yok, dashboard SQL'den sıralı/filtre.

`reports_index` SQL tablo: `id, scope, slug, file_path, author, status, tags (JSON), related_item, created_at`.

### 2.6 Handover rotation + TOC engine (Faz 12.6)

`handover.md` 5 entry veya 30 KB → `handover-<YYYY-MM-DD-HHMM>.md` rotation. Latest tek dosya, geçmiş aynı klasörde timestamp suffix. `+operation-manager` `09-maintenance-cycle`'da otomatik. Manuel: `kortext archive handover`.

**TOC engine sorumluluğunda** (persona maintenance turuna bırakılmadı): `markdown-sync.writeDecision/writeLearned` sonunda `toc-updater.updateToc()` çağırır. Opt-in (dosyada `## İçindekiler` heading varsa). Atomik tutarlılık.

### 2.7 Prompt cache disipline (Faz 12.7)

`claude-cli-executor.ts` persona body'sini `--append-system-prompt`'a gönderiyor (stable prefix). Run-spesifik şeyler (runId, stepId, timestamp) user message'da — cache invalidate etmez. `--exclude-dynamic-system-prompt-sections` user'ın global Claude settings'ini skip eder.

AGY / Codex / Gemini'de `--system-prompt` analog yok — stable-prefix discipline'ı dokümante edildi. `tests/cli-executor.test.ts` byte-equality garantisi.

### 2.8 Workflow/persona SQL index (Faz 12.8)

`workflow_steps` + `personas` SQL tabloları: markdown source kalır, engine boot'ta parse edip SQL'e upsert. Parse-time FK validation: bilinmeyen `+ajan` referansı fatal throw (`index-sync.ts`).

**+prime synthetic row**: `agents/prime.md` yok ama workflow step'ler `+prime` referansı veriyor. Boot'ta synthetic row eklenir (`source_path: '(synthetic)'`).

### 2.9 Clean break (spec §12)

v3.0/v3.1 production'da kullanıcı yok. Geriye dönük destek gerekmiyor:
- `kortext migrate` komutu **YAPILMAYACAK**
- v3.0 → v3.1 geçiş tooling **yok**
- v3.1 = clean break, herhangi bir v3.0 yapısıyla uyumluluk derdi yok

### 2.10 Yapılmayan (Eray reddetti)

- **Override mekanizması** (`~/.kortext/overrides/`) — paket fork'lansın
- **`skills/` klasörü** — LLM expertise + persona + referans yeterli
- **`archive/` ayrı klasör** — memory'nin içinde rotation
- **Settings/Agents YAZMA editor'ü** — readonly, yazma v3.2'ye
- **Reviewer-as-step runtime** — agent-to-agent review pattern v3.2'ye

---

## Bölüm 3 — v3.0 → v3.1.x kararları (Faz 0-12 özeti, HANDOVER §1-§64)

> 64 numaralı tasarım kararı toplam. Aşağıdaki kategorize özet **bu maddelerin kanonik kaydıdır** (eski `HANDOVER-v3.md` docs/ → development/ konsolidasyonunda silindi). Komit-bazlı tarihçe için `git log development/DECISIONS.md`.

### 3.1 Stack + core (#1-#18 — Faz 0-5)

1. **`KORTEXT_PORT` ≠ `PORT`** — Preview tooling `PORT=5173` enjekte ediyor; backend kendi env değişkenini kullanır.
2. **better-sqlite3 ≥ 12.x** — Node 26 V8 ABI değişiklikleri.
3. **`.ts` import uzantıları** — `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (TS 5.7).
4. **Timestamp = INTEGER Unix ms** — dashboard tarafında `new Date(ms)` ucuz.
5. **JSON kolonu = TEXT** — `json_extract()` ile sorgulama, `server/db/json.ts` helper'ları.
6. **DAG = veri akışı tabanlı** — inputs/outputs üzerinden çıkarım (paralelleştirme bu sayede otomatik).
7. **"Pull ready" scheduler** — topological yerine reactive scheduling; default concurrency 3.
8. **Markdown ↔ SQLite split:** insan-kaynak disk-only; üretilen artefakt hem disk hem SQLite index; runtime state SQLite-only.
9. **CLI çağrıları shell-free** — tüm spawn `{ shell: false }`, prompt stdin'den.
10. **Worktree branch namespace**: `kortext/run-<id>` — kullanıcı branch'leriyle çakışmaz.
11. **Quarantine korunur, silinmez** — `kortext cleanup` ile yaşlandığında siler.
12. **3 ayrı tam CLI executor** (paylaşılan abstract base yok): her lifecycle tek dosyada.
13. **Safety post-step**: success path'inde declared `outputs:` dosyaları + log taranır.
14. **Frontmatter parser minimal** — tam YAML değil.
15. **Gate barrier ≠ DAG**: workflow gate'leri scheduler tarafında ayrı bir barrier; DAG saf veri akışı kalır.
16. **Reddetme/orphan kurtarma = `cancelled` + prefix convention**: `error_message: rejected:|orphaned: ...`.
17. **İş başına 1 worktree, paralel iş = paralel worktree**.
18. **Persona-routed executor**: persona handle → executor map.

### 3.2 React Dashboard + MCP (#19-#33 — Faz 6-7)

19. **TanStack Router + hash history** — Express SPA fallback gerekmiyor.
20. **Tailwind v4 `@theme inline` + CSS variables** — palette tek kaynak.
21. **API tipi mirror** (`src/lib/api-types.ts`) — frontend bundle better-sqlite3'ü çekmesin.
22. **Allow-listed docs scope** — `/api/docs/:scope` 5 scope; `path.resolve` + prefix traversal koruma.
23. **Marked + DOMPurify** — XSS koruma.
24. **PersonaRegistry hot-reload** — Map in-place mutate; route handler referansı değişmez.
25. **Validate-before-write** — PUT `/api/personas/:handle` önce parse, handle değişmişse 400.
26. **Tek polling kaynağı + Context fan-out** — `PendingQuestionsProvider`.
27. **Toast yeni-id signal** — `useRef<Set<number>>` ile "az önce gördüğüm" id'leri tut.
28. **Overlay pattern** — TerminalPanel + TimelinePanel + Toasts `position: fixed`.
29. **Factory + injectable deps** (MCP) — stdio/SSE/test aynı factory.
30. **Stdio'da `console.log = console.error`** — stdout JSONRPC.
31. **SSE oturum başına yeni McpServer** — handler state transport'a kilitli.
32. **Tool envelope = JSON text + structuredContent** — eski + yeni client uyumu.
33. **`approve_blueprint` = frontmatter rewrite** — BlueprintWatcher'ın izlediği dosyaya `status: approved` yaz.

### 3.3 CLI + Test + Yayın (#34-#52 — Faz 8-10 + Post-10)

34. **Üç pure command modülü + ince bin layer** — `server/cli/*` console-free.
35. **`buildServeCommands` DI ile testlenebilir** — `existsImpl` parametresi spawn-free unit test.
36. **`init` idempotent + per-entry skip** — `--force` user override.
37. **`init` template kaynağı `bin/`'in bir üst dizini**.
38. **Migration runner copy step** — `tsc` `.sql` kopyalamıyor; `scripts/copy-migrations.mjs`.
39. **`bin/kortext.js` dual-mode shim** — dist tercih, tsx fallback.
40. **`serve` SIGINT propagation** — tek parent process iki child, biri ölünce kardeş öldür.
41. **`packageRoot()` walk-up** — source + compiled iki layout'ta da `package.json` bul.
42. **CI lint pre-existing debt fix** — eslint config `.js/.mjs/.cjs` Node globals.
43. **GHA workflow heredoc gotcha** — `.github/workflows/*.yml` Write hook blokluyor; `cat > file <<EOF` tek yol.
44. **Mock executor + tmp tmp dir E2E pattern** — `mkdtempSync` + CI deterministik.
45. **`npm publish --provenance`** — OIDC ile cryptographic attestation.
46. **Publish gate = CI gate'in aynısı** — lint + typecheck + test + build + smoke publish'ten önce tekrar.
47. ~~**HANDOVER-v3.md pakete dahil**~~ → Faz 13'te docs/ → development/ konsolidasyonunda silindi; `development/HANDOVER.md` artık pakete dahil değil (`.npmignore`).
48. **Express dist/web'i kendi serve eder** (prod). Node 26 spawn race fix.
49. **Prod mod = in-process import**, dev mod = spawn. Node 26 spawn() + stdio:inherit child immediate exit.
50. **Walk-up `packageRoot()` pattern her yerde tutarlı** — 4 modülde aynı pattern.
51. **app.listen() error handler eksik (v3.0.1 borç)** — EADDRINUSE sessiz fail.
52. **Lokal install pattern UAT için** — `npm pack` + `npm install -g ./kortext-X.Y.Z.tgz`.

### 3.4 UI v4 wireframe alignment + onboarding (#53-#58 — Faz 11)

53. **`test` status additive migration** — SQLite ALTER CHECK desteklemediği için backlog_items rebuild pattern.
54. **`/api/decisions` minimal endpoint** — Memory Decisions tab tek tüketici.
55. **`/api/docs/:scope` response shape change** — `files: string[]` → `files: {name,size,mtime}[]`.
56. **Settings panes monolith** — 8 pane tek dosyada (`src/routes/settings-panes.tsx`), cross-pane primitives.
57. **`React.ReactNode` yerine named import** — `import { type ReactNode } from 'react'` (lint kuralı).
58. **Heredoc fallback Write hook için** — sanitization katmanı (marked + DOMPurify) zaten yerinde.

### 3.5 Faz 12 mimari refactor (#59-#64)

59. **`outputIndexer` callback slot** = engine-adapter ayrımı — worker-pool reports indexer'ı doğrudan import etmek yerine `SafetyGuards`'a opsiyonel callback.
60. **Prompt cache disipline'i = stable prefix** — cache hit'in temeli `--append-system-prompt`'a byte-identical içerik.
61. **TOC engine sorumluluğu** — persona maintenance turuna bırakılmadı; `markdown-sync.writeDecision/writeLearned` sonunda atomik update.
62. **`+prime` synthetic persona row** — `agents/prime.md` yok ama workflow step'ler referans verebilir; boot'ta synthetic row eklenir.
63. **Per-file rapor naming + tags JSON kolon** — spec'te bilinçli erteleme ("zenginleşebilir" notu).
64. **`React.ReactNode` namespace yasak (lint kuralı pekiştirildi)** — `no-undef` namespace görmüyor; named import zorunlu.

---

## Bölüm 4 — Tasarım kararları (Faz 6 + v3 palette geçişi)

### 4.1 Proje-seviyesi tasarım kararları

| Karar | Seçim | Gerekçe |
|---|---|---|
| Hedef kullanıcı | Kod bilmeyen herkes (PM, founder, ürün sahibi) | Kortext'in misyonu |
| Görsel stil | **Mission control / dark theme** | Multi-agent orchestration için doğru ton |
| Dil | İngilizce UI (i18n layer sonra) | Global hedef kitle |
| ~~Multi-project~~ ⚠️ | ~~YOK — her kurulum tek proje~~ | **Bölüm 0'da (2026-05-27) geri çevrildi** — v3.1 tek-daemon-çok-proje mimarisine geçecek |
| Light theme | v0.2'ye ertelendi | Şimdilik dark only |

### 4.2 Renk paleti — v2 indigo → v3 vibrant purple (2026-05-21)

**Eski v2 (indigo + cyan signal):**
```css
--accent:   #6366F1   /* indigo */
--signal:   #06B6D4   /* cyan */
```

**Yeni v3 (purple + pink — kanonik, mevcut):**
```css
--bg-0:     #0A0814   /* purple-tinted black */
--accent:   #A855F7   /* purple-500 */
--signal:   #EC4899   /* pink-500 */
--warning:  #F59E0B   /* +prime amber, korunur (cortex/sun metaforu) */
```

Felsefe: **Vibrant accent + Enterprise discipline**. Linear, Stripe Dashboard, Notion referansı. "Karnaval değil, control panel."

### 4.3 Orbit ekranı — 4 iterasyon sonrası bulunan paradigm

1. **v1 — Radyal SVG circle graph**: node'lar küçük, generic AI mind map hissi → reddedildi
2. **v2 — Mission Floor pod layout**: 3 squad sütun → orbit metaforu kayboldu, kanban hissi → reddedildi
3. **v3 — Premium refined circles**: gradient fills + glow halos → "circles in space, bilgi yok" → reddedildi
4. **v4 — Radyal yerleşim + dikdörtgen kartlar (FINAL)** ✓: viewBox 1400×920, `<foreignObject>` ile HTML kart embed, avatar+name+model+task+status — Eray onayı: *"bu oldu işte"*

**Anahtar prensip:** Radyal yerleşim hiyerarşiyi anlatır, dikdörtgen kartlar durumu anlatır.

### 4.4 v4 wireframe = TEK visual spec (2026-05-22)

`development/concepts/wireframe-v4-final.html` aktif visual spec (~2400 satır). Eski mockup'lar (`mockup-v2`, `mockup-v3-palette-preview`, `wireframe-v3-ops`) **artık referans değil** — `development/concepts/` altında arşiv olarak duruyor.

Vercel discipline:
- Zero card fill (border-only regions)
- Mono ID/timestamp (JetBrains Mono)
- Status = dot+text (no fill)
- One primary CTA per screen
- 200ms ease-out only
- No glow, no constant pulse, no fancy graphs

### 4.5 14 ajan persona renkleri (v3 palette)

`src/lib/persona-colors.ts` — 14 persona handle → hex + initials:

| Persona | Renk | Rol |
|---|---|---|
| operation-manager | `#A855F7` purple | Orchestrator (yeni primary brand) |
| product-manager | `#3B82F6` blue | Backlog & strategy |
| engineering-manager | `#7C3AED` violet-deep | Code & arch |
| delivery-manager | `#F97316` orange | Release & hotfix |
| backend-developer | `#6366F1` indigo | Server & API |
| frontend-developer | `#EC4899` pink | UI/client (signal rengi ile uyumlu) |
| designer | `#10B981` emerald | UI/UX |
| qa-engineer | `#EAB308` yellow | Tests |
| db-admin | `#14B8A6` teal | Schemas |
| devops-engineer | `#EF4444` red | Infra/CI |
| security-engineer | `#DC2626` red-deep | Audits (devops'tan ayrışsın) |
| copywriter | `#84CC16` lime | Marketing copy |
| compliance-expert | `#22D3EE` sky | Legal/GDPR |
| growth-expert | `#F43F5E` rose | Metrics |

`+prime` (Eray, sentetik) — amber `#F59E0B` (cortex/sun metaforu).

### 4.6 Memory + Inbox + Reports tasarım kararları

| Karar | Detay |
|---|---|
| Memory tab sayısı | 3 (Decisions, Learned, Handovers) |
| Memory kart yapısı | Expandable — tıklayınca tam içerik |
| Inbox reject form | **Required reason** (5+ char) + optional revision instructions |
| Inbox Send button | Reason 5+ char olana kadar disabled |
| Reports 3 mod | view / edit / revise (sibling div'ler display:none ile toggle) |
| Reports revise form | Required feedback (5+ char) |

### 4.7 Settings — 8 pane

Project / Agents (+models merged) / Rules / Workflows / Hooks / Integrations / Environment / Danger zone. Spec §10: Settings/Agents/Workflows/Rules **readonly** (paket içi `.md` render; yazma v3.2'ye).

### 4.8 Backlog kararları

| Karar | Detay |
|---|---|
| Kolon sayısı | 6 (Epic \| To Do \| In Progress \| Test \| Review \| Done) |
| ~~Story~~ kaldırıldı | Framework'te bu görev tipi yok |
| ~~Complexity rozeti~~ kaldırıldı | Framework'te yok |
| ~~Priority etiketi~~ kaldırıldı | Önceki wireframe'de hatalı |
| Sample backlog | 4 Epic (E-001..E-004) + 13 task/bug/debt |

---

## Bölüm 5 — Tarihçe (özet)

**v3.0 Roadmap — Faz 0-10 (2026-05-21 → 2026-05-22):**
| Faz | Tag | Sonuç |
|---|---|---|
| 0 | `v3.0.0-alpha.0` | Stack iskeleti |
| 1 | `v3.0.0-alpha.1` | SQLite şema (13 tablo) |
| 2A+2B | `v3.0.0-alpha.2/3` | Engine + worker pool + worktree + CLI executor + gate + safety |
| 3 | — | Otonom orkestratör (chainer/watcher/queue/dispatcher) |
| 4 | — | Üretim sertleştirmesi (orchestrator wiring + mid-run gate + persona-routed executor + cleanup + resume) |
| 5 | — | Persona + workflow TS portu (registry + handover + item lifecycle) |
| 6 | — | React Dashboard (6 ana route + 8 settings pane + 4 overlay) |
| 7 | — | MCP Server (15 tool, stdio + SSE) |
| 8 | — | CLI + bin (init/serve/start/approve/status/logs/cleanup/doctor/mcp) |
| 9 | — | Test + CI (264 test → GHA pipeline) |
| 10 | `v3.0.0` | Yayın + dokümantasyon |

**v3.1 — Onboarding + mimari refactor (2026-05-23 → 2026-05-26):**
| Faz | Sonuç |
|---|---|
| 11 | Onboarding wizard + dashboard polish |
| 11.1 | v4 wireframe alignment (shell + dashboard) |
| 11.2 | v4 alignment (board/memory/reports/references/settings) |
| 11.3 | Lokal UAT + 17 davranışsal fix (claude headless tool use vb.) |
| 11.4 | v3.1 planning + clean-break (skills/+settings/+legacy/ silindi) |
| 12.1+12.2 | `.kortext/` encapsulation + global runtime |
| 12.3 | `templates/` (38 iskelet) |
| 12.5 | Per-file reports + reports_index |
| 12.6 | Handover rotation + TOC engine |
| 12.7 | Prompt cache aktivasyonu |
| 12.8 | Workflow/persona SQL index + FK validation |
| 12.9 | Backlog UI + readonly editors |
| **13** | **Workflow content rewrite + output-resolver + outputIndexer wiring + foundation kategorisi + ALL-CAPS references + callout → approver-based gate + docs/ → development/ konsolidasyon** |

---

## Bölüm 6 — Reddedilenler

Bu maddeleri ne kadar mantıklı görünseler de tekrar gündeme getirme:

- **Migration scripti** (v3.0 → v3.1) — clean break, kullanıcı yok
- **Override mekanizması** (`~/.kortext/overrides/`) — paket fork'lansın
- **`skills/` klasörü** — LLM expertise + persona + referans yeterli
- **`archive/` ayrı klasörü** — memory'nin içinde rotation
- **`workspace/` üst klasörü** — `.kortext/` altına çekildi
- **Geriye dönük v3.0 destek** — clean break
- **`bin/migrate-legacy-backlog.ts`** — v2 kullanıcı yok
- **INFO callout'ları korumak** — tek YAML frontmatter standardı
- **Settings/Agents YAZMA editor'ü** — readonly, yazma v3.2'ye
- **Workflow gate callout'ları** (`> [!NOTE] RAPOR HAZIR`) — approver tek sinyal
- **Reviewer-as-step runtime** — Faz 13 scope dışı, v3.2'de
- ~~**Multi-project switcher** — her kurulum tek proje paradigması~~ → **Bölüm 0'da (2026-05-27) reddedilme geri çevrildi:** v3.1 multi-project daemon mimarisine geçecek.
- **Lineer workflow progress** — loops var (review → fail → back to dev)
- **4-tab Deep Dive** — Live'a merge edildi
- **Circle nodes in Orbit** — 3 iterasyon sonra dikdörtgene geçildi
- **Mission Floor pod layout** — orbit metaforu kayboluyordu
- **`/AGENTS.md` (repo kökü, v3.0 path'leri ile)** — silindi, `templates/AGENTS.md` kanonik
- **`templates/AGENTS.md`'de foundation eksik** (v3.1.0'da) — Faz 13'te eklendi
- **Repo kökü `.env.example`** — duplicate + bayat path, silindi
