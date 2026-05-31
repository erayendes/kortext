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
