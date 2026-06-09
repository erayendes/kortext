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

> **✅ Adlandırma standardı revizyonu (2026-06-08 #6, UAT #5 — UYGULANDI, odaklı kapsam):** `<scope>_<slug>_<ts>` deseni **tutarsızdı** (workflow/template/resolver farklı ts formatları → antigravity koşusunda planning çöktü). **Kanon:** her rapor/dosya adı `report-type_project-id_<ts>` — `<slug>` yerine **project-id (`project.json.code`, örn. NOT)**, **tek ts formatı `YYYY-MM-DD_HH-MM-SS`**. Örn. `status-reports_NOT_2026-06-08_17-46-49.md`. **`planning-reports` türü kaldırıldı** (template'i yoktu = çökme sebebi; planning özeti `status-reports`'a yazılır, planning-pipeline.md konsolidasyon adımı düzeltildi). **Uygulandı:** `markdown-sync.formatReportTimestamp`→canonical ts + `REPORT_FILENAME_PATTERN` (yeni ts + UPPERCASE project-id, eski ts back-compat); `output-resolver.ts` SLUG_PATTERN (uppercase) + TIMESTAMP_PATTERN (her ayraç varyasyonu: `-`/`_`/`:`/`T`/boşluk — antigravity `_174649` formu artık eşleşir, §890'ın bir adım ötesi). **Odaklı kapsam (Eray onayı):** sadece planning + resolver; diğer workflow'ların statik rapor adları (`test-reports.md` vb.) şimdilik dokunulmadı (ayrı follow-up).

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

## Bölüm 5 — Development + Test Lifecycle redesign (2026-05-29 → 2026-05-30)

**Status:** Eray onayladı (design level). **Tüm workflow dizini bu modele göre yazıldı/yeniden adlandırıldı** (10 workflow); motor/şema implementation'ı bekliyor (5.9). development-cycle kısaltıldı, test-cycle 5-gate paralel gate-run, deployment ortam merdiveni, rollback+hotfix ayrı düz akışlar, spike otonom+gate, maintenance silindi. Süreç: **önce tüm workflow dizini, sonra motor** (5.10).

### 5.1 Engine-owns-mechanics + iki katman (substrat vs agent gate)

Workflow metinleri **ajan niyetini** anlatır (ne üretilecek, ne doğrulanacak, hangi durum değişecek); git/branch/worktree/merge/CI gibi **mekanik işleri motor üstlenir**. Eski development-cycle bir insan ekibinin elle yaptığını (branch aç, PR aç, merge et) tarif ediyordu — motorun zaten otomatik yaptığını elle anlatmak tekrar + çelişki.

**Turnusol (iki katman):** bir adım, ancak bir **agent otomasyonun ötesinde yargı/akıl** kattığında "gate" (persona işi) olur. Aksi halde **motor substratıdır**.
- **Substrat (motor, her zaman, agent YOK):** worktree/branch, lint, type-check, unit/integration test koşumu, SAST/CVE/secret tarama, merge mekaniği, conflict tespiti, blocker temizleme, handover üretimi, worktree/preview teardown, epic-close tespiti, deployment tetikleme.
- **Agent gate (yargı, planning seçer):** code-review, quality-control, security-control, design-review, UAT (insan).

**Sebep:** Motor #10/#17 (worktree-per-run), #18/#24 (persona-routed executor), #7 (pull-ready scheduler) zaten kurulu. "Her zaman otomasyon olan" şeye agent koymak boş maliyet — örn. security-engineer'a "secret'leri grep'le" dedirtmeyiz (tarayıcı yapar), ona "bu authz mantığı doğru mu?" sorulur.

### 5.2 Kolon modeli

```
to_do → in_progress → test → review → done
              ↑ fail/reject (+ bulgu bölümü) ┘
  herhangi non-terminal → blocked → (unblock) in_progress
  done, cancelled = terminal
```

- `in_progress` = assignee geliştirir · `test` = seçili gate'ler PARALEL · `review` = UAT (prime, seçiliyse) · `done` = development'a merge edilmiş & terminal.
- **`merge` kolonu KALDIRILDI** (önceki tasarımda eklenmişti). Merge artık ayrı kolon/insan adımı değil — `review` geçince **motorun mekanik kapanış işi**. devops per-item'da yok (5.3).
- `test` status'u Faz 11'de board için eklenmiş (#53) ama lifecycle'da geçişi yoktu. Bu redesign'da bağlanır.

**Eklenecek geçişler** (`item-lifecycle.ts`): in_progress→test, test→{review, in_progress}, review→{done, in_progress}. (`merge` status EKLENMEZ.)

### 5.3 Gate modeli — 5 gate, planning-seçimli

development sonrası tüm yaşam döngüsü = **seçilebilir gate'ler kümesi**. Her gate aynı sözleşme: **pass → ilerle · fail → in_progress + assignee + o gate'in bulgu bölümü.** Hangi gate'lerin uygulanacağı **planning-pipeline'da** item'a işlenir (0–N). "Her gate her zaman olmaz."

| Gate etiketi | Persona | Faz | Okur (references-only) |
|---|---|---|---|
| `code_review` | `+engineering-manager` | test (paralel) | STACK, STRUCTURE, GLOSSARY (+rol: API, DATABASE, DESIGN) |
| `quality_control` | `+qa-engineer` | test (paralel) | TEST |
| `security_control` | `+security-engineer` | test (paralel) | SECURITY |
| `design_review` | `+designer` | test (paralel) | DESIGN |
| `uat` | `+prime` (insan) | review (test'ten sonra) | — |

- **+engineering-manager** development-cycle'ın sürücüsü DEĞİL artık — planning-seçimli bir gate. Eski "tek yönetici darboğazı" kalktı; sürücü = assignee-developer (5.8). EM diğer workflow'larda (planning/analysis/hotfix/rollback/maintenance) hâlâ geçerli.
- **`security_check` → `security_control`** rename (quality-control / devops-control ile tutarlı).
- **devops-control per-item gate'lerden ÇIKARILDI (A kararı):** merge mekaniği zaten motorun (CI+conflict, her zaman). devops-engineer'ın gerçek yargısı (deploy/migration/infra/rollback) **deployment-cycle'a** ait. Kapanışın tamamı mekanik (merge/blocker/handover/worktree/tespit/tetik = motor); tek yargı parçası staging deploy → o da deployment-cycle. Yani devops'un per-item rolü yok.
- **UAT neden test'ten sonra (paralel değil):** prime en pahalı kaynak (insan); makine/uzman gate'leri geçmemiş build'i prime'a göstermek boşa zaman.

### 5.4 Sahiplik: developer sabit + "sıra kimde" türetilir

İki kavram tek alana sığmaz, ayrıldı:
- **Sahip (`assignee`)** = işi yapan developer. **Sabit** — item'ın ömrü boyunca (done dahil) değişmez. Hesap verebilirlik/handover/tarihçe bunun için. Bounce'ta bile aynı developer'a döner.
- **"Sıra kimde"** = şu an kimin aksiyon alacağı. Ayrı saklanmaz; **kolon + bayraklardan türetilir** (in_progress→developer · test→seçili gate'ler · review+uat→prime · done→kimse).

Motor **asla sahibi prime/devops ile ezmez** — yoksa biten her görevin sahibi son dokunan persona (devops) olurdu, "kim yaptı" kaybolurdu.

**Paralel gate'lerde "aynı item çok persona'da" sorunu:** sahip developer sabit kalır; gate'ler "atama" değil **ayrı izlenen kontrol koşuları (gate-run)** — her birinin kendi persona'sı + durumu + **kendi bulgu bölümü**. Board'da item `test`'te durur, üstünde paralel rozetler.

> Sadeleşme: bu, eski `+approver` dinamik token'ını gereksiz kılar — "`uat` gate açık" = "prime onayı gerekli". Ayrı `approver` alanı yerine `uat` gate bayrağı.

### 5.5 Inputs: references-only, role-relevant, foundation ASLA

- **Foundation → references devri:** analysis/setup PRD/TRD okur, reference'ları üretir. O andan sonra source-of-truth references'tır. Downstream workflow'lar (development, test, deployment) references okur, foundation'a dönmez (gereksiz token + iki-kaynak tutarsızlığı). Bu ilke tüm downstream rewrite'larında uygulanır.
- Implementation `inputs:` = **core-5**: STACK, STRUCTURE, GLOSSARY, SECURITY, TEST. Rol-bağımlı olanlar metin yönlendirmesiyle: backend → API+DATABASE, frontend → DESIGN+API.
- Developer **okumaz**: ACCESS, CONTENT, GROWTH, LEGAL, ENVIRONMENT, foundation. (ACCESS+ENVIRONMENT'i **deployment-cycle'da** +devops-engineer okur — per-item merge'de değil.)

### 5.6 Ortamlar + veri politikası → ACCESS.md

ACCESS.md'ye "Ortamlar" bölümü: staging = **test verisi**, preprod = **canlı veri**, prod = **canlı veri**. Developer ACCESS okumaz (ops/devops/prime konusu) — 5.5 kararıyla tutarlı.

**Güvenlik notu:** preprod canlı veri tuttuğu için prod-seviyesi koruma gerekir (KVKK/GDPR). ACCESS.md'de veri sınıfı yazılırken SECURITY.md/LEGAL.md çapraz referansı.

### 5.7 Local test URL (PR-open) + epic-close staging

- **Test girişinde:** assignee `test`'e çekip PR açınca, çalıştırılabilir/UI'lı görevse motor worktree'den **local test URL** ayağa kaldırır. Gate'ler (qa davranışsal, design görsel) **ve** sonra prime UAT bu URL üzerinde test eder. **Test verisi** kullanır; worktree silinince URL kapanır. (Eski "Final Review'da preview" → artık PR-open'da, gate'ler de kullanır.)
- **Epic kapanışı:** item bir epic'i bitirdiyse → motor `06-deployment-cycle` staging deploy tetikler + staging URL paylaşılır. (Per-item merge'de ayrı kalıcı deploy YOK.)

### 5.8 development-cycle kısaldı + test-cycle paralel gate-run

- **development-cycle = sadece implement → `test`'e taşı.** assignee `test`'e çekince **biter**. Eski "verify/review/merge bekle-bekle" adımları kalktı (bounce zaten akışı baştan tetikler). Bu, "item'ı kim taşır" çift-sahiplik çatışmasını **kökten** çözer (dev-cycle artık test'i geçmiyor).
- **test-cycle = `test` kolonu sahibi**, ayrı reusable modül (hotfix/rollback/deployment de kullanır — DRY).
  - Motor **seçili gate'leri PARALEL** fan-out eder (gate-run kayıtları).
  - **Join motorun işi:** paralelde "son persona" yok — motor "hepsi pass mi?"yi görür. Hepsi pass (veya 0 test-gate) → `review`. ≥1 fail → motor `in_progress`'e döndürür, **her gate kendi bulgu bölümünü** yazar (tek karışık blok değil), assignee'ye atar → dev-cycle baştan.
  - `review`: `uat` seçiliyse prime onayı (reject→in_progress); sonra motor mekanik kapanış: CI+conflict → merge→development → blocker temizle → handover üret → worktree/preview kapat → `done`.
- Eski "Karar adımı" ve çift `review` set'i kalktı (test→review tek sahip: motorun join'i).
- **Gate çıktısı = check, rapor değil (Eray kararı 2026-05-30):** her gate item'da bir **gate-run kaydı** bırakır (DB: pass/fail + kısa bulgu; fail'de developer onu görür). Gate başına markdown rapor dosyası ÜRETİLMEZ — her item'da 4 ayrı `*-reports` çoğu okunmayan gürültü + token. test-cycle gate'lerinin `outputs` = sadece `item-tested`. **Toplu denetim raporu** epic kapanışında motor tarafından üretilir (tüm item gate sonuçlarının özeti, tek okunan belge). gate-run şeması §5.9 #3; epic-close rapor üretimi §5.9 #8'e bağlı.
- **code-review SECURITY okumaz:** EM gate'i `STACK`+`STRUCTURE`+`GLOSSARY` (+rol: API/DATABASE/DESIGN) okur; güvenlik ayrı gate (`security_control` → +security-engineer). Dar okuma = keskin rol = temiz paralel gate (5.1 turnusol).
- **test-cycle dosya rename:** `05-test-cycle.md` → `test-cycle.md` (rakam-önek kaldırıldı; spike/maintenance rename'leriyle aynı sadeleştirme).

### 5.9 Motor / şema iş listesi (implementation bekliyor)

1. ✅ (2026-05-31) `item-lifecycle.ts`: `test`'i bağla + 5.2 geçişleri (in_progress→test, test→{review,in_progress}, review→{done,in_progress}). `merge` status EKLENMEZ. → implement detayları + kararlar §5.13.
2. ✅ (2026-05-31, kolon+repo) schema: item'a **gate seçimi** alanı (`code_review`/`quality_control`/`security_control`/`design_review`/`uat`; frontmatter ya da kolon). planning-pipeline yazar. → §5.13 (`review_gates` tip'li kolon seçildi; `setReviewGates`; MCP write-path ayrı iş).
3. ✅ (2026-05-31, tablo+repo) **gate-run modeli:** `gate_runs(item_id, gate, persona, status, findings, ts)` — paralel kontrollerin + gate-başına bulgu bölümlerinin evi. Ayrıca genel item yorumu (block sebebi vb.) için hafif comment alanı. → §5.13 (`attempt` ayırıcı eklendi; comment alanı ERTELENDİ).
4. ✅ (2026-05-31, mock-first) orchestrator: `test`'e giren item için seçili gate'leri **paralel fan-out** + **join** (hepsi pass→review · ≥1 fail→in_progress + bulgular). → §5.13 (`runTestCycle` + `GateExecutor`; uat hariç = review +prime; gerçek-agent ertelendi).
5. "sıra kimde" türetimi (kolon+bayrak) board göstergesi için; `assignee` (sahip) alanı sabit kalır, motor ezmez.
6. worktree/orchestrator: development-cycle run base=`development`; `review` sonrası mekanik kapanış (CI+conflict → merge → blocker temizle → handover üret → worktree/preview kapat → done).
7. worktree: **local test URL** PR-open'da ayağa kaldırma (gate'ler + prime kullanır); worktree silinince kapat.
8. closing: epic-completion tespiti → `06-deployment-cycle` (staging deploy) tetikleme. devops yargısı orada.
9. orchestrator: block tetiği → run cancel (ajanları durdur) + status=blocked + sebep + prime'a ata.
10. orchestrator: hazır item'lar için paralel per-item run (sınırlı eşzamanlılık, her biri kendi worktree).
11. `AGENTS.md`/`behavior.md`: kesişen kural — karar→`write_decision`, öğrenim→`write_learned` (her persona, iş sırasında).

### 5.10 Süreç: önce workflow dizini, sonra motor

Tüm workflow markdown'ları **önce** bu modele göre yazılır/düzeltilir; **motor işi (5.9) sona** bırakılır. Sebep: markdown ucuz — tasarım kayarsa öncekiler kolay düzeltilir; motor kodu erken yazılırsa tasarım kayınca çöpe gider. Bitmiş workflow dizini + bu bölüm = **motorun donmuş spec'i**. Workflow yazarken yalnızca **parse/yeşil** kalması için minimal motor dokunuşu olabilir; davranışsal motor işi ertelenir.

### 5.11 Deployment = ortam merdiveni (item→dev, epic→staging, version→preprod, onay→prod)

Branch modeli **sıralı tek-trunk** (git-flow eksi release branch, artı ortam merdiveni; version'lar sıralı, örtüşmez):

```
feature worktree → development → main
       ↑               ↑           ↑
   her item      (entegrasyon)  preprod onayı
ortam:  local      staging        preprod      prod
        (item)     (epic done)    (version done)(onay)
```

- **item done** → motor feature worktree'yi `development`'a merge eder (test-cycle kapanışı).
- **epic done** → motor `development`'ı **staging**'e (test verisi) deploy eder; o epic'te gate koşmuş personalar tek-dosya rapor yazar (qa/security/designer/EM/devops, paralel), motor prime'a **staging onayı** sorar.
- **version done** (tüm epic'ler staging onaylı) → motor **preprod**'a (canlı veri, KVKK/GDPR) deploy eder; devops doğrular, motor prime'a **preprod onayı** sorar.
- **preprod onayı** → motor `development`'ı `main`'e merge eder + **prod** deploy + tag. `main` = release-only (canlıda ne var).
- **Red (staging/preprod)** → motor gerekçeyle bug açar, epic owner'a atar; bug çözülmeden ilerlemez.
- **`main` nedir:** sadece prod release hedefi. Tüm entegrasyon `development`'ta; ortamlar (staging/preprod/prod) ayrı branch değil, `development`/`main`'in deploy fotoğrafı.
- **Monitoring:** ajan "15 dk izle" YAPMAZ (insan davranışı; ajan bloke bekleyemez). Ajan ölçülebilir eşik + alarm **tanımlar**; motor deploy sonrası gecikmeli kontrolü planlar (5.1 turnusol: ajan=yargı, motor=zaman).

### 5.12 spike otonom+gate · maintenance silindi · rollback + hotfix (ayrı)

- **maintenance-pipeline SİLİNDİ:** ürettiği her şey (debt gözden geçirme, yeni debt/bug, bağımlılık/güvenlik taraması çıktısı) zaten **planning + backlog girişi + development**'a eriyor. "Bakım modu" otonom sistemde anti-pattern — backlog sürekli canlı; periyodiklik bir tetikleme/zamanlama meselesi, ayrı workflow değil. Tek "kendine ait" üreticisi yoktu.
- **spike-pipeline TUTULDU + yeniden modellendi:** tek "karar/bilgi (ADR) üreten" workflow. Non-coder prime teknik kararı veremez → silmek belirsizliği çözülemez yere iter. Model: **otonom tetik** (planning'de planlı / development'ta runtime tespiti — prime "çalıştırayım mı" sorusu YOK) → otonom koş → **her zaman** prime'a sade rapor + `+prime` gate (belirsizlik/araştırma/seçim/gerekçe/elenenler/maliyet). Onay gelmeden karara bağlı geliştirme başlamaz. Gate "haber" değil **kapı** — "sessiz pahalı commitment" riskini kapatır. spike nadir olduğu için her-zaman-gate darboğaz değil.
- **rollback + hotfix → AYRI iki düz akış (önce birleşti, sonra GERİ AYRILDI):** İlk tasarım tek `incident-pipeline` idi (triaj yol seçer, seçilmeyeni motor no-op geçer). **Adversarial doğrulama bunu kırık buldu (2026-05-30):** motorda koşullu-dal yok; ortak kapanış adımı her iki yolun + hotfix'in `incident-resolved` token'ına 3-üretici fan-in ile bağlanıyordu. Motor sadece `succeeded` adımı `done` sayar → seçilmeyen yol skipped kalınca kapanış/smoke/post-mortem **asla ready olmaz = deadlock**. Çözüm: `rollback-pipeline.md` (triaj→kod+migration rollback→kapanış) + `hotfix-pipeline.md` (triaj→minimal fix+test→kapanış) **ayrı** dosyalar; her biri tek düz çizgi, çoklu-üretici fan-in YOK, deadlock imkansız. Yol seçimi insan komutuyla (`!rollback`/`!hotfix`); her triaj adımı yanlış yol seçilmişse diğerine yönlendirir. **Ders:** "motor seçilmeyeni atlar" varsayımı yanlıştı — engine-owns-mechanics ancak engine o mekaniği DESTEKLİYORSA geçerli; koşullu-dal §5.9'da yok.
- **zincir-dikiş düzeltmesi (2026-05-30):** Aynı doğrulama, 4 workflow'un (`test-cycle`, `deployment-cycle`, `spike-pipeline`, eski `incident`) "Sonraki akış:" satırının parser'ın `NEXT_WORKFLOW_RE`'sine uymadığını (backtick'ten önce düz proz → `nextWorkflowId=null`) saptadı. Bu geçişler zaten **koşullu** (epic done→staging, version done→preprod, prime onayı, milestone) — otomatik zincir OLMAMALI. Satırlar `**Sonraki:**` + "koşullu, motor işi (§5.9), otomatik zincir değil" diye dürüstçe yeniden yazıldı (null = beklenen, sessiz yalan değil). Çalışan otonom zincir: `new/existing-analysis → planning → environment-setup → development-cycle → test-cycle`.
- **rename (rakam-önek kaldırıldı):** `04→development-cycle`, `05→test-cycle`, `06→deployment-cycle`, `02b→spike-pipeline`; `07-rollback`→`rollback-pipeline`, `08-hotfix`→`hotfix-pipeline`; `09-maintenance` silindi. Sonuç: **10 workflow**, hepsi rakamsız.
- **Raporlar tek-dosya:** per-file `_<slug>_<ts>` yerine `test-reports.md`/`security-reports.md`/... (üste eklenir, insan okuru için). Frontmatter/append-mode motor işi (5.9 #3'e bağlı).

### 5.13 Motor implementation başladı — mimari prensip + Madde 1–4 (2026-05-31)

- **Koşullu mantık ORCHESTRATOR katmanında; DAG saf AND-join kalır (Eray kararı 2026-05-31):** §5.9'un koşullu görünen tüm işleri — madde 4 gate join (hepsi-pass→review / ≥1-fail→in_progress), madde 8 epic-completion→staging, madde 9 block yönlendirmesi, madde 10 scheduling — **düz TypeScript olarak DB durumu üzerinde** çalışır; `dag.ts`/`worker-pool.ts`'ten ASLA koşul ifade etmesi istenmez. Gate'ler `gate_runs` tablosuna yazılan satırlar (madde 3), **DAG fan-in DEĞİL** → join = satırlar üzerinde TS fold; seçilmeyen gate satır üretmez (all-pass'ı bloklayamaz), fail satırı üretir → **§5.12 deadlock'u yapısal olarak imkânsız**. Bu zaten evin stili: `gate-enforcer.ts` ("≥1 succeeded run var mı?") + `pipeline-chainer.ts` ("önceki run succeeded mı?") koşulu DB satırında ifade ediyor, DAG kenarında değil. §5.12 dersinin doğrudan operasyonelleştirilmesi: "engine-owns-mechanics ancak engine DESTEKLİYORSA" → motoru koşullu-dalla şişirmek yerine koşulu orchestrator'da tut.
- **Tek `bounce` aksiyonu (Eray kararı 2026-05-31):** `test→in_progress` (gate fail) ve `review→in_progress` (UAT reddi) tek `bounce` aksiyonu, `from: ['test','review']`; geri-dönüş sebebi `reason` alanında. Mevcut çok-kaynaklı `block` desenine uyar; ayrı `fail_gate`/`reject_uat` yerine sade tutuldu.
- **`test` ZORUNLU (§5.8'den türetildi):** her item `in_progress→test→review` rotasını izler, 0 gate seçili olsa bile (orchestrator join'i 0 gate ile vacuously all-pass → review). `in_progress→review` kestirmesi YOK — bu, "join motorun işi" kararının (§5.8) lifecycle karşılığı.
- **Madde 1 ✅ implement edildi:** `server/engine/item-lifecycle.ts` `ItemTransition` union + `TRANSITIONS` haritası — `test` + `bounce` eklendi, `review.from`→`['test']`, `block`/`cancel`'a `'test'` eklendi. `merge` EKLENMEDİ (§5.9 #1). Migration GEREKMEDİ (`test` zaten migration 002 + `schemas.ts` zod enum'da). TDD (RED→GREEN): 13 yeni test + 2 dosya güncellendi (`item-lifecycle.test.ts` + `e2e-pipeline.test.ts` audit trail `['start','test','review','done']`); **395/395 yeşil**, typecheck temiz. Production blast-radius **sıfır** — lifecycle henüz orchestrator'dan sürülmüyor (madde 10), yalnız testler `transition()`'ı çağırıyor.
- **Madde 2 ✅ implement edildi:** `backlog_items.review_gates` (migration `006`, `ALTER TABLE ADD COLUMN ... NOT NULL DEFAULT '[]'` — rebuild yok) + `BacklogItemSchema.review_gates: z.array(GateSchema)` (Madde 3'ün `GateSchema`'sı şemada yukarı taşındı; backlog + gate_runs paylaşıyor) + `BacklogRepository.setReviewGates(id, gates)`. **Eray yönlendirmesi (Trello modeli):** gate'ler item üstünde **subtask/checklist** gibi düşünülür (kuru frontmatter blob değil) → tip'li kolon, `GateSchema` ile valide. **Seçim** (`review_gates`, planning yazar) ile **durum** (`gate_runs`, test yazar) ayrı ev, aynı `Gate` tipi. **acceptance criteria AYRI kalır** — PM/QA'nın davranış done-listesi (wireframe `3/5`), gate'lerle karışmaz (Eray kararı). **MCP `update_backlog_item` write-path YOK** (kodda hiç yok — yalnız workflow spec'i bahsediyor); `setReviewGates` repo metodu hazır, MCP tool ayrı iş. TDD: 8 yeni test (`backlog-review-gates.test.ts`); **415/415 yeşil**, typecheck temiz.
- **Madde 3 ✅ implement edildi:** `gate_runs` tablosu (migration `005`) + `GateRunsRepository` (`server/db/repositories/gate-runs.ts`). Kolonlar: `id, item_id (FK→backlog_items, CASCADE), gate (5'li CHECK), persona, attempt, status (pending/running/pass/fail), findings, created_at, ended_at`; `UNIQUE(item_id, attempt, gate)` (bir cycle'da gate iki kez koşamaz). **Ayırıcı = `attempt` integer** (`run_id` FK DEĞİL): tamamen decoupled — item her `test`'e girdiğinde +1; join `listForAttempt(item, attempt)` ile yalnız o cycle'ı folder → bounce sonrası stale `fail` karışmaz. Repo API: `create / get / listForItem / listForAttempt / currentAttempt / transition`. **Hafif comment alanı (§5.9 #3) ERTELENDİ** — block sebebi zaten audit_log'da (Madde 1), tüketen UI yok; dilim küçük tutuldu. TDD: 12 yeni test (`gate-runs.test.ts`); **407/407 yeşil**, typecheck temiz, build migration'ı dist'e kopyalıyor.
- **Madde 4 ✅ implement edildi (mock-first; Eray kararı):** `server/orchestrator/test-cycle.ts` `runTestCycle(itemId, deps)` + `server/engine/gate-executor.ts` (`GateExecutor` arayüzü — `Executor`'ın gate-paraleli) + `MockGateExecutor`. **Sistemin ilk kez test-cycle'ı koştuğu an.** Akış: item `test`'te → seçili `TEST_GATES` paralel fan-out (her biri bir `gate_run`) → **join = `gateRuns.listForAttempt` üzerinde düz TS fold** (DAG fan-in DEĞİL — §5.12/§5.13'ün ilk gerçek sınavı) → hepsi pass / 0-gate → lifecycle `review` · ≥1 fail → `bounce` (in_progress) + findings gate_runs'ta. **Kritik spec nüansı:** `uat` paralel test-gate DEĞİL → `TEST_GATES` = 4 gate (code_review/quality_control/security_control/design_review); `uat` = review kolonu +prime onayı (test-cycle.md), AYRI/sonra. Crash eden gate = `fail` (hang yok); `attempt` cycle izolasyonu (bounce→re-test stale satır okumaz). **§5.1:** motor mekaniği (fan-out/join/transition), `GateExecutor` yargıyı (pass/fail) verir. Gerçek AI-agent `GateExecutor` ertelendi (mock-first). TDD: 10 yeni test (`test-cycle.test.ts`); **425/425 yeşil**, typecheck temiz.
- **uat review-cycle ✅ implement edildi (mock-first; Madde 4'ün eşi, 2026-05-31):** `server/orchestrator/review-cycle.ts` `runReviewCycle(itemId, deps)` + `server/engine/review-approver.ts` (`ReviewApprover` arayüzü — `GateExecutor`'ın review-kolonu eşi) + `MockReviewApprover`. **`review` kolonu kararı (orchestrator-katmanı fold, §5.13):** item `review`'de → `uat` seçili mi? **Seçili değil** → vacuous approve → lifecycle `done` (test-cycle'ın `0-gate → review`'inin aynası). **Seçili** → `approver.requestApproval` → onay → `done` · red → `bounce` (in_progress) + sebep audit_log'da (`uat rejected: <reason>`). Crash eden approver = non-approval → `bounce` (hang yok — test-cycle `crash→fail`'in aynası). **Lifecycle/migration DOKUNULMADI** — `review→done` + `bounce(from review)` geçişleri Madde 1'de zaten vardı; bu dilim yalnız orchestrator mantığı + DI arayüzü. **Üç bilinçli erteleme (TODO §5.9'a yazıldı):** (1) gerçek approval-queue bağlantısı — impedance: `pending_questions` `item_id` taşımıyor (yalnız `run_id`) + motorda enqueue üreticisi yok; mock-first (Madde 4'ün gerçek-executor eşi). (2) uat verdict'i `gate_runs` satırı olarak YAZILMADI — `attempt` çakışma tuzağı (0-test-gate + tekrarlı-bounce); red sebebi şimdilik audit_log'da (§5.13 "comment ERTELENDİ" ile tutarlı). (3) **Madde 6 dikiş yeri:** onay dalı şimdilik doğrudan `done`; mekanik kapanış (merge/handover/worktree) `done`'dan ÖNCE araya eklenecek, `done` satırı yerinde kalır. Üretim blast-radius **sıfır** (`runReviewCycle`'ı henüz hiçbir yer çağırmıyor — Madde 10 capstone'a kadar). TDD (RED→GREEN, her test gerçek sebeple kırıldı): 6 yeni test (`review-cycle.test.ts`; uçtan uca `test→review→done` handoff dahil); **431/431 yeşil**, typecheck temiz, lint 0 hata (4 pre-existing warning, yeni dosyalarda sıfır).
- **Madde 5 ✅ implement edildi (saf türetme, 2026-05-31):** `server/orchestrator/whose-turn.ts` `whoseTurn(item): string[]` — board "sıra kimde" göstergesi. **Saf fonksiyon:** item'ın `status`+`owner`+`review_gates`'inden türetir; **canlı `gate_runs`'a BAKMAZ** (§5.9 #5 "kolon+bayrak"), **`owner`'ı ASLA yazmaz** (§5.4 sahip sabit). Eşleme: `in_progress`/`to_do`→`[owner]` (atanmamışsa `[]`), `test`→seçili test-gate persona'ları (`review_gates ∩ TEST_GATES` → `GATE_PERSONA`, paralel rozetler), `review`→uat seçiliyse `[+prime]` değilse `[]` (geçici, motor kapatır), `blocked`→`[+prime]` (§5.9 #9 intent'iyle ileri-uyumlu), `done`/`cancelled`→`[]` (terminal; owner tarihçe için kalır). **Eray onayı:** `to_do`→owner + `blocked`→prime yorumları (§5.4'te açıkça yok) onaylandı. Saf olduğu için DB/migration/repo YOK; board her render'da DB'siz çağırır. **Tüketici UI ayrı iş** (`whoseTurn`'ü board'a bağlama, src/ tarafı). TDD: 10 yeni test (`whose-turn.test.ts`; 7 spec-sürücü RED→GREEN + 3 edge characterization-lock); **441/441 yeşil**, typecheck temiz, lint 0 hata.
- **Madde 6 ✅ implement edildi (mock-first iskelet, 2026-05-31):** `server/orchestrator/closure.ts` `runClosure(itemId, deps)` + `server/engine/merger.ts` (`Merger` arayüzü — git substratı: CI+conflict+merge→development+worktree/preview teardown) + `MockMerger`. **Kapanış kararı:** item `review`'de → `merger.close()` → **ok → lifecycle `done`** · **çakışma/çökme → `bounce`** (in_progress, developer çözer) + sebep audit_log'da. **Dikiş:** `runReviewCycle`'ın **onay + vacuous** dalları artık doğrudan `done` yerine `runClosure`'a delege ediyor (`merger` dep **zorunlu** eklendi — capstone'un wiring'i unutup item'ı merge'siz `done` yapmasını önler). Onay→merge ok→`done`; onay→çakışma→`bounced` (`verdict.approved=true` kalır, `outcome='bounced'` — prime onayladı ama merge tutmadı). Reject dalı kapanışa girmez (reddedilen merge edilmez). **Mock-first ZORUNLU (Eray onaylı, Bulgu):** gerçek `Merger` `WorktreeManager`'ı sürecek ama o `runId` ile çalışıyor + per-item worktree'yi **Madde 10** kuruyor → gerçek git Madde 10'a bağlı (run/item impedance üçüncü kez). **Üç erteleme (TODO §5.9, Eray onaylı):** (1) gerçek git Merger (Madde 10 worktree) · (2) handover-on-close (mock-merge'e handover üretmek boş kaçar; gerçek merge'le gelsin) · (3) **blocker-temizle** — item bağımlılık modeli (`blocked_on`/`blocks`) şemada YOK → §5.9 #6'nın bu adımı karşılıksız, ertelendi. Üretim blast-radius **sıfır** (`runReviewCycle`/`runClosure`'ı henüz hiçbir yer çağırmıyor — Madde 10 capstone'a kadar). TDD: 5 yeni test (`closure.test.ts` 4 RED→GREEN + `review-cycle.test.ts`'e 1 conflict-seam); **446/446 yeşil**, typecheck temiz, lint 0 hata.
- **Madde 8 ✅ implement edildi (mock-first, 2026-05-31):** `server/orchestrator/epic-completion.ts` `runEpicCompletion(itemId, deps)` + `server/engine/deployer.ts` (`Deployer` arayüzü — staging deploy substratı) + `MockDeployer`. **Tespit = çocuklar üzerinde saf fold** (orchestrator-katmanı, §5.13): item'ın parent epic'inin çocukları **hepsi terminal (done|cancelled) VE ≥1 done** → epic bitti → `deployer.deployStaging(epicId)` (mock). **Eray kararları:** (1) bitti-kuralı = terminal + ≥1 done (iptal çocuk epic'i bloklamaz; all-cancelled "bitmiş" sayılmaz); (2) epic'in KENDİ statüsüne DOKUNULMAZ — epic'ler review→done yolundan geçmiyor, board flip'i ayrı iş. Parent yoksa no-op; deployer crash → deploy ok:false (hang yok). **Dikiş capstone'a (Madde 10):** closure `done` → `runEpicCompletion` bağlantısı orada — deployer'ı `review-cycle→closure` zincirinden geçirip dep-kademesini derinleştirmemek için bilinçle ertelendi (standalone + test-edilebilir tutuldu). **Erteleme (TODO §5.9):** gerçek deployer · gate-persona staging raporları (§5.11) · prime staging onayı (§5.11) · epic-status-flip. Dördüncü mock-first arayüz (GateExecutor/ReviewApprover/Merger/**Deployer**) — hepsi Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır**. TDD: 6 yeni test (`epic-completion.test.ts`); **452/452 yeşil**, typecheck temiz, lint 0 hata.
- **Madde 9 ✅ implement edildi (mekanizma gerçek, wiring ertelendi, 2026-05-31):** `server/engine/run-registry.ts` `RunRegistry` (Map<runId,{itemId,controller}>) + `server/orchestrator/block.ts` `blockItem(itemId, deps)`. **§5.13'ün öngördüğü yeni mekanizma:** worker-pool'un `AbortController`'ı `runWorkflow`'a lokal (satır 227) → registry, dışarıdan iptal köprüsü. `RunRegistry`: `register(runId, itemId, controller)` / `cancel(runId)` / `cancelForItem(itemId)→runId[]` (controller'ları `abort()` eder). **itemId etiketli canlı indeks** → "item'ın aktif run'ları" registry'nin kendisi; `listRuns` `item_id` filtresi + DB sorgusu GEREKMEDİ. `blockItem`: **önce** `lifecycle.transition('block', reason)` (illegal state — örn. to_do — fırlatır, hiçbir şey iptal etmez) → **sonra** `registry.cancelForItem` (ajanları durdurur) + iptal edilen run'ları DB'de `cancelled` (`error_message: blocked: <reason>`). **owner'a DOKUNMAZ** — §5.9 #9'un "prime'a ata"sı zaten Madde 5'in `whoseTurn(blocked)→[+prime]` türetimiyle karşılanıyor (§5.4 owner sabit, motor ezmez). Salt "DB status flip" DEĞİL (§5.13 doğrulandı). **Erteleme (TODO/capstone):** worker-pool'un `aborter`'ı registry'ye **register/unregister** etmesi → Madde 10 (per-item run'lar orada doğuyor; o zamana kadar iptal edilecek canlı item-run yok). Registry+blockItem izole + gerçek (test gerçek `AbortController` abort'unu doğruluyor). Üretim blast-radius **sıfır**. TDD: 8 yeni test (`run-registry.test.ts` 3 + `block.test.ts` 5); **460/460 yeşil**, typecheck temiz, lint 0 hata.
- **Madde 7 ✅ implement edildi (mock-first, 2026-05-31):** `server/engine/preview-server.ts` `PreviewServer` arayüzü (substrat: worktree'den dev-server spawn) + `MockPreviewServer` + `server/orchestrator/test-preview.ts` `PreviewManager`. **5. mock-first arayüz** (gate exec / uat approver / merger / deployer / **preview**). `PreviewManager` = item→preview canlı indeksi (RunRegistry deseni): `startFor(itemId, worktreePath)` (idempotent — çift-start tek spawn) · `stopFor(itemId)→bool` (bul + stop + unut) · `urlFor(itemId)`. Gerçek spawn `PreviewServer`'da, mock'lanır. **Run/item impedance (5. kez):** URL persistence (runtime_artifacts) `run_id`'e bağlı + `ArtifactKindSchema`'da `preview` yok + preview item-merkezli → kalıcılaştırma ERTELENDİ. **Erteleme (TODO/capstone):** gerçek PreviewServer (worktree dev-server spawn) · wiring (test-girişinde `startFor`, teardown'da `stopFor`) · "çalıştırılabilir/UI görev mi?" koşulu · URL persistence + gate/prime'a sunma. Üretim blast-radius **sıfır**. TDD: 5 yeni test (`test-preview.test.ts`); **465/465 yeşil**, typecheck temiz, lint 0 hata.
- **Implementation sırasında adversarial tespit edilen downstream notlar (ilgili maddeye iliştirildi):**
  - **Madde 3'e — ✅ ÇÖZÜLDÜ (2026-05-31):** `gate_runs`'a `attempt INTEGER NOT NULL DEFAULT 1` ayırıcısı eklendi (`run_id` FK değil — decoupled; test-cycle'ın `runs` satırı olup olmaması Madde 4'ün kararı). Bounce sonrası re-test stale `fail` satırlarını okumaz → sonsuz-bounce yapısal olarak önlendi. (Detay: yukarıda "Madde 3 ✅".)
  - **Madde 9'a:** "ajanları durdur" için orchestrator'da `Map<runId, AbortController>` registry gerekir — worker-pool'un `AbortController`'ı `runWorkflow`'a lokal, dışarı açık değil. Salt "DB status flip" değil, yeni mekanizma (kapsam beklenenden büyük).
  - **Madde 4 ↔ 7:** §5.8 gate'ler local URL'de test eder → madde 7 (local test URL), madde 4'ün gerçek gate yürütmesinin yumuşak önkoşulu (ilk kesim stub URL ile ayrılabilir).
  - **(Kapsam dışı sağlamlaştırma):** `worker-pool.ts` `skipped`-vs-`done` kavram karışıklığı, gelecekteki opsiyonel-adım workflow'ları için §5.12-tipi gizli tuzak; ayrı `noop`/`satisfied` disposition (done sayılan) ayrı iş kalemi olabilir — §5.9 için gerekli değil, orchestrator-katmanı duruşu bunu zaten by-pass ediyor.
- **Bağımlılık sırası (doğrulandı, Layer 0→3):** L0 paralel [**1✅**, **2✅**, **3✅**, 11(bağımsız)] → L1 [**4✅**, **uat✅**, **5✅**, **7✅**] → L2 [**6✅**(←1+4), **9✅**(←1)] → L3 [**8✅**(←6), 10 capstone, 11 docs]. **TÜM FEATURE DİLİMLERİ TAMAM (1-9 + uat + 5 + 7) → tek-item yaşam döngüsü (test→review→merge→done/bounce) + epic→staging + block→cancel + local-preview mekanikleri çalışıyor. BEŞ mock-first arayüz (gate/uat/merger/deployer/preview) + RunRegistry + PreviewManager hazır. KALAN sadece: 10 (capstone — beş mock'u + RunRegistry'yi GERÇEĞE bağla + per-item run/worktree + worker-pool wiring + tüm dikişler; gerçek AI-agent/git/deploy/preview impl'leri gerektirir, alt-dilimlere bölünür) · 11 (bağımsız docs). Motor mekaniği bitti; geriye entegrasyon + gerçek impl'ler kaldı.**

### 5.14 Capstone (Madde 10 + 11) — 9 TDD dilimi indi (2026-05-31 #3)

**Plan (Eray onayı "sırayla hepsini yap"): W1 → W2 → B1 → C1-C5 → D1**, her biri ayrı RED→GREEN TDD (gerçek sebeple kırılan test ÖNCE) + ayrı commit. 9 dilim de indi; **465→499 test (+34)**, typecheck + lint temiz, her commit'te yeşil. Üretim blast-radius hâlâ **sıfır** (gerçek impl'ler izole/unit-test; orchestrator kompozisyonuna henüz takılmadı — aşağı bkz. "ne kaldı").

- **W1 ✅ (`39953ad`) — worker-pool ↔ RunRegistry:** `unregister(runId)` (abort'suz siler — `cancel`'ın temizlik eşi) + worker-pool `aborter` oluşturulunca `register`, İKİ çıkışta da (`gate-no-controller` throw'u ÖNCE + son return ÖNCE) `unregister`. Artık block CANLI bir run'ın ajanını gerçekten durdurur. ⚠️ FK doğrulandı: `runs.item_id`→`backlog_items` enforced → worker-pool testi item'ı `backlog.create` ile seed eder. +5 test.
- **W2 ✅ (`f338f15`) — closure done → epic-completion dikişi:** `ClosureDeps.deployer` **zorunlu** (Madde 6 merger-required deseni — dikiş sessizce atlanamaz) + `ClosureResult.epic`. merge-ok→`done` dalında `runEpicCompletion` çağrılır; bounce→`epic:null`. `deployer` review-cycle'ın iki `runClosure` çağrısından da geçirildi. +3 test.
- **B1 ✅ (`0491171`) — KEYSTONE: per-item run + worktree (§5.9 #10):** **Mimari karar AskUserQuestion → Eray "yeni, küçük, temiz parça"** (standalone fonksiyon; Orchestrator sınıfını genişletme DEĞİL). `server/orchestrator/run-item.ts`: `runItem(itemId, deps)` — item GERÇEK run satırı alır (`item_id` set → **FK kapanır, mock değil**), kendi worktree'sinde koşar (base=development; `acquireWorktree` **enjekte** → testte mock, C-slice'larda gerçek git), RunRegistry'ye kaydolur (W1 → block erişir). §5.13: run saf AND-join; `in_progress→test` geçişi orchestrator-katmanı, başarıda burada. Worktree başarıda KORUNUR (closure merge+release eder), başarısızlıkta quarantine. `runReadyItems(deps)` = sınırlı-eşzamanlılık scheduler (to_do item'lar, maxConcurrent, atomik cursor → bir item iki kez koşmaz). +8 test.
- **C2 ✅ (`3fec38a`) — gerçek GitMerger (git substratı):** İlk mock→GERÇEK dış substrat. `WorktreeManager.release({success,merge})`'in test-edilmiş merge+teardown yolunu kullanır: item branch → development merge + worktree sil. Gerçek conflict → `ok:false`/`conflict` (release throw eder, worktree KALIR → developer çözer → closure bounce). Worktree handle **enjekte resolver** (B1'in acquire'ı doldurur). **handover-on-close ERTELENDİ** (içerik/konum spec'i gerekir — ürün kararı). Gerçek temp git ile TDD. +3 test.
- **C5 ✅ (`02bc2e4`) — gerçek AgentGateExecutor (AI ajan):** Gate yargısı enjekte `Executor`'a delege (prod'da gerçek CLI executor, testte Mock). Persona için sentetik gate step + item worktree → `executor.execute` → ok→pass, fail→fail+findings. Motor mekaniği (fan-out/join/`gate_runs`) korunur — bu yalnız yargıyı verir. Run/step/worktree enjekte resolver. +4 test.
- **C3 ✅ (`5ae1478`) — gerçek QueueReviewApprover (ApprovalQueue):** uat kararı gerçek insan-döngüsü kuyruğuna. enqueue→`waitForAnswer`→approve/reject. **§5.13 impedance çözümü:** `pending_questions` run_id-keyed; soru item'ın EN SON run'ına (dev-cycle run'ı = incelenen işin sahibi) bağlanır — enjekte `resolveRunId` (şema migration YOK). Abort (block) → onay yok → review hang yerine bounce. +4 test.
- **C1 ✅ (`dff79a6`) — gerçek DevServerPreviewServer (process spawn):** Item worktree'sinde dev komutu spawn, stdout/stderr'den URL parse, stop kill (child exit'i await → kill kanıtı). PreviewManager bookkeeping'i korunur; komut+url pattern config (enjekte). Gerçek child_process ile **deterministik** TDD (kontrollü node one-liner, port-probe YOK), tekrar-koşuda stabil doğrulandı. +4 test.
- **C4 ✅ (`f70125b`) — gerçek WorkflowDeployer (deployment-cycle run):** **"staging nedir" çatalı §5.11 ile çözülür:** staging deploy = deployment-cycle workflow RUN'ı (agent'lar gerçek deploy'u yapar), proje-özel deploy hard-code edilmez. Engine üzerinden o workflow'u sürer; run succeeded→ok, failed→reason, workflow yok→ok:false (run sürülmez). Workflow + executor enjekte. MockExecutor ile GERÇEK `runWorkflow` sürülerek TDD. +3 test.
- **D1 ✅ (`c692223`) — Madde 11 kesişen docs:** ⚠️ **DÜZELTME:** handover'ın "`write_decision`/`write_learned`" MCP tool'ları YOK (16 tool arasında değil) — gerçek mekanizma DOSYA-tabanlı (`memory/decisions.md`+`learned.md`, persona docs zaten referans + `decisions` repo). behavior.md yeni Core Rule (her persona, **iş sırasında** — yalnız teslimde değil — kararı decisions.md'ye Decision Classification seviyesiyle, dersi learned.md'ye işler; read-before-write, en üste ekle) + AGENTS.md read→read+write reframe. behavior.md çift "3." numara hatası + Öğrenim/Kapat sırası düzeltildi. Docs-only, 499 yeşil.

**GERÇEKTE NE BİTTİ / NE KALDI (dürüst kayıt):** 9 dilim = 5 mock arayüzün GERÇEK substrat adapter'ları (`GitMerger`/`AgentGateExecutor`/`QueueReviewApprover`/`DevServerPreviewServer`/`WorkflowDeployer`) + keystone (`runItem`/`runReadyItems`, FK'yı GERÇEKTEN kapatır) + 2 dikiş (W1/W2) + kesişen docs. Hepsi izole + unit-test. **KALAN = uçtan-uca KOMPOZİSYON** (ayrı faz; orijinal dilim listesinde yoktu, adapter'lar bunu mümkün kıldı): (1) bir **composition root** gerçek impl'leri kurup orchestrator dep'lerinde mock'ların yerine koyar; (2) **resolution registry'ler** — item→worktree handle (C2 `resolveHandle`), item→run-context (C5), item→run-id (C3) — B1'in `runItem`'ı bu kayıtları (gerçek `WorktreeManager` base=development + gerçek run ile) doldurur; (3) **preview startFor/stopFor dikişi** review-cycle/closure'a (Madde 10'un "test-girişinde URL, teardown'da kapat" kalemi — C1 substratı hazır, dikiş kaldı); (4) **driver** `runReadyItems`'i süren entry point + uçtan-uca test. Motor mekaniği + gerçek adapter'lar bitti; geriye **"son montaj"** kaldı.

### 5.15 Capstone SON MONTAJ — 4 kompozisyon dilimi indi (2026-05-31 #4)

§5.14'ün "ne kaldı" listesinin 4 maddesi de indi; her biri ayrı RED→GREEN TDD + ayrı commit (4 commit `8cbd5e1`→`86ddaeb`). **517→521 test** yolu (her dilimde yeşil), typecheck + lint temiz. **Sistem ilk kez bir işi `to_do → done`'a kadar insan-döngüsü olmadan, GERÇEK git ile yürütüyor** (uçtan-uca test bunu kanıtlıyor). Üretim blast-radius hâlâ sıfır (driver henüz hiçbir loop/HTTP girişinden sürülmüyor — `server/index.ts` montajı + zamanlayıcı bilinçle sonraya bırakıldı, aşağı bkz.).

- **1 ✅ (`8cbd5e1`) — ResolutionRegistry + runItem→gerçek worktree:** `server/orchestrator/resolution-registry.ts` = item→{handle, runId, worktreePath} defteri (RunRegistry'nin worktree eşi); 3 görünüm: `resolveHandle` (C2), `resolveRunId` (C3), `runContextFor` (C5) + `record`/`forget`. **Asıl impedance kapanışı:** `runItem` artık **önce** gerçek run satırı yaratır (item_id set → FK kapanır), worktree'yi **o run id'siyle** alır (`acquireWorktree(itemId, runId)` — git-merger.test.ts'in kanonik `createRun → acquire(run.id)` deseni), defteri doldurur, sonra workflow'u **aynı run** üzerinde sürer (worker-pool `existingRun` opsiyonu → tek run satırı, orphan yok). `runs` repo'ya `setWorktreePath`. Başarısız build → `forget` (stale handle çözülmez). 8 mevcut run-item testi korundu (acquirer'a runId arg + opsiyonel resolution dep). TDD: registry unit (5) + runItem gerçek-git entegrasyon (2). +7 test.
- **2 ✅ (`cda0818`) — composition root:** `server/orchestrator/composition.ts` `createComposition(deps)` — mock→GERÇEK swap'ın tek yeri. 5 adapter'ı kurar, enjekte resolver'larını ResolutionRegistry'ye bağlar: merger.resolveHandle, approver.resolveRunId, gateExecutor.resolveRunContext (+ item run'ına gerçek `run_step` açar → dashboard timeline). deployer (deployment-cycle run) + previewManager + `acquireWorktree` (gerçek WorktreeManager, handle döner). §5.13: saf wiring, sıfır koşul. Standalone factory (B1 çizgisi). TDD: composition.test.ts gerçek git repo üzerinde her adapter'ı defterden sürer. +6 test.
- **3 ✅ (`8193ac9`) — preview dikişi:** `runItem` (test-girişi) `previewManager.startFor`, `runClosure` (done VEYA bounce) `stopFor`; ikisi de **soft** (try/catch — spawn/teardown hatası item-run'ı/merge'i çökertmez, §5.7). Başarısız run preview başlatmaz. review-cycle previewManager'ı closure'a iletir. TDD: preview-seam.test.ts (start/no-start/soft-fail/stop-on-done/stop-on-bounce). +5 test.
- **4 ✅ (`86ddaeb`) — driver + e2e ("başlat düğmesi"):** **Mimari karar: Eray'a sade dille soruldu → "ayrı, temiz, yeni parça"** (B1 çizgisi; Orchestrator sınıfına dokunma DEĞİL). `server/orchestrator/driver.ts` `driveReadyItems(deps)` = tek-tur, 3 orchestrator-katmanı faz (§5.13): to_do→`runReadyItems` (test) → test→`runTestCycle` (review/bounce) → review→`runReviewCycle`→`runClosure` (done/bounce + epic→staging). Her faz DB durumunu **taze okur** → gate'siz item tek turda to_do→done yürür; bounce → in_progress, sonraki tur alır; done → `resolution.forget`. composition önizleme substratını da enjekte alır (`previewServer`; testte MockPreviewServer). TDD: driver-e2e.test.ts — yalnız item / gate'li item / epic-child uçtan uca **GERÇEK git repo** (gerçek worktree + development'a gerçek merge commit; mock agent). +4 test. **Süreç bulgusu (kayıtlı ders):** ilk e2e'de worktree-yazan test executor'ı guard'ı (`worktreePath !== repoRoot`) deployment adımında host repo'ya düşüp 2 stray commit + 1 çöp dosya yarattı → `--mixed reset` + guard'ı **pozitif/dar** yaptım (`workflowId==='development-cycle' && path.startsWith(repoRoot+'/.kortext')`). Ders: worktree-mutasyonlu test executor'ı asla `process.cwd()`'e düşebilecek negatif guard kullanmamalı. reflog + mixed-reset ile sıfır kayıp.

**SON MONTAJ SONRASI NE KALDI (bilinçli, sonraki faz):** (a) **driver'ı bir girişten sür** — `server/index.ts` composition'ı kurup `driveReadyItems`'i ya HTTP tetiğinden ya periyodik loop'tan çağırsın (Eray "otomatik zamanlayıcı"yı seçmedi; şimdilik manuel/tek-tur, zamanlayıcı ayrı iş). (b) §5.14'ün eski erteleme listesi hâlâ açık: handover-on-close (C2), gate_runs'a uat verdict, blocker-temizle, staging raporları/onayı (§5.11), epic-status-flip, board whose-turn rozeti (src/). Motor + montaj bitti; kalanlar ürün-katmanı zenginleştirmeler.

### 5.16 Driver bir girişe bağlandı — `POST /api/drive` (kilitli, anahtarla) (2026-06-01)

§5.15'in "ne kaldı (a)" maddesi indi: capstone driver artık `server/index.ts`'ten bir HTTP tetiğiyle sürülüyor — **ama varsayılan KAPALI bir güvenlik anahtarının arkasında**. **Mimari karar: Eray'a sade dille soruldu (AskUserQuestion) → "kilitli dursun, anahtarla açılır"** (blast-radius'u Eray'ın bilinçli açması). 521→535 test (+14), typecheck + lint temiz. Tek TDD slice, ayrı commit. Üç parça, her biri RED→GREEN:

- **Güvenlik anahtarı (`server/config/env.ts`) — fail-safe parse:** `KORTEXT_DRIVE_ENABLED` zod şemasına eklendi; **yalnız `"1"`/`"true"` açar**, unset/`"0"`/`"false"`/`""`/herhangi-junk = KAPALI. Naif `z.coerce.boolean()` `"0"`'ı bile `true` yapardı (footgun — anahtarın tek görevi "kilitli" garantisi olduğu için kritik). `EnvSchema` export edildi → şema üzerinden test edilebilir. +7 test.
- **Tetik (`server/routes/drive.ts`) — `driveRouter(deps)`:** `POST /api/drive` → anahtar kapalı→`403 drive_disabled` · uçuşta→`409 drive_in_progress` (modül-yerel `inFlight` guard, `finally`'de temizlenir → çöken tur düğmeyi kilitlemez) · boşta+açık→arkada bir tur (fire-and-forget, blueprint-tetik deseni) + hemen `202 started`. `enabled`+`drive` **enjekte** (§5.13 disiplini) → switch/guard/dispatch gerçek git/agent olmadan test edilir. +4 test.
- **Montaj glue (`server/orchestrator/server-drive.ts`) — `makeServerDrive(deps)`:** `index.ts`'in zaten yüklediği parçalardan (repos, registry'ler, queue) `{enabled, drive}` üretir. Runtime **lazy + bir kez** kurulur (ilk armed drive'da composition+ResolutionRegistry; sonraki turlar yeniden kullanır — defter turlar arası kalmalı). `development-cycle` workflow yoksa **net hata fırlatır** (cryptic null-deref yerine). Executor `project.json`'dan çözülür (mock fallback — blueprint tetiğiyle aynı). `index.ts` ince tutuldu (boot script unit-test edilemez → mantık buraya çıktı). +3 test.

**Doğrulama (gerçek sunucu smoke, iki yön):** boot temiz; **KAPALI → `POST /api/drive` = 403** (route mount + gerçek env varsayılan KAPALI kanıtı); **AÇIK + boş backlog → 202 + "drive pass complete"** (armed yol gerçek composition'ı gerçek paket workflow'undan kurup hatasız no-op koşuyor). İki smoke'ta da `git status` temiz — boş backlog = sıfır git/worktree, repo kirlenmedi.

**Blast-radius:** Bu, üretim etkisini sıfırdan çıkarabilecek **ilk** slice — ama anahtar varsayılan KAPALI olduğundan, merge edilince etki **pratikte hâlâ sıfır**; Eray `KORTEXT_DRIVE_ENABLED=1` set edip (yeniden) başlatana kadar düğme atıl. §5.13 korundu (saf wiring, koşullu mantık yok). **Hâlâ ertelenen:** periyodik otomatik zamanlayıcı (Eray seçmedi → ayrı iş), dashboard "başlat" düğmesi (UI bu endpoint'i çağıracak), §5.14 ürün-katmanı listesi.

---

## Bölüm 6 — v3.0 → v3.1.x kararları (Faz 0-12 özeti, HANDOVER §1-§64)

> 64 numaralı tasarım kararı toplam. Aşağıdaki kategorize özet **bu maddelerin kanonik kaydıdır** (eski `HANDOVER-v3.md` docs/ → development/ konsolidasyonunda silindi). Komit-bazlı tarihçe için `git log development/DECISIONS.md`.

### 6.1 Stack + core (#1-#18 — Faz 0-5)

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

### 6.2 React Dashboard + MCP (#19-#33 — Faz 6-7)

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

### 6.3 CLI + Test + Yayın (#34-#52 — Faz 8-10 + Post-10)

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

### 6.4 UI v4 wireframe alignment + onboarding (#53-#58 — Faz 11)

53. **`test` status additive migration** — SQLite ALTER CHECK desteklemediği için backlog_items rebuild pattern.
54. **`/api/decisions` minimal endpoint** — Memory Decisions tab tek tüketici.
55. **`/api/docs/:scope` response shape change** — `files: string[]` → `files: {name,size,mtime}[]`.
56. **Settings panes monolith** — 8 pane tek dosyada (`src/routes/settings-panes.tsx`), cross-pane primitives.
57. **`React.ReactNode` yerine named import** — `import { type ReactNode } from 'react'` (lint kuralı).
58. **Heredoc fallback Write hook için** — sanitization katmanı (marked + DOMPurify) zaten yerinde.

### 6.5 Faz 12 mimari refactor (#59-#64)

59. **`outputIndexer` callback slot** = engine-adapter ayrımı — worker-pool reports indexer'ı doğrudan import etmek yerine `SafetyGuards`'a opsiyonel callback.
60. **Prompt cache disipline'i = stable prefix** — cache hit'in temeli `--append-system-prompt`'a byte-identical içerik.
61. **TOC engine sorumluluğu** — persona maintenance turuna bırakılmadı; `markdown-sync.writeDecision/writeLearned` sonunda atomik update.
62. **`+prime` synthetic persona row** — `agents/prime.md` yok ama workflow step'ler referans verebilir; boot'ta synthetic row eklenir.
63. **Per-file rapor naming + tags JSON kolon** — spec'te bilinçli erteleme ("zenginleşebilir" notu).
64. **`React.ReactNode` namespace yasak (lint kuralı pekiştirildi)** — `no-undef` namespace görmüyor; named import zorunlu.

---

## Bölüm 7 — Tasarım kararları (Faz 6 + v3 palette geçişi)

### 7.1 Proje-seviyesi tasarım kararları

| Karar | Seçim | Gerekçe |
|---|---|---|
| Hedef kullanıcı | Kod bilmeyen herkes (PM, founder, ürün sahibi) | Kortext'in misyonu |
| Görsel stil | **Mission control / dark theme** | Multi-agent orchestration için doğru ton |
| Dil | İngilizce UI (i18n layer sonra) | Global hedef kitle |
| ~~Multi-project~~ ⚠️ | ~~YOK — her kurulum tek proje~~ | **Bölüm 0'da (2026-05-27) geri çevrildi** — v3.1 tek-daemon-çok-proje mimarisine geçecek |
| Light theme | v0.2'ye ertelendi | Şimdilik dark only |

### 7.2 Renk paleti — v2 indigo → v3 vibrant purple (2026-05-21)

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

### 7.3 Orbit ekranı — 4 iterasyon sonrası bulunan paradigm

1. **v1 — Radyal SVG circle graph**: node'lar küçük, generic AI mind map hissi → reddedildi
2. **v2 — Mission Floor pod layout**: 3 squad sütun → orbit metaforu kayboldu, kanban hissi → reddedildi
3. **v3 — Premium refined circles**: gradient fills + glow halos → "circles in space, bilgi yok" → reddedildi
4. **v4 — Radyal yerleşim + dikdörtgen kartlar (FINAL)** ✓: viewBox 1400×920, `<foreignObject>` ile HTML kart embed, avatar+name+model+task+status — Eray onayı: *"bu oldu işte"*

**Anahtar prensip:** Radyal yerleşim hiyerarşiyi anlatır, dikdörtgen kartlar durumu anlatır.

### 7.4 v4 wireframe = TEK visual spec (2026-05-22)

`development/concepts/wireframe-v4-final.html` aktif visual spec (~2400 satır). Eski mockup'lar (`mockup-v2`, `mockup-v3-palette-preview`, `wireframe-v3-ops`) **artık referans değil** — `development/concepts/` altında arşiv olarak duruyor.

Vercel discipline:
- Zero card fill (border-only regions)
- Mono ID/timestamp (JetBrains Mono)
- Status = dot+text (no fill)
- One primary CTA per screen
- 200ms ease-out only
- No glow, no constant pulse, no fancy graphs

### 7.5 14 ajan persona renkleri (v3 palette)

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

### 7.6 Memory + Inbox + Reports tasarım kararları

| Karar | Detay |
|---|---|
| Memory tab sayısı | 3 (Decisions, Learned, Handovers) |
| Memory kart yapısı | Expandable — tıklayınca tam içerik |
| Inbox reject form | **Required reason** (5+ char) + optional revision instructions |
| Inbox Send button | Reason 5+ char olana kadar disabled |
| Reports 3 mod | view / edit / revise (sibling div'ler display:none ile toggle) |
| Reports revise form | Required feedback (5+ char) |

### 7.7 Settings — 8 pane

Project / Agents (+models merged) / Rules / Workflows / Hooks / Integrations / Environment / Danger zone. Spec §10: Settings/Agents/Workflows/Rules **readonly** (paket içi `.md` render; yazma v3.2'ye).

### 7.8 Backlog kararları

| Karar | Detay |
|---|---|
| Kolon sayısı | 6 (Epic \| To Do \| In Progress \| Test \| Review \| Done) |
| ~~Story~~ kaldırıldı | Framework'te bu görev tipi yok |
| ~~Complexity rozeti~~ kaldırıldı | Framework'te yok |
| ~~Priority etiketi~~ kaldırıldı | Önceki wireframe'de hatalı |
| Sample backlog | 4 Epic (E-001..E-004) + 13 task/bug/debt |

---

## Bölüm 8 — Tarihçe (özet)

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

## Bölüm 9 — Reddedilenler

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

## Bölüm 10 — Board UI (Ekran 3) kararları (2026-06-02)

UI track Ekran 3. Eray ekranı canlı inceledi, 10 maddelik geri bildirim verdi; 7'si bu oturumda kapandı. Önce wireframe-v4'e birebir paneller kuruldu, sonra Eray'ın fonksiyonel geri bildirimi uygulandı.

**§10.1 Detay drawer'lar (panel) — Board'un imza davranışı.** Wireframe'de karta tıklayınca sağdan 480px detay paneli kayar; `src/`'de hiç yoktu (kartlar atıldı). Kuruldu: `BoardDrawers.tsx` (Task + Epic), wireframe `.drawer*` CSS'ine birebir (250ms slide, backdrop, Esc), gerçek `BacklogItem`'a bağlı. Saf mantık `src/lib/board-drawer.ts`'e ayrıldı (TDD); bileşenler screenshot'la doğrulandı.

**§10.2 Kanonik Badge — wireframe `.badge`, mevcut desenle çakışma.** Analiz `.badge` CSS önerdi; kod tabanında zaten per-route React `Badge` (9px büyükharf, kenarlıksız) vardı. AMA wireframe `.badge` farklı: 11px, cümle-düzeni, kenarlıklı, 7 ton. İkisini körü körüne izlemek tutarsızlık yaratırdı → wireframe'e birebir **kanonik** `src/components/Badge.tsx` kuruldu (sonraki ekranlar buna göçer; eski badge'ler tech-debt).

**§10.3 Durum geçişleri = ajan-güdümlü + insan-override (Eray kararı).** "Kim yürütür?" sorusunda Eray "ajanlar yürütür, ben gerekirse müdahale" seçti. Sonuç: footer butonları **duruma-duyarlı** (yalnız o an YASAL geçişler) — wireframe'in sabit "Move to Review"ı çoğu durumda illegal olurdu. Frontend `availableTransitions(status)` backend `ItemLifecycle` TRANSITIONS'ını **aynalar** (drift'e dikkat). Backend: `POST /api/backlog/:id/transition` mevcut `ItemLifecycle` motorunu kullanır (legal check + audit_log; 409 illegal / 404 / 400). "Add comment" / "Edit epic" backend store gerektirdiği için pasif.

**§10.4 Aktivite = audit_log (yeni tablo yok).** Lifecycle zaten her geçişi `audit_log`'a yazıyor (actor + from→to). `GET /api/backlog/:id/activity` bunu item bazında okur; `describeActivity()` "kim ne yaptı" satırına çevirir. Drawer 5sn'de bir poll'lar.

**§10.5 Gate'ler şimdilik body'den (statik).** `review_gates` (Gate[]) + `gate_runs` (pending/pass/fail) gerçek kaynak ama tüm item'larda BOŞ — gate'ler bir item workflow'a girince dolar. Eray "diğer içerikler nasıl olduysa gate'lerde de olsun, görmek için" dedi → şimdilik body `## Review Gates` checklist'inden (`checklistFromSection`) statik gösterilir. **Canlı gate pass/fail (gate_runs) sonraki iş.**

**§10.6 AC modeli = madde-madde `[{text, done}]` (Eray kararı — ✅ BİTTİ 2026-06-02, 4 katman, 612 test yeşil).** Eray "AC sayı değil madde-madde olmalı, nasıl check atılacak?" dedi. Karar: `[{text, done}]`, geriye-uyumlu (eski `string[]+ac_done` → ilk N done; yeni şekil → doğrudan). 4 katman, her biri TDD + ayrı lokal commit (push YOK):
- **K1 veri modeli** (`996cf6f`): `acChecklist(fm)` artık frontmatter'ı okur, iki şekli de canonical `{text,done}[]`'e çevirir (TEK doğruluk kaynağı); kart + drawer ondan türetir; `NewItemModal` yeni şekli yazar (`ac_total`/`ac_done` sayaçları emekli).
- **K2 endpoint** (`5086373`): `POST /api/backlog/:id/ac {index, done, by}`. Saf yardımcılar `server/engine/acceptance-criteria.ts` (`readAcceptanceCriteria`/`setCriterionDone`) + yeni repo `updateFrontmatter`. Eski item işaretlenince yeni şekle GÖÇ eder + sayaçları atar. `item_ac_toggle` audit kaydı → aktivite akışı.
- **K3 UI** (`8ffd061`): drawer'da AC satırı tıklanabilir checkbox (Review Gates / epic child salt-okunur KALIR — onlara toggle endpoint yok); `describeActivity` → "+actor checked/unchecked \"…\"".
- **K4 ajan yolu** (`953b6e9`): MCP `get_acceptance_criteria` + `mark_acceptance_criterion` (15→17 tool). Ortak `applyCriterionToggle()` servisi (HTTP route da buna refactor edildi) → insan (+prime, HTTP) ve ajan (+persona, MCP) işaretleri AYNI `item_ac_toggle`'ı yazar, tek aktivite akışında görünür (drift imkânsız).

**§10.7 Görsel temizlik.** Kaldırıldı: Status filtresi (kolonlar zaten durumu gösteriyor — gereksiz), boş "Filter" butonu (dropdown'lar canlı süzüyor), header +p avatarı (gerek yok). Eklendi: +prime atanabilir owner. Boş KV satırları gizlendi (Priority/Points/Epic değeri yoksa satır yok — "—" çöpü).

**Ertelenenler:** #9 global arama (header "SOON"), #10 terminal=komut girişi (şu an salt-okunur run-history). Paused: uygulama-geneli gerçek font yükleme (UI stack'inde sistem fontu Inter'in önünde) + PageHeader 22px — Dashboard'u da etkiler.

---

## Bölüm 11 — v5 IA revizyonu (lo-fi shadcn wireframe, 2026-06-02)

**Status:** Eray onayladı (design-level). **Lo-fi wireframe** olarak canlı doğrulandı: [concepts/wireframe-v5-shadcn.html](./concepts/wireframe-v5-shadcn.html) (default shadcn/ui styling, tek dosya, `.claude/launch.json > wf-v5` → `localhost:8094`). **Henüz koda dökülmedi** — bu, tüm uygulamanın IA/yerleşim revizyonunun KAYNAĞI. v4 wireframe = görsel/palet referansı kalır; **v5 = IA/yerleşim referansı**. Hi-fi pass ikisini birleştirir (v5 yapı + v4 koyu palet).

### 11.1 Mekânsal model — sidebar = proje, footer = motor
- **Sidebar = proje kapsamı** (seçili proje): Dashboard · Board · References · Memory · Reports · Project settings (Project info / Integrations / Environments / Agent models). Collapse → **56px ikon-rail**.
- **Footer = motor kapsamı** (tüm projeler / daemon): ⚙ Kortext · tema · daemon `:3200` · ajan durumları ↑ · worktrees ↑ · terminal.
- **Bağlamsal sidebar:** footer ⚙ → AYNI sidebar proje→motor menüsüne döner (LLM Auth/Agents/Rules/Workflows/Notifications/Hooks/Scripts) + "← <proje>" geri. **İki sidebar DEĞİL.**
- **Topbar:** proje seçici + version seçici (sürümler önceden planlanır: 1.0/1.1/1.2) + ⌘K arama + bildirim. (+p avatar ve tema toggle topbar'dan KALDIRILDI.)

### 11.2 Tekrar eden desen — "global bağlantı / yerel tercih"
"Bir kez kur, her projede ayarla." Üç yerde çıktı → kural:
- **Agents:** persona gövdesi (anayasa) global + read-only (Kortext > Agents); **model ataması projeye göre** (Project settings > Agent models).
- **Notifications:** Slack/Telegram **bağlantısı global** (Kortext > Notifications); **proje-bazlı aç-kapa/yönlendirme** (Project info > Notifications).
- **LLM Auth:** CLI auth global (Kortext > LLM Auth, "Use CLI").
- → Yeni entegrasyonda sor: "bu **bağlantı** mı (global) yoksa **tercih** mi (yerel)?"

### 11.3 Board
- **Epic = en soldaki FİLTRE kolonu** (workflow durumu DEĞİL). Task/Bug/Debt kolonlarda akar: To Do → In Progress → Test → Review → Done (tam-yükseklik lane'ler).
- **Kart önü:** gate şeridi (item-bazlı geçerli set) + X/N sayaç + dependency rozeti + assignee (persona ikonu). **Status rozeti YOK** (kolon durumu kodlar).
- **Kart detayı (sağ sheet):** açıklama · **Acceptance criteria** (içerik checklist) · **Gates** (item-bazlı) · **Dependencies** (item listesi + durum) · Comments · durum-geçiş footer'ı.

### 11.4 Gate modeli (Definition of Done)
- "Bitti" = item için geçerli **gate'lerin** hepsi geçti. En fazla 5: **AC · Quality control · Security control · Design review · Code review**. **Item-bazlı** (bazısı N/A — ör. debt'te design yok). Front'ta X/N.
- "Acceptance criteria" (kabul kriteri checklist'i, içerik) ≠ "Gates" (review listesi); gate'lerin ilk maddesi "AC" = kriterlerin karşılanması.

### 11.5 Item tipleri
- Sadece **Epic / Task / Bug / Debt**. **Hotfix ve Spike item DEĞİL** (hotfix = düzeltip yayınladığın bug; spike = item doğuran/iptal eden araştırma).
- Tek terim **assignee** (owner/assignee ayrımı bırakıldı).

### 11.6 File-browser deseni (References / Memory / Reports / Kortext Agents·Rules·Workflows)
- Ortak **2-pane** (sol dosya listesi + sağ md görünüm), tam-sayfa. Gerçek uygulamada = **tek `<FileBrowser>` bileşeni**.
- **References** editlenebilir; **Memory/Reports/Agents/Rules/Workflows** read-only.
- **Memory:** read-only, 3 dosya (handover/decisions/learned); "Açıklama iste" → kart-altı inline thread + Activity'ye düşer, memory'yi DEĞİŞTİRMEZ.
- **Reports:** ajan-üretimi, talep-üzerine ("Request report").

### 11.7 Settings ayrımı
- **Project settings (sidebar):** Project info (General: name/code immutable · Target platform: iOS/Android/Web/Desktop · Notifications: proje aç-kapa · Danger zone) · Integrations (GitHub[repo+branch+auto-commit+PR-approval] · Stripe · Vercel · Firebase · Sentry) · Environments (dev/staging/prod + maskeli env-var) · Agent models (persona→model, projeye özel).
- **Kortext settings (footer ⚙, motor):** LLM Auth · Agents · Rules · Workflows · Notifications · Hooks · Scripts. **Sol alt-menü** (sekme değil — Project settings ile tutarlı).
- **Hooks vs Scripts:** Hooks = olay-tetiklemeli otomasyon; Scripts = elle/talep çalışan hazır yardımcılar.

### 11.8 Dashboard
- Sağ 1/3 = **Activity timeline** (ters-kron; item/rapor/memory hareketleri; satır tıklanır → detay).
- Sol 2/3 = **TBD placeholder** (Eray "şimdilik böyle kalsın"; adaylar: aktif iş + bekleyen onay + KPI).

### 11.9 Tema
- Footer'da **tek buton** (Lucide `contrast` — yarım-dolu daire), light↔dark. Yapı: [erayendes/themeSwitcher](https://github.com/erayendes/themeSwitcher). (auto, tek-buton için düştü.)

### 11.10 Persona ikon/renk sistemi
- 15 persona = Lucide ikon + renk. Kaynak [PERSONA-ICONS.md](./PERSONA-ICONS.md) / `src/lib/persona-colors.ts`. Yüzeyler: Kortext Agents listesi, footer ajan paneli, board kart assignee, kart detay assignee, memory avatar. **Tek harita** (handle→{ikon,renk}).

### 11.11 Tıklanabilirlik
- Bildirim merkezi item'leri + Activity timeline satırları → ilgili detaya gider (task/bug drawer, memory, board).

### Reddedilenler (bu tur)
- Kortext settings için **üst sekmeler** (tutarsız) ve **ikinci sol sidebar** (kalabalık) → yerine bağlamsal sidebar.
- Tema topbar toggle / Appearance sekmesi → yerine footer tek buton.
- Hotfix/Spike item tipi.

### Açık (sonraki oturum karar verir)
- **Version selector** semantiği (proje sürümü mü / snapshot mı / release mi?).
- Dashboard 2/3 içeriği.

## Bölüm 12 — v6 hi-fi wireframe (Linear-minimal, tek-dosya, 2026-06-04)

[concepts/wireframe-v6-hifi.html](./concepts/wireframe-v6-hifi.html) — v5 IA'sının hi-fi hâli. Tek dosya (Tailwind CDN + Lucide CDN + inline JS), Geist/Geist-Mono, shadcn token sistemi, Linear-minimal koyu/açık palet (`--accent:#5E6AD2`). Canlı: `.claude/launch.json > wf-v5` → `localhost:8094/wireframe-v6-hifi.html`. **KOD DEĞİL** — hi-fi görsel/etkileşim spec'i; `src/` implementasyonu buna bakacak.

### 12.1 Kapsam — uçtan uca gezilebilir
Tüm ekranlar + global bağ dokusu tamam: **Dashboard · Board · References · Memory · Reports** · Project settings (**Project info · Integrations · Environments · Agent models**) · Kortext settings (**LLM Auth · Agents · Rules · Workflows · Notifications · Hooks · Scripts**, sidebar-swap) · footer (**Agents/Worktrees popover · Terminal CLI**) · **item/epic drawer · ⌘K paleti · bildirim merkezi · topbar dropdown'lar · new-item modalı · empty state**.

### 12.2 Paylaşılan-primitif mimarisi (gerçek React'e çıkış haritası)
Dört "tek-kaynak" katmanı — her biri tek React bileşenine iner:
- **`fb-*` file-browser** → References (editable) · Memory (read-only) · Reports (read-only) · Kortext Agents/Rules/Workflows → tek `<FileBrowser mode>`.
- **`ANNO` anotasyon motoru** → References "Revise" (statü makinesi) · Memory + Reports "Clarify" (Activity'ye düşer, veri değişmez) → tek `<AnnotatableDoc mode>`. Context'ler (`ref`/`mem`/`rep`) `el.closest('#…-md')` ile ayrışır.
- **`.set-*` settings primitifleri** → 4 project-settings pane (form=dar / matris=`.wide` geniş).
- **`.drawer` + `.overlay`** → item/epic detail · notifications · ⌘K · new-item.

### 12.3 Anahtar kararlar
- **Read-only ≠ editable:** References düzenlenebilir (Revise+Approve, statü makinesi: Approved/Waiting/Draft). Memory + Reports read-only → "Clarify" satır-anotasyonu Activity'ye düşer, **içeriği değiştirmez** ("sent to Activity · unchanged" toast). Aynı `ANNO` motoru, farklı `submit()` closure.
- **Kapsam değişimi = sidebar içerik swap'i** (ikinci sidebar değil): footer ⚙ Kortext `#sb-project` ↔ `#sb-kortext`; "← Acme CRM" geri.
- **Blocked bir statü değil, ortogonal bayrak:** item-detail'de Status gerçek kolonu gösterir ("In progress · blocked"), üstte kırmızı banner + **block sebebi** (`blockReason`).
- **Stop:** in-progress item'da "Stop agent" (çalışan ajan durur); blocked → Unblock; diğer → Move to review. Footer durum-duyarlı.
- **Gate ≠ AC bilerek ayrı:** gate = süreç durumu (passed/pending/n-a rozeti), AC = ikili checklist (checkbox). Birleştirilmedi.
- **Immutable alan = form-kontrolü değil:** Project name/code/platform düz değer (disabled input değil). Target platform **çoklu** (Web+iOS).
- **Terminal = çalışan mini-CLI:** `status/agents/gate/help/clear` cevap verir; `agents` çıktısı footer popover ile **aynı `FAGENTS`+persona-renk** verisini metin olarak gösterir.
- **Reports = read-only, çok-tip:** 8 rapor tipi (`templates/reports/*` yapısı), tarihsiz ad, scope/statü yok → ad+ajan. markdown **tablo** desteği (`mdToHtml` blok-farkında).

### 12.4 Ders (kayıtlı)
- **CDN ikon riski:** Lucide marka ikonları kaldırıldı (`github` render olmaz → `git-branch`); yeni ikonlar (`book-alert`) tarayıcıda eval ile doğrulandı. `@latest` kullanırken ikon adını teyit et.
- **Const TDZ:** `KAGENTS = AGENT_MODELS.map(...)` script'te `AGENT_MODELS`'dan önce gelince "before initialization" attı → lazy-build çözdü. Tek-script dosyada blok sırası önemli.
- **Önizleme screenshot lag:** bu oturumda ısrarla 1-2 kare geride; ölçüt = `preview_eval` ile DOM teyidi (screenshot ikincil). Hedef genişlik 1600px — 800px "dar test" sıkışık gösterir, yanıltıcı.

---

## Bölüm 13 — Canlı UAT + backlog file-ingestion köprüsü (2026-06-05)

**Status:** İmplemente + canlı kanıtlandı. `feat/mcp-headless-executor` dalı → main'e merge + origin'e push (Eray onayı). 721 test yeşil.

**Bağlam:** Gerçek BRD (Dinamik Hidrasyon Asistanı) ile `/Users/erayendes/Documents/_codebase/UAT`'ta canlı UAT. Backend `cwd=UAT` ile çalışır; vitrin (14 ekran + onboarding) doğrulandı; gerçek analiz pipeline'ı BRD'den PRD/TRD/PFD + 9 referans üretti.

### 13.1 Çekirdek bulgu — backlog otonom üretilemiyordu
Onboarding analizi çalıştırıyordu ama **backlog hiç dolmuyordu**. İki sebep: (a) `startCommand` `nextWorkflowId`'yi takip etmiyordu → backlog'u türeten `planning-pipeline` hiç çalışmıyordu; (b) çalışsa bile headless ajanların backlog **oluşturma yolu yoktu**.

### 13.2 MCP yaklaşımı denendi → canlı testte reddedildi
İlk tasarım: headless executor'lara Kortext MCP araçlarını (`add_backlog_item` …) `--mcp-config` ile bağlamak (4 motor için, genel erişim — Eray seçti). İmplemente edildi (parser/descriptor/Claude enjeksiyonu/factory threading, hepsi testli). **Canlı test (executor=claude) çökertti:** headless sistem-prompt'u ajanları **Write-tool/dosya** ile çalışmaya zorluyor; ajan 47 backlog item'ını bir **dosyaya** yazdı, `add_backlog_item`'ı çağırmadı → DB boş kaldı. MCP'yi çalıştırmak çekirdek headless sözleşmesini + tüm personaları + sinyal-çıktı işlemeyi yeniden yazmayı gerektirirdi (büyük, akıntıya karşı).

**Karar (Eray, sade-dille "dosya köprüsü"):** MCP'den vazgeç. Ajan zaten yapılandırılmış bir backlog **dosyası** üretiyor → onu parse edip gerçek satırlara çeviren bir köprü ekle. MCP-kablolama commit'leri **geri alındı** (`git reset`), yalnız genel-fayda olan `busy_timeout` korundu. *Risk açıklaması Eray'a yapıldı (sade dille): dosya köprüsü = düşük risk/hızlı ama formatlama tutarlılığına bağlı + işlem başına okuyucu; tam MCP = büyük/riskli, çalışan analiz-inşa adımlarını bozabilir.*

### 13.3 Dosya köprüsü mimarisi
- `planning-pipeline` step 1 (+engineering-manager) artık **`.kortext/foundation/backlog.yaml`** yazar (katı şema in-step; eski `add_backlog_item` talimatı kaldırıldı).
- `server/engine/backlog-ingest.ts` (saf): `parseBacklogYaml` (top-level `items:` **VEYA** markdown'daki ```yaml fenced blok fallback) → `ingestBacklogItems` (idempotent: var olan id atlanır) → `ingestBacklogFile` (oku+parse+ingest, audit özeti).
- Motor hook'u: `SafetyGuards.backlogIngester` (`worker-pool.ts`), adım sonrası `outputIndexer` ile aynı best-effort desende çalışır; `server/index.ts` `basename === 'backlog.yaml'` ise `ingestBacklogFile`'ı çağırır (ana proje DB'sine).

### 13.4 Sağlamlık kararları (canlı veriyle şekillendi)
- **Sessizce kaybetme YOK:** bozuk bir fenced blok artık `errors`'a eklenir + `ingestBacklogFile` `created/skipped/parse_errors` özetini **audit-log**'a yazar. (Gerçek dosyada 46 item'ın 21'i sessizce kayboluyordu — yakalandı.)
- **Tip coerce, atma değil:** ajan `type`'a domain kategorisi yazıyor (`infrastructure`/`security`); enum dışı tip **keyword ile eşlenir, yoksa `task`** olur, orijinali `frontmatter.original_type`'a yazılır. Item asla tip yüzünden atılmaz.
- **Bilinmeyen alan passthrough:** ajanın eklediği alanlar (`phase`/`references`/`prd_id`) frontmatter'a korunur.
- **busy_timeout:** çoklu yazar için (ileride driver/MCP alt-süreçleri).

### 13.5 Canlı kanıt + caveat
Gerçek Claude ajanı BRD'den **83 item'lık temiz `backlog.yaml`** (0 parse hatası) yazdı → ingester **83/0** satır → **Board'da 83 gerçek görev**. Caveat: bu koşuda `acceptance_criteria`/`review_gates` seyrekti (ajan kendi alanlarını kullandı, kayıp yok). **Açık iş:** sonraki planning adımlarını (qa/security/designer "update") da ingest et; standalone CLI'a da `safetyGuards` bağla; tek-seferlik kesintisiz onboarding→Board (~25dk) koşusu. Bkz. [TODO](./TODO.md), [spec](./specs/2026-06-04-backlog-ingest-bridge.md).

---

## Bölüm 14 — Workflow kuralları runtime'a bağlandı + sistem-geneli paralellik (2026-06-05)

**Status:** İmplemente + **744 test yeşil** + typecheck temiz. Analiz kapıları **canlı kanıtlı** (mock executor, deterministik). Üç dilim main'e merge edildi (commit'ler `7102c53` kapılar, `de5b129` backlog, `2ccffe3` ekran + 3 merge commit). Paralellik iki ek lokal commit: `237acc6` (DAG-paralel kapılar), `e9efac2` (driver paralelliği). **origin'e PUSH EDİLMEDİ** (Eray onayı bekliyor).

**Bağlam:** Eray tespit etti — canlı UAT'ta sistem **workflow'ların içindeki kuralları atlıyordu**: artifact onay kapıları sana hiç düşmedi, epic/versiyon üretilmedi, persona modelleri seçilmedi. Teşhis: kurallar workflow dosyalarında doğru yazılı (DAG + `approver: +prime`) ama runtime onları uygulamıyordu — onboarding, kapı-denetleyici verilmeyen `startCommand` kısayolundan gidiyordu.

### 14.1 Üç dilim (paralel ajanlarla implemente)
- **Onay kapıları bağlandı.** Mekanizmanın %90'ı zaten vardı (`ApprovalQueue`, `worker-pool` kapı mantığı, REST `/api/questions` + `/api/runs/:id/approve`) ama onboarding `runWorkflow`'a `gateController` vermiyordu. Yeni `server/orchestrator/queue-gate-controller.ts` (`QueueGateController`) kuyruğa bağlanır; `server/index.ts` onboarding koşusuna geçer. `pending_questions`'a artifact metadata sütunları: `artifact_path`/`persona`/`phase` (**migration 007**). Onay→approve, başka herhangi bir cevap→reject(reason).
- **Epic/versiyon/model köprüye eklendi.** DB'de `epic` tipi + `parent_id` + `version` sütunları zaten vardı; `backlog-ingest` bunları tanımayıp frontmatter'a atıyordu. Artık `version`/`parent_epic`(`parent`)→sütun eşlemesi + yeni `model` sütunu (**migration 008**) + `planning-pipeline.md` bu alanları (`type: epic`, `parent_epic`, `version`, `model`) üretir.
- **"Proje hazırlanıyor" timeline ekranı** (`src/routes/initializing.tsx`): `/api/questions`'ı yoklar, status-pill + Onayla/Revize satırları, tıkla→artifact drawer.

### 14.2 DAG-paralel onay kapıları (kritik düzeltme)
Eray tespit etti: **LEGAL ∥ GROWTH paralel olmalıydı** — tek vaka değil, ilke (koşabilen tüm doküman/rapor/görev paralel). Kök sebep: `worker-pool` kapıyı **adım index'ine** bağlamıştı (yorum bile "phase boundary by index" diyordu) + tekil `pendingGate` slotu → her kapılı adım index sırasına serileşiyordu, ve iki kapı aynı anda onayda duramıyordu.

**Düzeltme:** kapı per-step, **DAG bağımlılığına** bağlandı (`gateByStepKey`/`gateApproved`/`gatesToFire`). Bir kapı yalnız **kendi bağımlılarını** bekletir; bağımsız kardeş paralel koşar; bir tüketici (PRD) ancak listelediği her kapılı bağımlılık **done + onaylı** olunca hazır olur. Birden çok kapı eşzamanlı pending olabilir. `GatePauseContext`'e abort sinyali eklendi (bir kapı reddedilince paralel bekleyenler asılı kalmasın).

**Seçilen semantik (Eray, AskUserQuestion option 1): "onaylanan kalır, revize tek başına döner."** Canlı kanıt: tetikleme sonrası `/api/questions` **aynı anda 2 açık kapı** (LEGAL+GROWTH); sadece GROWTH onaylanınca PRD belirmedi, LEGAL de onaylanınca belirdi. **FAZ 2 ÇÖZÜLDÜ → bkz. §14.6.**

### 14.3 Sistem-geneli paralellik (dev-cycle driver)
İlke gereği tüm boru hattı denetlendi. Bulgu: `driveReadyItems` Phase 2 (test gate'leri) ve Phase 3 (review) item'ları `for...await` ile **tek tek** işliyordu. Düzeltme:
- Yeni `server/orchestrator/pool.ts` `mapWithPool` (sıra-korumalı, sınırlı eşzamanlılık; `runReadyItems` desenini genelleştirir).
- **Phase 2 tam paralel** (saf gate yargısı, paylaşılan durum yok).
- **Phase 3: yargılar paralel, MERGE'LER SERİ.** `review-cycle` `judgeReview` (paralel insan onayı) + `runClosure` (seri git merge) olarak bölündü. Sebep: tüm merge'ler paylaşılan `development` dalına yapılır → paralel git merge çakışır. Ayrım: **"yargı" (ajan/insan, dakikalar → paralelleştir)** vs **"merge" (git, saniyeler → seri kalmalı).**
- Zaten paralel olanlar korundu: yeni `to_do` item'lar (ayrı worktree), bir item'ın kendi test gate'leri (`Promise.all`), workflow-içi adımlar (concurrency=3).

### 14.4 Ayarlanabilir tavanlar (bug değil)
Workflow-içi `concurrency=3` ve `maxConcurrentWorktrees=10` — kasıtlı güvenlik tavanı (aynı anda kaç gerçek ajan/disk). Yükseltilebilir; gerçek ajanlarda kaynak/maliyet artar.

### 14.5 Açık işler
~~(1) Ekran etkileşim bug'ları~~ ✅ §14.6 · ~~(2) Kapı Faz 2~~ ✅ §14.6 · (3) Epic/versiyon/model + dev-cycle paralelliği + kapı-revize için **gerçek-Claude canlı koşu** (745 test yeşil, canlı değil) — **tek kalan iş.** Bkz. [TODO](./TODO.md).

### 14.6 Faz 2 — "revize tek başına döner" + ekran bug'ları çözüldü (2026-06-05, commits `7e56755`, `575ca49`)

**Kapı Faz 2 (`worker-pool`):** §14.2'nin açık bıraktığı "reject tüm run'ı abort ediyor" giderildi. Tekil `rejectionReason` + paylaşılan `aborter.abort()` **tamamen kaldırıldı**. Yeni davranış: bir kapı reddedilince yalnız o adım **yerinde yeniden üretilir** — `done`'dan düşürülür + `firedGates`'ten temizlenir → scheduler'ın mevcut `readyKeys(done)` türetimi adımı kendiliğinden yeniden başlatır, adım bitince kapısı yeniden ateşlenir (yeni onay turu). Onaylanan kardeş kapılar ayrı `gateApproved` kümesinde durur, dokunulmaz. Hiç yeni scheduling kodu eklenmedi — mevcut mimarinin türetim özelliği kullanıldı.
- **Revize geri-bildirimi:** `ExecutorContext.reviseFeedback` (opsiyonel) revize nedenini re-execution'a taşır; `worker-pool` tek-seferlik `reviseReasonByKey` map'inden okur, claude executor prompt'a "⚠ REVISION REQUESTED" bloğu olarak ekler. (codex/gemini executor'lara da bağlanabilir — follow-up.)
- **`retryRun` daraltıldı:** kapı reddi artık `cancelled` run üretmediği için `retryRun` yalnız crash-recovery (`orphaned:` prefix) için kaldı. Eski "reject→cancel→retry" testi orphaned-resume testine dönüştürüldü; yeni paralel-reject testi LEGAL∥GROWTH'ta GROWTH'un tek başına revize→onay'ını, LEGAL'in dokunulmadan durmasını kanıtlıyor.
- **Sonsuz revize:** insan sürekli reddederse adım sonsuz yeniden üretilir (insan-güdümlü, kabul edilebilir — yanıtlanmamış kapı zaten run'ı süresiz bekletir).

**Ekran bug'ları (`src/`):** Dördü de çözüldü + tarayıcıda kanıtlandı (375px screenshot + DB teyidi). (1) `main.tsx` hash deep-link normalizer — çıplak `/initializing` router mount'tan ÖNCE `/#/initializing`'e `replaceState`'lenir (pathname `/`'e döner → sonraki `<Link>`'ler temiz kalır); router.tsx'e dokunulmadı (route sahipliği screen-session'larda). (2) satır Onayla = gerçek `<button>` + `e.stopPropagation()` → drawer açmadan inline onay (drawer'ın approve yolunu yansıtır). (3) satır Revize → `initialRevise` prop ile drawer doğrudan revize modunda. (4) `@media (max-width:560px)` — sidebar mevcut `.collapsed` görselini (52px) zorlar, satır butonları kırpılmaz, drawer tam-genişlik; desktop'a sızma yok.

### 14.7 Backlog enrichment + step-8 rapor bulgusu çözüldü (2026-06-05)

Canlı koşunun (§14.2) çıkardığı iki bulgu giderildi. **Kök neden ortak:** headless Claude ajanı Kortext'in iç yardımcılarını (`writeReport`, MCP) değil **düz Write tool'unu** kullanıyor → kendi formatını uyduruyor. Çözüm Eray'la onaylandı (AskUserQuestion: "ikisi birden" = workflow kalibrasyonu + motor toleransı; "var olanı güncelle" = upsert). **+6 test, 751 yeşil, typecheck temiz.**

**(A) Epic/versiyon/model Board'a inmiyordu — üç katmanlı çözüm:**
1. **Upsert ingester (`backlog-ingest.ts` + `backlog.ts`):** `ingestBacklogItems` artık create-only değil — var olan id'yi atlamak yerine **planning kolonlarını günceller** (`type/title/parent_id/version/model/review_gates/frontmatter/body_md`), `status`/`owner`'a DOKUNMAZ (motor-sahipli; re-ingest bir item'ı `to_do`'ya geri çekemez). Yeni `repos.backlog.updatePlanningFields()`. Dönüş tipine `updated: string[]` eklendi. Bu, çok-adımlı pipeline'ın **her adımda backlog.yaml'i baştan yazıp** uzman katkılarının (gate/versiyon/model) DB'ye birikmesini sağlar — eski "yalnız step-0 ingest edildi" sorununun kalıcı çözümü.
2. **Synthetic epic türetme (`deriveSyntheticEpics`):** Ajan `parent_epic` yerine düz `epic: "Altyapı"` etiketi yazarsa (id değil, etiket), ondan gerçek `type: epic` item türetilir (kararlı id `epic-<slug>`) + child'lar bağlanır → Board epic sütunu boş kalmaz. **Kemer+askı:** workflow düzgün `parent_epic` yazarsa türetme hiç tetiklenmez (explicit parent_id kazanır).
3. **Workflow kalibrasyonu (`workflows/planning-pipeline.md`):** Ölü `update_backlog_item` MCP atıfları temizlendi. Her enrichment adımı artık "mevcut backlog.yaml'i oku → katkını uygula → **bütün dosyayı yeniden yaz**" der. **DAG kısıtı:** her adım `backlog.yaml`'i **ek output** olarak verir (token zinciri sıralamayı sürdürür; backlog.yaml input'a girmez → döngü yok — `buildGraph` lineer 1→9 doğrular). Böylece `backlogIngester` safety-guard her adımdan sonra ateşler. Step-0 artık `type: epic` container'ları + `parent_epic` id'lerini **zorunlu** kılar (synthetic türetme yalnız non-compliant ajan için güvenlik ağı).

**(B) Step-8 konsolidasyon raporu FAILED — output-resolver toleransı:** `<ts>` pattern'i (`\d{4}-\d{2}-\d{2}-\d{4}`) yalnız canonical `2026-06-05-1959` eşliyordu; ajan `planning-reports_planning_20260605.md` (compact, tarih-only) yazınca dosya diskte olduğu halde "üretilmedi" dendi. Pattern gevşetildi: tarih + opsiyonel ayraç + opsiyonel saat (`20260605`, `2026-06-05`, `20260605-1959` hepsi eşler), ama `draft` gibi tarih-olmayan çöp hâlâ reddedilir. Canonical form regresyonsuz çalışır.

**Uçtan uca kanıt (in-memory):** iki-geçişli ingest (skeleton → enriched) → 0 yaratım/3 güncelleme, Board sütunları 1 epic / 2 child / 3 version / 3 model (canlı koşuda 0/0/0'dı). Fallback: düz `epic: Payments` → `epic-payments` epic'i türetildi.

### 14.8 Dayanıklılık — adım-seviyesi transient CLI retry (2026-06-05)

§14.7'yi gerçek-Claude ile canlı doğrulamak için `kortext-live-uat-v2`'de kesintisiz koşu denendi: **analysis adım 0-8 gerçek ajanla başarılı**, ama **adım 9 (+engineering-manager) geçici bir CLI hatasıyla düştü** — `API Error: The socket connection was closed unexpectedly` (exit 1, `aborted=false`). Zincir planning'e ulaşmadı. Bu kod değil, headless `claude` CLI'ın uzun deep-research adımında aldığı ağ/API blip'i. Sorun: tek bir geçici hata **tüm run'ı** `failed` yapıyordu (`retryRun` yalnız startup `orphaned:` crash-recovery için).

**Çözüm (TDD, +8 test):** `cli-spawn.ts`'e iki parça eklendi:
- **`isTransientCliFailure(res)`** — saf sınıflandırıcı. `aborted` → false (iptale saygı), `exitCode === 0` → false; aksi halde stdout/stderr'de **dar** bir marker setine bakar (socket closed, API Error, ECONNRESET/ETIMEDOUT/EAI_AGAIN, fetch failed, connection error, overloaded, rate-limit, 429, 5xx). Liste dışı her şey (bad-model, ENOENT, auth-red, declared-output-missing) **deterministik** → retry yok (boşa token yakmaz).
- **`spawnCliWithRetry(opts, {maxAttempts, retryBaseDelayMs})`** — aynı komutu transient sonuçta exponential backoff'la (base·2^(k-1)) yeniden spawn eder; başarı / non-transient / `maxAttempts` tükenince durur. Log `flags:'a'` ile eklemeli → denemeler aynı log'da birikir.

`claude-cli-executor` artık `spawnCliWithRetry`'ı varsayılan `maxAttempts: 3` ile sarıyor. Codex/gemini executor'ları henüz `spawnCli`'ı doğrudan kullanıyor (kullanılan executor claude; diğerleri opsiyonel follow-up). Üretimde canlı ajanlar bu blip'leri düzenli alacak → kesintisiz zincir için şart. **Canlı kanıt:** `kortext-live-uat-v2`'de adım 9 aynı socket hatasını yine aldı → **2 spawn = retry → başarılı** (log'da görünür); geçen sefer fatal olan blip bu sefer kurtarıldı.

### 14.9 Performans — delta (patch) köprüsü (2026-06-05)

§14.7+§14.8 ile kesintisiz canlı koşu nihayet planning'e ulaştı, ama **ölçek sorunu** ortaya çıktı: planning enrichment adımları her biri **~22 dk** sürdü (qa 1415s, security 1351s). Neden: §14.7 "her adım bütün backlog.yaml'i yeniden yaz" dedi; 100 item'da bu **1355 satır / 80KB**'ı her adımda ajana yeniden ürettiriyor → tam planning ~3 saat. Eray "aşırı yavaş" dedi (haklı; öngörülmeliydi). Eray seçimi: **delta köprüsü**.

**Çözüm (TDD, +8 test):**
- **Patch parse modu** — `parseBacklogYaml(text, {mode:'patch'})` yalnız `id` zorunlu kılar; full mode (id+title+type) regresyonsuz.
- **`patchBacklogItems`** — alan-seviyesi **birleştirme**: yalnız patch'te gelen alanlar değişir, gerisine dokunulmaz. `review_gates` **eklemeli union** (qa/security/designer her biri kendi gate'ini ekler), diğer alanlar son-yazan-kazanır, `type` asla değişmez, var olmayan id atlanır (patch yaratmaz).
- **`backlog.patch.yaml` köprüsü** — ayrı dosya adı; `backlogIngester` guard onu `ingestBacklogPatchFile`'a yönlendirir. Workflow: step 1 tam `backlog.yaml` yazar, enrichment adımları (2-9) yalnız `backlog.patch.yaml`'e `id` + değişen alan yazar → ajan çıktısı 80KB'tan birkaç satıra düşer.
- **DB → backlog.yaml serializer** (`serializeBacklogToYaml` / `writeBacklogYamlFromDb`) — **kritik incelik:** personalar `backlog.yaml`'i okuyor ama patch'ler yalnız DB'yi günceller; dosya step-1'de kalsaydı model adımı (assignee'ye bağlı) ve konsolidasyon (tüm zenginleşmeyi görmeli) bayat veri okurdu. Motor **her patch'ten sonra** dosyayı DB'den yeniden serileştirir — ajan büyük dosyayı asla yeniden yazmaz (hızlı), motor anında tazeler (token'sız), her persona güncel + tam-zengin backlog'u okur. (Motor yazımı guard'ı tetiklemez → döngü yok.)

**DAG:** step 1 `backlog.yaml`, adım 2-9 `backlog.patch.yaml` output verir; hiçbiri input almaz → döngüsüz lineer 1→9 (`buildGraph` doğrular). **Uçtan uca (in-memory):** full skeleton + 4 ardışık patch (gate×2/version/model) → tüm alanlar birleşti, clobber yok, review_gates 3'lü union. **767 test yeşil.**

**Canlı kanıt (kortext-live-uat-v2, 2026-06-06) — tam zincir KESİNTİSİZ tamamlandı (ilk kez):** onboarding → analiz (12 adım, 30 dk) → planning (9 adım) → Board. Her iki run `succeeded`, hata yok.
- **§14.7 tam doğrulandı (5/5 sütun, DB 127 item):** epics=18, parent=109, version=127, model=127, gates=97 (önceki koşuda hepsi 0). Synthetic epic fallback canlı: ajan düz `epic:` etiketi yazdı → motor **18 gerçek `type:epic`** türetip 109 task'ı bağladı (0 dangling FK). Step-8 konsolidasyon **succeeded** + rapor yazıldı (`planning-reports_kortext-v1_2026-06-06-1200.md`) — eski step-8 FAILED bulgusu da kapandı.
- **§14.9 hız kazancı (enrichment adım süreleri, §14.7 koşusuyla yan yana):** qa 24dk→**7dk** (3.3×), security 22dk→**5dk** (4.7×), designer 22dk→**3dk** (~7×). Planning toplam ~56 dk (eskiden öngörülen ~3 saat). `review_gates` union canlı birikti (45→80→90→97).
- **Serializer doğrulandı:** diskteki `backlog.yaml` her patch sonrası DB'den tazelendi (97KB, 127 item, tüm sütunlar dolu) → model adımı assignee'yi, konsolidasyon tam zenginleşmeyi okudu.
- **§14.8 retry:** bu koşuda transient hata çıkmadı (gerek olmadı); önceki v2 koşusunda adım 9 retry'la kurtulmuştu (canlı kanıtlı).

**Follow-up (küçük):** `/api/backlog` limit=100 sayfalaması 127 item'da en eski 18 epic'i kesiyor (Board görünümü) — sayfalama/epic-öncelik gerekir. Veri doğru (DB 127); yalnız liste API'si.

---

## Bölüm 7 — v3.1 CLI implementation + Faz-3 motor + içerik + approval merdiveni (2026-06-06 → 07)

**Status:** Hepsi koda döküldü + main'de. **951 test yeşil**, typecheck temiz, build başarılı, version 3.1.0. Bölüm 0'ın (CLI design) + §5.9/§5.11'in (motor/deployment) implementasyonu. subagent-driven-development (TDD subagent + iki-aşamalı denetim) ile koşturuldu.

### 7.1 v3.1 CLI = proje-başına port (Eray'ın "A" seçimi, Bölüm 0.1'in çözümü)
Tek-daemon-URL yerine **her proje kendi portunda kendi daemon'u**. Sunucu/API/React **dokunulmadı** — iş tamamen CLI + registry katmanında. Global registry `~/.kortext/projects.json` (atomik temp+rename) slug→`{name,path,port,pid,status}` tutar; port 3200+ stabil (yer imleri çalışır). 9 komut: `start/stop/pause/list/remove/purge/update/doctor/help` (Bölüm 0.4). Eski mock-executor workflow runner → `kortext dev:run`; `serve`/`init` dev komutu. EADDRINUSE handler (v3.0.1 borcu): net mesaj + exit 1. **Paketlenmiş smoke test bir release-blocker yakaladı:** `js-yaml` runtime'da import ediliyordu ama `dependencies`'te yoktu → her kurulumda daemon çökerdi; deklare edildi. Detay [plan](../docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md).

### 7.2 Bağımlılık üretimi: ajan yazar + motor doğrular (Eray kararı)
Motor uydurma bağımlılık ÜRETMEZ. Workflow talimatı sertleştirildi (her item `blocks`/`blocked_by` zorunlu), motor ingest'te **simetri zorlar** (A blocks B → B blocked_by A) + **dangling-ref uyarısı** verir. Kodlu epic id'leri: `deriveSyntheticEpics` `code`'u (project.json'dan, server hook'u 3-dirname ile workspace kökünü çözer) alıp `<CODE>-E0N` üretir. **Canlı koşu kalibrasyonu (7.8):** ajan `depends_on` yazınca ingester onu `blocked_by` alias'ı kabul eder.

### 7.3 Motor §5.9 ertelenen dilimler indi
UAT verdict artık `gate_runs` satırı (attempt = önceki uat + 1, UNIQUE çakışması çözüldü); epic-status-flip (çocuklar bitince epic board'da `done`, direct write + audit, idempotent); handover-on-close (`HandoverEngine` closure'a bağlandı — driver thread'i + `+prime` sentetik handle izni gerekti, yoksa prod'da no-op'tu); preview URL kalıcılığı (migration 009 `backlog_items.preview_url`, `frontmatter.preview` flag ile gate'li, API'de açık). Blocker-clear (Slice 2) **migration GEREKMEDEN** çözüldü (7.5). Eski "şema gerek" varsayımı yanlıştı — bağımlılıklar frontmatter'da.

### 7.4 Approval merdiveni: staging + preprod (§5.11 implementasyonu)
- **Epic done → staging:** `deployStaging` (mock-first) → gate-persona staging raporları (gerçek `writeReport` dosyaları) → `staging-approval` sorusu (`metadata={epicId,version}`, migration 010).
- **staging-onay tüketicisi:** onay→raporlar approved + epic `frontmatter.staging_approved` + **version-tamamlama** (bir version'ın tüm epic'leri staging-onaylı) → `deployPreprod` → `preprod-approval` sorusu (idempotent — çift soru engellenir); red→motor `type:bug` açar.
- **preprod-onay tüketicisi:** onay→epic'ler `preprod_approved` + `deployProd` (mekanik release); red→bug. **Zincir preprod-onayında BİTER** — §5.11: preprod onayı → development→main merge + prod deploy + tag, prod gate'i YOK. Tüm deploy'lar **mock-first** (staging gibi); gerçek git main-merge/tag `deployProd`'a foldlandı (follow-up). Cevap route'ta **await edilir** (yan etkiler 200'den önce durable).

### 7.5 Blocker-clear = otomatik 'blocked' (Eray kararı: dürüst board)
Frontmatter tabanlı, **migration yok**. Ingest'te bağımlılığı bitmemiş (non-terminal `blocked_by`) item'lar oto-`blocked`; closure'da bağlı item'lar oto-`to_do` (**`in_progress` DEĞİL** — driver `to_do` seçer, `in_progress`'e alsak takılırdı). Çoklu-blocker: yalnız TÜM blocker'lar terminal olunca açılır. Bu, bağımlılık-sıralı yürütmeyi uçtan uca işler hale getirdi.

### 7.6 CLI sertleştirme + sayfalama
Paralel-`start` yarış kilidi (`server/registry/lock.ts`, sync O_EXCL + Atomics.wait + stale-reclaim; allocate+write kilit içinde taze re-read). `allocatePort` tükenme mesajına kurtarma ipucu. Sayfalama küçük adım (Eray kararı: tam sayfalama gereksiz, projeler 30-150 item): `/api/backlog` `total`+`offset` döner, cap 2000, board "N / M gösteriliyor"; epic roll-up korundu (filtre-öncelikli full fetch). Tam aggregate-endpoint sayfalaması ~500+ item olunca (follow-up).

### 7.7 İçerik kalibrasyonu (tam)
Ölü MCP tool refs (`write_learned`/`write_decision`/`get_backlog_item`) → gerçek dosya-yazım. Tüm `kortext-*.py` script refs (`commands.md`, `behavior.md`, dev-agent'lar) → gerçek v3 MCP tool'ları (`transition_item`/`handover`/`get_acceptance_criteria`/`get_runtime_status`) ya da "motor-otomatik". İçerikte sıfır ölü ref.

### 7.8 Canlı koşu teyidi (gerçek claude ajanı, 2026-06-07)
İzole sandbox (DevVault, code DV), gerçek planning ajanı: **39 item + 6 sentetik epic (DV-E01…E06) + mantıksal bağımlılıklar üretti** → A2 pekiştirmesi + esas belirsizlik (LLM bağımlılık üretir mi) çözüldü. **Bulgu:** ajan `depends_on` kullandı (motorun `blocked_by`'ı değil) → unit-test'in yakalayamayacağı kalibrasyon boşluğu → ingester'a `depends_on`→`blocked_by` alias'ı eklendi ("LLM'i olduğu yerde karşıla"). Fix sonrası gerçek veride: **38/39 auto-block**, simetri türetildi, DV-001 kapanınca bağımlıları açıldı, çoklu-blocker'lı DV-005 doğru şekilde bloklu kaldı. **Kazı:** `dev:run --executor=claude` `--binary`/`KORTEXT_CLAUDE_BIN` şart; full 9-adım pipeline bir zenginleştirme adımında ~70dk askıda kaldı (kill) — adım-zaman-aşımı follow-up.

### 7.9 Süreç notu
Bu oturumun büyük işi paralel keşif ajanları (haritalama) → AskUserQuestion (mimari karar) → TDD subagent'ları (uygulama) → final holistic review (her blok) döngüsüyle yürütüldü. Final review'lar **gerçek prod bug'ları yakaladı:** epic-id proje-kök çözümü (1 seviye yanlış), handover driver-thread eksikliği + `+prime` sentetik handle reddi, fire-and-forget consumer, çift preprod sorusu — hepsi düzeltildi + regresyon testi eklendi. Subagent çıktısını körü körüne kabul etmemenin değeri tekrar tekrar kanıtlandı.

### 7.10 Follow-up implementasyonu (2026-06-07 #2) — gerçek prod merge + tam sayfalama + vocab
- **Gerçek git prod release (§7.4'ün mock'unu gerçekledi):** `deployProd` artık gerçek `development→main` merge + annotated version tag yapıyor (`gitProdRelease`, `repoRoot` enjekte). Idempotent (tag-var / ancestor), ilk-release `main`'i türetir, çakışma→`merge --abort`+`conflict:true`→preprod tüketicisi bug açar. **Prod push (CI) hâlâ mock seam** (gerçek hedef yok). Final review: prod merge sonrası sunucu orijinal branch'e geri döner (`main`'de bırakmaz); `conflict` bayrağı yalnız gerçek merge çakışmasında.
- **Tam sayfalama (§7.6'nın "küçük adım"ını tamamladı):** yeni `GET /api/backlog/aggregate` — epic roll-up + status/version/assignee sayıları + per-version açık-iş sayısı, hepsi sunucu-tarafı TÜM item üzerinden (birkaç GROUP BY). Board/Dashboard roll-up + facet'leri aggregate'ten okur (kart sayfalamasından bağımsız doğru); kartlar "Daha fazla yükle" ile sayfalanır (artık 2000 cap yok). Final review: aktif-version flicker'ı aggregate `openByVersion`'dan giderildi; EpicDrawer ilerlemesi aggregate'ten (rail kartıyla tutarlı).
- **Vocab toleransı belgelendi:** planning-pipeline'a motor-kabul-eder notu (`depends_on`/`feature`/`chore`/`todo`/`epic:` etiketi normalize edilir).
- **Doğrulanan zaten-bitmişler:** dashboard boş-durum dostça mesajları (#6) + CLI allocatePort mesajı/persist-before-spawn (#9) bu blokta zaten mevcuttu — Eray onayıyla ek yapılmadı.
- **Durum:** 977 test yeşil, typecheck + build temiz.

### 7.11 Onboarding-driven directory + otomatik git (2026-06-08)
**Sorun (UAT'tan):** proje dizini İKİ yerde soruluyordu — terminalde `kortext start <dir>` (cwd'ye bağlanır) + onboarding ekranında "Project Directory" picker. Non-coder için kafa karıştırıcı ("daha projem yok, terminal neden klasör soruyor"); üstelik picker daemon'un kendi klasöründen başkasını gösterirse (`isElsewhere`) dosyalar yazılıp **iş hiç başlamıyordu** (sessiz tuzak). Ayrı dert: build fazı git+`development` dalı ister ama Kortext git bootstrap yapmıyordu → kullanıcı elle `git init`/`commit`/`branch` yazmak zorundaydı.

**Kararlar (Eray, AskUserQuestion ile):**
- **Tek doğruluk kaynağı = onboarding sihirbazı.** Dizin GUI'de seçilir, terminalde değil. (Eray "start-klasörü = proje"yi reddetti.)
- **Giriş komutu `kortext start` kalır** (yeni komut yok). Proje yokken çıplak `kortext start` sihirbazı açar. (`kortext new` reddedildi.)
- **Otomatik git bootstrap** proje oluşturulurken (`git init -b main` + ilk commit + `development`); mevcut repo'da sadece `development` garanti (dosyalara dokunmaz).
- **Yaklaşım 1** (kesintisiz): sihirbaz daemon → seçilen dizinde gerçek daemon'u doğur → tarayıcı yönlendir → gerçek daemon boot'ta analizi başlatır. (Daha basit "oluştur + Aç butonu" reddedildi.)

**Mimari (1 daemon : 1 klasör : 1 port kısıtının dayattığı):** Çalışan daemon **yeniden ev değiştiremez** (DB açık, port bağlı). Bu yüzden "dizini sihirbazda seç" zorunlu olarak şu desene varır: çıplak `kortext start` (proje yok) → **geçici bootstrap sihirbaz daemon'u** (`KORTEXT_BOOTSTRAP=1`, scratch home `~/.kortext/bootstrap`, port 3199, `projects.json`'a YAZILMAZ) onboarding'i gösterir → submit'te blueprint route'un **bootstrap dalı** `createProjectAndLaunch` çağırır (iskele → `bootstrapGit` → BRD/meta yaz → seçilen dizinde gerçek daemon'u `startProject` ile doğur) → 201 + `handoffUrl` → OnboardingScreen tarayıcıyı oraya yönlendirir → gerçek daemon boot'ta `autoStartPendingAnalysis` (onaylı BRD + hiç koşmamış → analizi tek sefer tetikler; SQL `workflow_id` filtreli idempotency). Route'un `onApproved`'ı `triggerAnalysis` adlı fonksiyona çıkarıldı (route ve boot aynı tetiği paylaşır).

**Uygulama:** 9 TDD görevi, subagent-driven-development (her görev TDD subagent + iki-aşamalı review). 807→999 test. [spec](../docs/superpowers/specs/2026-06-07-onboarding-driven-directory-design.md) · [plan](../docs/superpowers/plans/2026-06-07-onboarding-driven-directory.md).

**⭐ Final holistic review KRİTİK bir entegrasyon bug'ı yakaladı:** wizard daemon `KORTEXT_BOOTSTRAP=1` ile koşuyor; `spawnDaemon` çocuğun env'ini `{...process.env, ...cmd.env}` ile kuruyordu → doğurduğu **gerçek daemon flag'i miras alıp** kendini wizard sanıyor ve **boot auto-start'ı atlıyordu** → analiz hiç başlamaz, özelliğin tüm faydası sessizce ölü. Birim testleri kaçırmıştı (hepsi spawn'ı mock'luyordu). **Fix:** `env: { ...process.env, KORTEXT_BOOTSTRAP: '', ...cmd.env }` — normal daemon'da temizlenir, wizard'ın kendi `cmd.env`'i (`'1'`) sonradan geldiği için korunur. + sızmayı yakalayan regresyon testi. (Controller olarak reviewer'ın "Important" maddesini de kodda doğruladım — `createProject` `chosen` ile çağrılıyor, daemon-kökü riski yoktu; yanlış-pozitif olarak uygulanmadı.)

**Follow-up ÇÖZÜLDÜ (2026-06-08, "bellboy" self-shutdown):** bootstrap sihirbaz daemon'u (`:3199`) handoff sonrası kendini kapatmıyordu → port sızar, `kortext stop` kayıtsız olduğu için durduramaz, sıradaki `kortext start` çakışır. **Fix:** `scheduleBootstrapSelfExit` (`KORTEXT_BOOTSTRAP=1` guard'lı, unref'li 2sn timer); blueprint bootstrap dalı handoff 201'ini flush edince (`onBootstrapHandoff`) wizard `process.exit(0)` yapar → görevli odanı gösterip çekilir. +4 test. (Gerçek daemon asla self-exit etmez — çift guard: route `deps.bootstrap` + fonksiyon `isBootstrap`.)

**Durum:** **1003 test yeşil**, typecheck + build temiz. Feature 15 commit → `--no-ff` ile **`main`'e lokal merge** edildi (branch silindi) + bellboy self-shutdown (`0cd736d`) + docs; hepsi lokal, **push EDİLMEDİ.** postinstall ipucu + UAT-GUIDE + UAT-SESSION-PROMPT yeni akışa güncellendi.

### 7.12 UAT turu — 4 UAT-güdümlü düzeltme (2026-06-08 #2)

Eray gerçek "ilk kez son kullanıcı" UAT'ı koştu (temiz kurulum + Antigravity executor). **İş bölümü kararı:** UAT operasyonlarını Eray çalıştırır, Claude komut verir + bug için kod düzeltir (hafıza: uat-division-of-labor). 4 bulgu, 3 kod commit'i, **1027 test yeşil**, push edildi.

- **(1) GitHub Repository alanı onboarding'den kaldırıldı.** Sandbox-first akışta opsiyonel alan kafa karıştırıyordu; alan + state + validasyon + ikon + kullanılmayan import temizlendi, submit payload `githubRepo: null` ile tip korundu.
- **(2) OS-farkında port seçimi + daemon hazırlık kapısı.** **Kök neden (sistematik teşhisle):** bir dev/preview sunucusu `:3200`'ü tutuyordu; `allocatePort` yalnız **registry**'deki portları biliyordu, gerçek OS portunu probe etmiyordu → yeni proje daemon'u dolu :3200'e atandı → EADDRINUSE → öldü → tarayıcı işgalciyle kalıp "Cannot GET /". Log "dashboard mounted" diyordu (web yolu doğruydu) → tahminle değil kanıtla çözüldü. **Fix:** `port-probe.ts` (`isPortAvailable` daemon'la birebir host'suz bind eder; `findAvailablePort` registry-claimed + OS-busy portları atlar) + bootstrap rota handoff'tan ÖNCE `reserveFreePort` ile gerçekten boş port alır + `health-wait.ts` (`waitForHealthy`) ile daemon o portta servis veriyor mu doğrular; vermezse 503 + net mesaj (sessiz "Cannot GET /" yerine). `registerProject`/`startProject`/`createProjectAndLaunch` opsiyonel açık `port` kabul eder. Eray "en sağlam" seçeneği seçti (AskUserQuestion).
- **(3) Aktivite mesajları insanlaştırıldı.** `started product-analysis.1` kriptikti — persona payload'da vardı ama kullanılmıyordu. `describeAuditEvent` artık persona + insanlaştırılmış adım gösterir (`compliance-expert started product-analysis step 1`); worker-pool step succeeded/failed payload'larına da persona eklendi.
- **(4) Self-dir guard.** Kortext kendi paket dizinini (dev repo'su veya global kurulum — `package.json` adı `"kortext"`) proje yapmayı reddeder. `resolveStartTarget` 'self' döndürür (bin net mesaj basar), onboarding rotası 422 verir (scaffold etmeden). Eray'ın gereksinimi: "kortext dizininde proje olmasın ve kurulamasın". Repo'daki bayat demo `.kortext` (Jun 1 seed artığı) ayrıca `kortext purge` ile temizlenecek.

**Süreç notu:** (2) systematic-debugging skill'iyle çözüldü — log "dashboard mounted" derken yanlış hipotez (web yolu) kuracaktım; kanıt (curl 404 + tsx/source işgalci süreç + EADDRINUSE log'u + registry/lsof pid uyuşmazlığı) gerçek nedeni (port çakışması) gösterdi. Hepsi TDD (RED→GREEN), her yardımcı bağımlılık-enjekte edilebilir (deterministik test).

### 7.13 Planning enrichment dayanıklılık arkı — UAT #3→#8 (2026-06-08)

Eray ardışık temiz UAT'lar koştu (claude/antigravity/codex); her tur planning'in "kim/hangi epic/sürüm/model" çıktısının Board'a inmemesinin **yeni bir kök nedenini** açığa çıkardı. Hepsi TDD + **gerçek-LLM koşusuyla** kanıtlandı (kritik ders: unit test yetmez — gerçek ajan çıktısı her turda farklı bir varsayımı kırdı). Kümülatif: **1027→1093 test**, hepsi push edildi.

- **#4 (A–F + 3 UX):** patch parser yalnız `items:` kabul ediyordu, ajan `dependency_patches:` yazınca patch tümüyle düşüyordu → `findItemArray` ilk `id`-taşıyan diziyi kabul eder ("LLM'i olduğu yerde karşıla"). `assignee→owner` alias + guarded `setOwner` (asla null'lamaz). Görünür `backlog.patch.dropped`. + codex `exec` alt-komutu, binary auto-discover (`resolveExecutorBinary`), driver varsayılan-armed (`buildDaemonEnv`), home-dizini guard (`isRegistryHome` — `~/.kortext` = registry, proje değil).
- **#5/#6 (naming + FK):** **Naming standardı** (§ yukarı, satır ~104): tek ts `YYYY-MM-DD_HH-MM-SS`, `output-resolver` her ayraç varyasyonunu tolere eder, `planning-reports`→`status-reports`. **FK cascade (yalnız gerçek-LLM gösterdi):** antigravity step-1'de epic üretmedi, epic'i sonraki patch'te tanımladı → `patchBacklogItems` epic yaratamayınca task'ların `parent_epic` FK'i patlıyordu → ön-geçiş eksik `type:epic` container'ları **önce yaratır**. Antigravity koşusu: owner/epic/version/model 8/8.
- **#7/#8 (sinyal + rules + ≤8):** **Sinyal vs dosya çıktı kararı:** workflow adımları hem dosya (`.kortext/...`) hem sinyal/marker (`backlog-drafted`) çıktısı bildirir; `isFileOutput` = `/` veya `.` içerir → dosya, aksi → sinyal (dosya doğrulamasından muaf). Codex sinyali dosya yaratmadan geçemiyordu → step-1 çöküyordu. **Rules enjeksiyon kararı (Eray):** `rules/` ajana hiç ulaşmıyordu; `buildRulesBlock` behavior.md'yi her adıma + adımın `inputs`'unda bildirdiği `rules/*.md`'yi (models.md → model-atama adımı) persona'dan sonra enjekte eder (workflow'un mevcut declarative input'unu kullanır — yeni config icat etmeden). **Granularite:** step-1 PRD/BRD item-sayısı tavanına uyar (codex 16→8). Kanıt: codex+antigravity koşuları succeeded + tüm alanlar dolu; #2 codex'in prompt-echo'sunda rules görünür.

**Ortam notu:** codex headless koşusu `~/.codex/config.toml`'daki cloudflare MCP expired OAuth token'ında asılır (kod değil) — o MCP girdisi kaldırılmalı.

### 7.14 Multi-model persona routing — main'e merge (2026-06-08, `cbe45b8`)

Ayrı bir worktree branch'inde geliştirilen çok-model routing özelliği main'e merge edildi (paralel oturum işi; bu oturum analiz+merge+doğrulama yaptı, çalışan codex koşusunu bozmadan). Persona markdown'ında opsiyonel `- model: <kind>` satırı → `personas.model_default` (DB, index-sync ile thread'lenir) → drive anında `createRoutedExecutor` base executor'ı `PersonaRoutedExecutor` ile sarar (örn. +architect→claude, +reviewer→gemini; aynı kind'i paylaşan personalar tek executor instance'ı yeniden kullanır; override yoksa zero-cost passthrough). E2e markdown→DB→dispatch testi branch'e commit'lendi. **Merge hijyeni:** main working-tree'deki sızmış buggy persona-registry kopyası restore edildi; çakışma yüzeyi tek dosyaydı; benim commit'siz UAT işime dokunulmadı (disjoint). **Kalan (TODO):** onboarding semantiği ("operation-manager modeli") + per-persona Settings UI.

### 7.15 UAT #9 build-fazı — 8 bulgu + GERÇEK-LLM build kanıtı (2026-06-09)

Build fazı ilk kez gerçek koda ulaşınca 8 bulgu çıktı; hepsi TDD ile çözüldü, **gerçek antigravity BUILD koşusuyla canlı kanıtlandı** (1105→1124 test). Plan onaylı, paralel ajanlarla yürütüldü (Stream A gate / Stream B preview ayrık dosya kümeleri).

- **Build sıralaması (#1, stall kökü) — scheduler otoritesi kararı:** Stall'ın kökü iki katmanlıydı: (a) `blocked_by` planning'in son patch'inde set ediliyor → step-1 auto-block'u tetiklenmiyor → tüm item'lar `to_do` kalıyor; (b) `runReadyItems` `to_do`'ları körlemesine paralel başlatıyor → hepsi aynı `development` tabanından → merge conflict → bounce → stall. **Karar (Eray): readiness'i status-flag'e değil scheduler'a göm.** Yeni `build-order.ts` `selectBuildableItems` — en erken açık version → dependency-ready (blocker'lar terminal) item'lar; bounced `in_progress` de aday (#2 retry). `runReadyItems` bunu kullanıyor.
- **#3 UI sebep:** transition reason zaten audit_log'da; `describeActivity` yüzeye çıkarıyor. **#6 +prime:** planning talimat pekiştirmesi. **#7 temp:** `sweepSignalMarkers` → `.kortext/temp/`.
- **Gate-verdict (#4/#5) — KATI karar (Eray):** Gate'ler mekanikti — `AgentGateExecutor` ajan **çökmeden çalıştıysa** pass dönüyordu, gate adımı boş inputs/outputs ile sentezleniyordu (ajan ne kontrol edeceğini bilmiyordu). **Konvansiyon:** gate ajanı `.kortext/reports/<gate>-reports_<slug>_<ts>.md`'ye `verdict: pass|fail` + `ac_results` frontmatter yazar; yeni `gate-verdict.ts` `parseGateVerdict` okur (rapor/verdict yok → **strict fail** — Eray "reddet+geri gönder"); `test-cycle` `ac_results`'ı AC kutucuklarına uygular (`applyCriterionToggle`, motor uygular, ajan yalnız raporlar). Fail → bounce → #2 ile yeniden kodlanır. `designer.md` gerçek tasarım-review + WCAG AA/hiyerarşi kriterleri (#5).
- **#8 deploy zinciri (bounded):** preview URL `/api/backlog`'ta serialize ediliyordu (regresyon testi kilitlendi); `run-item.ts`'teki `frontmatter.preview===true` kapısı kaldırıldı → her zaman persist; drawer'da "Canlı önizleme" linki. Staging→preprod→prod (gerçek git merge+tag) build stall gidince ulaşılır. Prod push kapsam dışı (gerçek hedef yok).
- **⭐ Gerçek-LLM build kanıtı:** antigravity, epic + NOT-001→NOT-002 blocked_by zinciri + quality_control gate. **Sonuç:** NOT-001 done@pass-1 / NOT-002 done@pass-2 (**SERIAL OK** — bağımlı item blocker bitene kadar başlamadı); quality_control gate `pass` + gerçek qa verdict raporu (her AC tek tek + smoke test); **AC kutucukları done işaretlendi**; gerçek git merge (conflict yok); epic→staging tetik. **Ders:** unit test (mock gate) yeterliydi ama gerçek koşu, qa ajanının gerçekten AC-bazlı verdict ürettiğini + sıralı yürütmeyi kanıtladı — mekanik gate'in gerçekten kalktığını ancak canlı gösterdi.

### 7.16 UAT #10 — `blocked` ayrı status/sütun OLMAKTAN ÇIKARILDI → türetilen KİLİT bayrağı (2026-06-09)

**Bu karar §7.5 (blocker-clear = auto-`blocked` status) ve §12.3 ("blocked ortogonal bayrak ama yine de status") kararlarını GEÇERSİZ KILAR.** Eray'ın net modeli: `blocked` bir lane/status değil; bağımlılıktan **türetilen** (stored değil) bir kilit bayrağıdır ve item'ın asıl status'ünün üstüne biner.

**Karar (AskUserQuestion — Eray "Tamamen kaldır" seçti):** `blocked` durumunu enum + DB CHECK + lifecycle'dan KOMPLE çıkar; manuel "Mark blocked" özelliğini de kaldır. Kilidin TEK kaynağı bağımlılık-türevi.

- **Türetilen kilit tek tanım:** `server/orchestrator/build-order.ts` `isBlocked(item, byId)` — `blocked_by` dolu + en az bir blocker terminal (done/cancelled) DEĞİL → kilitli; dangling blocker = çözülmüş (kalıcı kilit yok). `selectBuildableItems` zaten aynı `blockedBy`+`TERMINAL` primitifini kullanıyordu → scheduler ile kilit-bayrağı **aynı doğruyu** paylaşır, asla çelişmez. UI aynası `src/lib/board-drawer.ts` `isLocked`/`lockedBlockers` (yüklü kartlar üzerinden; bilinmeyen blocker = çözülmüş, paginasyon güvenli; otorite sunucu).
- **Auto-block kaldırıldı (kök fix):** Hata scheduler'da değil **ingest**'teydi — `backlog-ingest.ts` A5 döngüsü item'ı `blocked` status'üne çekiyordu. Artık status'e DOKUNMUYOR; kilitli item `to_do`'da KALIR. `backlog.auto_blocked` audit'i + closure'daki `clearBlockedDependents` (auto-unblock yazımı) gitti — dependents türev olarak yazma OLMADAN açılır.
- **Manuel block özelliği komple silindi:** `block.ts` (`blockItem` — run iptali + status flip) + `blocker-clear.ts` + route `TRANSITION_ACTIONS`'tan `block`/`unblock` + lifecycle `block`/`unblock` transition'ları + `cancel.from`'daki `blocked`. (Madde 5'in `whoseTurn(blocked)→[+prime]` ve Madde 9'un `blockItem`'i bu kararla iptal.)
- **Migration 011** (tablo rebuild, 002 deseni): CHECK'ten `blocked` çıkar + mevcut `blocked` satırları → `to_do` (frontmatter.`blocked_by` korunur, türev kilidi sürer). Tüm sütunlar (review_gates/model/preview_url) taşınır.
- **Board:** ayrı "Blocked" sütunu YOK (5 sütun). Kilitli item kendi status sütununda (genelde To Do) **🔒 rozet + soluk (opacity 0.6)**; drawer banner "🔒 Locked · waiting on <ids>". `doctor` "N locked item(s)" (türev sayım), `agents-panel` kilitli lead → 'blocked' tone (rozet anlamı korunur, kaynak türev).
- **Gerçek-LLM gereksiz — saf mekanik:** Bu değişiklik LLM yargısı içermez (status/scheduling). Deterministik uçtan-uca harness (gerçek DB+ingest+scheduler+closure) ile kanıtlandı: T01→T02→T03 zinciri ingest sonrası 3'ü de `to_do` + T02/T03 🔒 türev-kilitli + buildable=[T01]; T01 done → T02 `to_do` kalır ama kilit açılır (yazma yok) buildable=[T02]; sırayla aktı. **1162 test yeşil** (block/blocker-clear testleri silindi, isBlocked + migration-011 eklendi).

### 7.17 KRİTİK UAT #10 — gate-fail sonsuz bounce döngüsü → 3. fail'de +prime escalation (2026-06-09)

Build fazı canlı koşusunda `design_review` bir item'ı **8 kez** fail etti → her seferinde yeniden kodlanıp aynı şekilde fail oldu → sonsuz bounce churn (17 koşu, 15+ dk ilerleme yok, epic kapanmadı). Gate-fail bounce'ında max-retry/escalation yoktu — kör döngü. **Karar (Eray): N. fail'de otomatik bounce'ı kes, +prime'a gerekçeyle tırmandır.**

- **Sayaç = türev (yeni tablo YOK):** `gate-escalation.ts` `gateFailCount(repos, itemId, gate)` — `gate_runs`'taki `fail` satırlarını item+gate başına sayar, **son reset baseline'ından** sonra. Baseline timestamp DEĞİL **monotonik `gate_runs.id`** (reset ile aynı-ms fail çakışmasını önler — ilk denemede `created_at > resetTs` ms granülaritesinden patladı, id'ye geçildi). Eşik `MAX_GATE_FAILS = 3` = 2 retry sonrası 3. fail.
- **Escalation noktası = `runTestCycle`:** fail varsa, eşiği aşan gate için `escalateGate` Inbox'a (`pending_questions`, phase `gate-escalation`, `ApprovalQueue.enqueue`) +prime sorusu düşürür ve **bounce ETMEZ** — item `test`'te kalır (paused). Üst tarafta açık escalation varsa `runTestCycle` gate'leri yeniden koşmaz (`paused` outcome) → churn yok. `queue` opsiyonel: yoksa eski davranış (bounce) — geriye uyumlu, sıfır maliyet.
- **Gerekçe zorunlu:** `buildEscalationReason` soru gövdesine gate'in son fail `gate_runs.findings`'ini (designer/qa'nın somut reddi) + item'ın karşılanmamış AC'lerini koyar. "Kuru fail" değil — Eray şartı.
- **+prime cevabı = consumer (staging deseni):** `consumeGateEscalation` (approvals route'ta `phase==='gate-escalation'` dispatch). `approve` → `transitionStatus('review')` override-pass · `revise: <talimat>` → directive `frontmatter.revision_directive` + item_comment + `resetGateCounter` (yeni baseline = current max gate_run id) + `transitionStatus('in_progress')` yönlü bounce · `drop` → `transitionStatus('cancelled')` (epic'i tıkamaz). Lifecycle yerine repo-direct transition (consumer deseni, staging-approval gibi).
- **UI:** Inbox `PrimeRow` `gate-escalation` için 3 buton (Approve/Revise/Drop) + Revise talimat input'u; `buildEscalationAnswer(kind, directive)` saf yardımcı (`approve`/`drop` exact, diğeri `revise: <text>`), testli. Diğer sorular binary kalır.
- **Kanıt:** deterministik uçtan-uca harness (gerçek `runTestCycle`+`ApprovalQueue`+consumer) — 1./2. fail bounce, 3. escalated+paused, Inbox tek soru gerçek findings+unmet AC ile, 4. pass paused (gate koşmaz); approve→review, revise→in_progress+sayaç 0+directive, drop→cancelled. Escalation `gate_runs` okur → mock-vs-gerçek-LLM aynı (gerçek +designer 8× fail'i bu bug'ı zaten canlı gösterdi). **1178 test yeşil.**

### 7.18 UAT #10 — çıplak `kortext start` GUI-first: her zaman sihirbaz + mevcut projeler listesi (2026-06-09)

Mevcut proje(ler) varken çıplak `kortext start` terminalde metin liste basıp "kortext start <slug> / --new kullan" diyordu — kullanıcı terminale geri dönüp komut yazmak zorundaydı. Eray: **GUI-first** — `start` her durumda sihirbazı açsın, mevcut projeler sihirbazın içinde listelensin (seç→başlat / yeni proje→onboarding).

- **bin dispatch tek satır kaymadı, davranış değişti:** `bin/kortext.ts` `start` → `startProject` `action: 'list'` dalında, terminal listesi yazmak yerine `launchWizardAndOpen()` (mevcut `'onboard'` dalının zaten çağırdığı fonksiyon). `--no-open`/`KORTEXT_NO_OPEN=1` (CI/headless) ise eski terminal listesi fallback olarak basılır — script'ler bozulmaz.
- **Yeni route `server/routes/projects.ts` (sihirbaz veri yolu):** `GET /api/projects` global registry'yi `serializeProjects` ile listeler (saf fonksiyon, isimle sıralı, `http://localhost:<port>/` url'i türetir — testli). `POST /api/projects/:slug/start` → enjekte `startProject(slug)` → `{ok, handoffUrl}` + `onHandoff()`; bilinmeyen slug 404, start fail 502. Deps enjekte (`readRegistry`/`startProject`/`onHandoff`) → route saf test edilir (express+listen+fetch deseni, drive-route gibi).
- **index.ts wiring:** `readRegistry(defaultRegistryDir())` + `startProject(slug, {packageRoot, cwd})` + `onHandoff: scheduleBootstrapSelfExit({isBootstrap})` — blueprint route'un createProject/handoff deseninin aynısı. Bootstrap daemon global registry'yi okuduğu için tüm projeleri görür.
- **Wizard UI (`OnboardingScreen`):** kart başında "Open an existing project" bölümü — `/api/projects`'ten çeker; satır tıkla → `POST .../start` → `window.location.href = handoffUrl` (yeni-proje submit'inin kullandığı aynı handoff redirect'i). Altında "or create a new project" ayracı. `ExistingProject` tipi `api-types.ts`'te (server `ProjectSummary` aynası). Projeler yoksa bölüm hiç render olmaz (eski tek-form görünümü).
- **Kanıt:** 6 route testi (serialize saf + GET + POST start + 404 + 502) + uçtan-uca harness (gerçek router + örnek registry: 2 proje listelenir, tıkla→daemon başlar+handoff+wizard self-exit, ghost→404). **1184 test yeşil**, typecheck+build temiz. Push yok (Eray "push" diyene dek).

---

## Bölüm 15 — Token/maliyet optimizasyonu kararları (UAT #10f+#10g, 2026-06-09)

**Status:** Koda döküldü + push edildi (`0156412`). 1235 test yeşil. Bağlam: UAT #10'da kotalar çok hızlı bitti — codex oturum logları **25M input / 0.3M output** gösterdi; design_review 8× bounce'ta her retry tam bağlamı yeniden yolladı. (Not: UAT #10a-e turlarının ayrıntılı tarihçesi TODO.md'nin ✅ ÇÖZÜLDÜ bölümlerinde + HANDOVER'da; bu bölüm yalnız token/maliyet kararlarını kaydeder.)

### 15.1 "Önce ölç, sonra kıs" (Eray kararı, AskUserQuestion)
4 aday değerlendirildi (cache, input kırpma, görünürlük, ince retry). Eray'ın seçimi: önce **görünürlük** (hangi item/gate ne kadar yakıyor — GUI'de), sonra **akıllı retry** (gerçek tasarruf). Gerekçe: ölçüm olmadan hiçbir optimizasyonun işe yaradığı kanıtlanamaz; ikisi de verimi düşürmez.

### 15.2 Usage telemetrisi: nullable JSON kolonu + tek-kaynak şema
Per-step token/maliyet `run_steps.usage_metadata` + `gate_runs.usage_metadata`'da (migration 012, nullable TEXT/JSON — eski satırlar NULL, kırılma yok; şekil migrationsız büyüyebilir). `UsageMetadataSchema` (schemas.ts) tek kaynak; engine re-export, frontend elle mirror. Alternatif (ayrı usage tablosu) reddedildi — satır zaten adım/gate'e 1:1, JOIN yükü gereksiz.

### 15.3 Executor'lar arası normalizasyon: claude konvansiyonu
Üç CLI üç farklı semantik veriyor; rollup'ın toplanabilir olması için hepsi claude konvansiyonuna çevrilir: `input_tokens` = **cached-HARİÇ** input, `cache_read_input_tokens` ayrı. Codex `input_tokens` cached'i içerir (OpenAI konvansiyonu) → çıkarılır; gemini `tokens.input` zaten `prompt - cached` → doğrudan alınır; gemini `output` = candidates + thoughts. Yalnız claude $ maliyeti verir; codex/gemini'de `total_cost_usd` boş kalır.

### 15.4 Usage kaynağı: log kazıma DEĞİL, stdout
TODO'daki "kendi loglarından kazıma" fikri gereksiz çıktı: `codex exec --json` usage'ı stdout'a basıyor (`turn.completed` — canlı probe ile doğrulandı), gemini `--output-format json` tek zarfta `stats` veriyor (resmi doc + kaynak; binary kurulu olmadığından canlı teyit ilk gerçek koşuya kaldı — parser toleranslı, beklenmedik şekilde adımı asla fail ettirmez). Oturum-dosyası korelasyonu (cwd+mtime; paralel gate'lerde belirsiz) bu sayede hiç kurulmadı.

### 15.5 Akıllı retry: bounce bulguları tek-atış directive olarak taşır
Gate-fail bounce'ı fail eden gate'lerin bulgularını `frontmatter.revision_directive`'e yazar; `runItem` dev-cycle'a `reviseFeedback` olarak geçirir ve koşudan sonra TEMİZLER (tek-atış — bayat bulgu sonraki turu yönlendirmesin). Adım-içi revise nedeni (mid-run gate reddi) directive'den ÖNCELİKLİ. Yan kazanç: +prime escalation-revise'ın yazdığı ama hiçbir yerin okumadığı `revision_directive` canlandı. "Diff de ekle" fikri ertelendi — bulgular küçük ve hedefli, diff büyük ve çoğu zaman gereksiz.

### 15.6 Cache bayrağı diye bir şey yok (araştırma bulgusu)
Codex/gemini'de açılacak bir cache bayrağı YOK — cache sağlayıcı tarafında otomatik ve zaten çalışıyor (kanıt: codex oturum logunda 537K/619K cached ≈ %87; claude probe'unda cache_read 11908). Asıl kaldıraç prefix-stable prompt sırasıydı; o Faz 12.7'de yapılmıştı. Yakalanan `cache_read_input_tokens` cache verimini artık GUI'de kanıtlıyor. Gemini notu: cached sayacı yalnız API-key kullanıcılarında görünür (OAuth'ta görünmez).

### 15.7 agy kota-uyarısı: console satırı değil, audit olayı
agy token vermiyor (kota-bazlı) → en azından kota tükenmesi GÖRÜNÜR olmalı. `FallbackExecutor.onFallover` kancası + `falloverAuditSink`: recoverable fallover `executor.fallover` audit olayı olarak Activity feed'e düşer ("⚠ antigravity hit a quota/rate limit — fell over to claude"). Best-effort — audit yazımı asla zinciri kıramaz. Alternatif (UsageMetadata'ya warning alanı) reddedildi: uyarı bir olaydır, telemetri değil.

### 15.8 Input kırpma: içerik değil, yapısal israf
Tek gerçek mühendislik israfı bulundu ve kesildi: step'in input'u olan `rules/*.md` hem system prompt'a enjekte ediliyor hem Inputs listesinde duruyordu → kontrat "input'ları oku" dediği için ajan aynı içeriği iki kez okuyordu. `filterInjectedRuleInputs` enjeksiyon koşuluyla birebir parite kurar (var + okunabilir + boş değil). Kontrat 3. kural "Read each Input file" → "relevant to the Task" (user-prompt'taki "if relevant" diliyle tutarlı). **İçerik kalibrasyonu bilinçli ERTELENDİ:** behavior.md 16 KB ama cache'li; kuralları budamak davranış riski taşır (hangi kural hangi UAT fix'ine bağlı belirsiz) → ayrı tur, Eray onayıyla.

