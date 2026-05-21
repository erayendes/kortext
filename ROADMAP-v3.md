# Kortext v3.0 — Yeniden Mimari Yol Haritası

> **Durum:** Onaylanmış vizyon — 2026-05-21
> **Önceki sürüm:** v2.2.3 (markdown + Python + Bash framework)
> **Hedef sürüm:** v3.0 (TypeScript runtime + SQLite + React dashboard + worker pool)

---

## Hedef

Kortext'i **markdown methodology framework**'ten **tam otonom AI ajan runtime'ına** dönüştürmek. Mevcut metodolojinin gücünü (14 persona, 12 workflow, blueprint-driven lifecycle) korurken AgentFlow seviyesinde teknik altyapı (worker pool, git worktree, MCP, dashboard) ekle.

### Onaylanmış Tasarım Kararları (2026-05-21)

| Karar | Seçim |
|---|---|
| **Veri katmanı** | Hibrit: insan kaynakları (blueprint, ADR, referanslar, persona/workflow tanımları) **markdown**; durum verisi (backlog, context, log, kilit, sorular) **SQLite** |
| **Otonomi modeli** | Tam otonom + onay kuyruğu. Blueprint approved → zincir kendi yürür. Kritik gate'lerde dashboard'da onay sorusu + Slack/Telegram bildirim. |
| **Dil/Stack** | TypeScript (Node 22+, Express 5, better-sqlite3, Zod, React 19, Tailwind v4, Vite 7, Vitest) |
| **Mevcut Python/Bash** | Tümü TypeScript'e port — iki dil bakım yükü kabul edilmedi |
| **Frontend** | Sıfırdan tasarım; claude-design veya benzeri skill ile |

---

## Kortext v2'den Korunan Çekirdek (Asla atılmaz, sadece yeni stack'e taşınır)

1. **14 persona sistemi** — `agents/*.md` dosyaları markdown kalır; runtime persona registry SQLite'tan bind eder.
2. **12 workflow pipeline** — `workflows/*.md` dosyaları markdown kalır; pipeline engine bunları parse eder ve yürütür.
3. **+prime karar zinciri** — `pending_questions` SQLite tablosu; dashboard'da onay kuyruğu.
4. **Blueprint-driven lifecycle** — blueprint `status: approved` olmadan pipeline tetiklenmez.
5. **Persona handover protokolü** — `handovers` tablosu + context aktarımı.
6. **ADR (decisions log)** — markdown kalır; SQLite'ta index.
7. **Lifecycle gate'leri** — engine enforce eder (status approved, blueprint hash kontrolü vs.).

---

## Fazlar

> Tahmini efor brüt — paralelleştirme ve ajan üretkenliğine göre değişir.
> Her faz sonunda Vitest + integration test + git tag.

### Faz 0 — Stack İskeleti (1-2 gün) ✅ `v3.0.0-alpha.0`

**Amaç:** TypeScript monorepo iskeleti, build pipeline, dev experience.

- [x] `package.json` v3 sürüm yapısı: workspaces yok, tek paket
- [x] Klasör yapısı:
  ```
  kortext/
  ├── src/                      # React frontend (Vite)
  ├── server/                   # Express backend + engine
  │   ├── config/
  │   ├── db/                   # SQLite schema, migrations
  │   ├── engine/               # Pipeline runner, worker pool, worktree
  │   ├── executor/             # Claude/Codex/Gemini CLI adapters
  │   ├── routes/               # REST API
  │   ├── services/             # Business logic
  │   ├── notifications/        # Slack/Telegram
  │   └── safety/               # Output guards
  ├── mcp/                      # MCP server (stdio + SSE)
  ├── bin/                      # CLI entry
  ├── workspace/                # KORUNDU — user-facing markdown
  │   ├── references/
  │   │   └── blueprint.md
  │   └── (memory/ → SQLite'a göç ediyor)
  ├── agents/                   # KORUNDU — 14 persona markdown
  ├── workflows/                # KORUNDU — 12 workflow markdown
  ├── rules/                    # KORUNDU — behavior + commands
  ├── tests/
  └── docs/
  ```
- [x] `tsconfig.json`, `tsconfig.build.json`, `tsconfig.server.json`
- [x] Vite + React 19 + Tailwind v4 setup
- [x] Express 5 + better-sqlite3 + Zod setup
- [x] Vitest setup
- [x] ESLint + Prettier
- [x] `.env.example`: KORTEXT_PORT (PORT yerine — preview tool çakışması nedeniyle), KORTEXT_DB_PATH, SLACK_*, TELEGRAM_*
- [x] Eski Python/Bash kodları `legacy/` klasörüne taşındı (silmedi, `git mv` ile tarih korundu)

### Faz 1 — SQLite Şema + Veri Modeli (2-3 gün) ✅ `v3.0.0-alpha.1`

**Amaç:** Tüm durum verisinin SQLite şeması; markdown ↔ SQLite senkronizasyon stratejisi.

**Tablolar:**
- `backlog_items` — Epic/Task/Bug/Debt/Spike/Hotfix; status, owner, parent_id, version, frontmatter JSON
- `contexts` — Aktif ajan oturumları (agent-active.md karşılığı)
- `locks` — Dosya/path kilitleri (`auto-locker.sh` yerine, ama worktree ile büyük ölçüde gereksiz olacak)
- `handovers` — Persona devir kayıtları
- `sessions` — `kortext-session-start.py` runtime oturumları
- `decisions_index` — `decisions.md` markdown'larının index'i (tam metin markdown'da kalır)
- `pending_questions` — +prime onay kuyruğu
- `audit_log` — Tüm aksiyon log'u (`audit-logger.sh` karşılığı)
- `runs` — Pipeline çalıştırmaları, durum, başlangıç/bitiş zamanı
- `run_steps` — Her pipeline adımının yürütme kaydı
- `runtime_artifacts` — Worktree yolları, log dosyaları, diff snapshot'ları
- `notifications_sent` — Bildirim deduplication
- `secrets_scan_results` — `secret-scanner.sh` bulguları

**Markdown ↔ SQLite Sync Stratejisi:**
- **Yalnız okumalık markdown (insan kaynak):** blueprint, references/*, agents/*.md, workflows/*.md, rules/*.md — engine bunları parse eder, SQLite'a yazmaz.
- **Üretilen markdown (artefakt):** decisions.md, learned.md, handover.md, ADR'ler — engine üretir, SQLite'a index'ler, dosyayı `workspace/memory/`'de tutar (insan history için).
- **Tamamen SQLite (eski markdown):** backlog item'ları, context, log, lock — markdown karşılığı YOK.

**Migrasyon scripti:** `bin/migrate-legacy-backlog.ts` — `workspace/memory/backlog/*.md` → SQLite `backlog_items` (idempotent, `--dry-run` destekli; mevcut depo sadece template içerdiğinden boş insert).

### Faz 2 — Pipeline Engine + Worker Pool + Worktree Manager (5-7 gün)

**Amaç:** Workflow markdown'larını yürütebilen otonom engine; her görev kendi git worktree'sinde.

**Faz 2.A — Engine Çekirdeği ✅ `v3.0.0-alpha.2`**
- [x] **Workflow parser**: `workflows/*.md` → typed WorkflowDefinition (steps, gates, startCommand, nextWorkflowId)
- [x] **DAG builder**: inputs/outputs üzerinden bağımlılık çıkarımı, Kahn-style cycle detection, `readyKeys(done)`
- [x] **Worker pool**: configurable concurrency (default 3), "pull ready" scheduler, AbortController ile first-failure short-circuit, kalan adımlar `skipped`'a düşer, audit log boyunca event'ler
- [x] **Executor interface + Mock executor**: Faz 2.B adapter'ları aynı sözleşmeye uyacak; mock test instrumentation (maxConcurrent, startedOrder)

**Faz 2.B — Yan Sistemler ✅ `v3.0.0-alpha.3`**
- [x] **Worktree manager** (`server/engine/worktree.ts`): `git worktree add .kortext/worktrees/run-<id>`, success → merge (opt) + remove, failure → quarantine altında `run-<id>-<timestamp>/`, maxConcurrent limit, branch postmortem korunur, tüm git çağrıları shell-free
- [x] **CLI executors** (`server/engine/executors/`): `claude-cli-executor.ts`, `codex-cli-executor.ts`, `gemini-cli-executor.ts` — 3 ayrı tam dosya, ortak shell-free spawn yardımcısı `cli-spawn.ts`. Persona prompt'u stdin'den geçer (argv'de değil), AbortSignal → SIGTERM → 5s sonra SIGKILL, log dosyası yazılır, declared `outputs:` varlık doğrulaması yapılır
- [x] **Gate enforcer** (`server/engine/gate-enforcer.ts`): `graph.externalInputs` frontmatter `status: approved` zorunlu; opsiyonel `previousWorkflowId` → en az 1 başarılı run varlığı; structured `GateFailure[]` döner
- [x] **Output safety** (`server/safety/`):
  - [x] `secret-scanner.ts` — 4 pattern grubu (quoted-assignment, env-assignment, service-token, auth-header), exclusion'lar (process.env, YOUR_, PLACEHOLDER, .env), masked snippet, `scanForRun` + `scanForStep` API'ları
  - [x] `harmful-output-filter.ts` — v3.0 placeholder (banned-phrases configurable); gerçek implement v3.1+
- [x] **Worker pool entegrasyonu**: `runWorkflow(graph, executor, repos, { safety: { secretScanner, harmfulFilter } })` — her başarılı step'in `outputs:` dosyaları + log'u taranır, finding → step `failed`, pipeline kısa-devre durur

### Faz 3 — Otonom Orkestratör ✅

**Amaç:** "Komut vermek istemiyorum" — sistem kendi tetiklesin.

- [x] **Pipeline zincirleme** (`server/orchestrator/pipeline-chainer.ts`, 6 test): `nextWorkflowId` → otomatik run
- [x] **Blueprint watcher** (`server/orchestrator/blueprint-watcher.ts`, 7 test): `status: approved` transition'ı callback fırlat
- [x] **Onay kuyruğu + REST** (`server/orchestrator/approval-queue.ts` + `server/routes/approvals.ts`, 8 test): `pending_questions` lifecycle + 3 endpoint
- [x] **Bildirim katmanı** (`server/notifications/{dispatcher,slack,telegram}.ts`, 11 test): dedup'lu, çok-kanallı
- [x] **CLI orkestratör entry** (`server/cli/commands.ts` + `bin/kortext.ts`, 5 test): start / approve / status
- [ ] **Schedule + cron** (Faz 4'e ertelendi)
- [ ] **Resume semantics** (Faz 4'e ertelendi — orchestrator wiring ile birlikte)

### Faz 4 — Persona + Workflow Engine TS Portu (3-4 gün)

**Amaç:** Mevcut 14 persona ve 12 workflow markdown'unu engine'e bağla.

- [ ] **Persona registry**: `agents/*.md` parse → in-memory registry. Her persona için:
  - System prompt
  - Yetkili olduğu komutlar
  - Eskalasyon kuralları
  - Devir protokolü
- [ ] **Workflow registry**: `workflows/*.md` parse → DAG
- [ ] **Handover engine**: `kortext-handover.py` TS portu, `handovers` tablosu güncellemesi, context dosyası taşıması
- [ ] **Item lifecycle**: `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-backlog-add.py` TS portu
- [ ] **Consistency check**: `kortext-consistency-check.py`, `kortext-context-check.py`, `kortext-backlog-health.py` TS portu
- [ ] **Git commit integration**: Her durum değişikliğinde otomatik `chore(kortext): <action> <item-id>` commit (v2 planındaki Faz 2.4)

### Faz 5 — MCP Server (2 gün)

**Amaç:** Tüm runtime operasyonlarını MCP üzerinden programatik erişilebilir kıl.

**MCP Araçları:**
| Araç | İşlev |
|---|---|
| `list_pipelines` | Aktif/tamamlanmış pipeline listesi |
| `get_pipeline` | Detay |
| `start_pipeline` | Pipeline başlat (`!start <name>` karşılığı) |
| `list_backlog` | Backlog item listesi |
| `add_backlog_item` | Yeni item |
| `transition_item` | Status değişimi |
| `get_context` | Aktif ajan context'i |
| `handover` | Devir |
| `list_pending_questions` | Onay kuyruğu |
| `respond_to_question` | Onay/red |
| `get_logs` | Audit log |
| `read_blueprint` | Blueprint markdown |
| `approve_blueprint` | Blueprint onayı |
| `list_personas` | 14 persona |
| `list_workflows` | 12 workflow |
| `get_runtime_status` | Worker pool durumu |

- [ ] `@modelcontextprotocol/sdk` ile stdio + SSE transport
- [ ] Zod schema her tool için
- [ ] `claude mcp add kortext -- kortext mcp` komutu çalışsın

### Faz 6 — React Dashboard (5-7 gün)

**Amaç:** Eray için canlı kontrol paneli. Sıfırdan tasarım.

**Tasarım aşaması (önce mockup, sonra implement):**
- [ ] claude-design veya feature-dev:code-architect ile dashboard mockup'ları üret
- [ ] Eray onayı al
- [ ] Implement

**Görünümler:**
- [ ] **Ana sayfa**: Aktif pipeline'lar, son aktiviteler, onay kuyruğu sayısı, sistem sağlığı
- [ ] **Pipeline timeline**: Çalışan pipeline'lar, her birinin adımları, ETA, log akışı
- [ ] **Backlog board**: Epic/Task/Bug/Spike/Hotfix kanban; sürükle-bırak status değişimi
- [ ] **Onay kuyruğu**: +prime soruları, blueprint onayları, mimari kararlar
- [ ] **Persona panosu**: 14 ajanın o anki durumu (idle, working, blocked)
- [ ] **Log + diff viewer**: Her run için stdout, stderr, git diff
- [ ] **Blueprint editor**: Markdown editor, `status: approved` toggle
- [ ] **ADR viewer**: Karar geçmişi
- [ ] **Settings**: CLI yolları, notification config, concurrency, KORTEXT_DB_PATH
- [ ] **Audit log**: Filtrelenebilir aksiyon log'u

**Teknik:**
- [ ] React 19 + Tailwind v4
- [ ] WebSocket veya SSE ile canlı güncelleme (REST polling fallback)
- [ ] Lucide ikon seti (mevcut mockup'a uyum)
- [ ] Dark mode default (mevcut UI yönü)

### Faz 7 — CLI + Bin (1-2 gün)

**Amaç:** `kortext` komutu kullanıcı dostu.

- [ ] `kortext init` — projeye yerleştir (`.kortext/` + AGENTS.md + DB)
- [ ] `kortext start` — backend + dashboard başlat (default port 3200)
- [ ] `kortext mcp` — MCP server stdio
- [ ] `kortext status` — runtime durumu
- [ ] `kortext logs` — son log'lar
- [ ] `kortext doctor` — diagnostik (CLI'ler kurulu mu, DB erişilebilir mi, git OK mı)
- [ ] `kortext --help`
- [ ] `npx kortext` çalışsın (one-shot)

### Faz 8 — Test + CI (2-3 gün)

- [ ] **Vitest unit**: Engine, executor, parser, services
- [ ] **Integration**: SQLite operasyonları, worker pool concurrency, worktree lifecycle
- [ ] **E2E senaryosu**:
  1. `kortext init` boş klasörde
  2. `blueprint.md` örnek içerikle `status: approved`
  3. Sistem otomatik analysis → planning → development pipeline'larını sürsün
  4. Onay kuyruğunda soru oluştur, mock yanıt ver
  5. Backlog item'ları üret, transition et
  6. Her aşamada git commit doğrula
- [ ] **GitHub Actions CI**: lint + typecheck + test her PR'da
- [ ] **Smoke test**: `npx kortext --version`

### Faz 9 — Yayın + Dokümantasyon (1-2 gün)

- [ ] **CHANGELOG**: v3.0.0 — breaking change notu, migration guide linki
- [ ] **MIGRATION-v2-to-v3.md**: Eski markdown backlog'u nasıl SQLite'a aktarılır; legacy/ klasör politikası
- [ ] **README.md**: Yeni mimari, yeni quick start
- [ ] **USER-GUIDE.md**: Tam yenileme (otonom mod, dashboard'da nasıl çalışılır, blueprint nasıl onaylanır)
- [ ] **docs/architecture.md**: SQLite şema, engine, worker pool, MCP, dashboard mimari diyagramları
- [ ] **npm publish**: v3.0.0
- [ ] **GitHub release**: tag + binary assets

---

## Toplam Tahmini Efor

| Faz | Min | Max |
|---|---|---|
| 0 — Stack iskeleti | 1g | 2g |
| 1 — SQLite şema | 2g | 3g |
| 2 — Engine + worker pool + worktree | 5g | 7g |
| 3 — Otonom orkestratör | 3g | 4g |
| 4 — Persona + workflow TS portu | 3g | 4g |
| 5 — MCP server | 2g | 2g |
| 6 — React dashboard | 5g | 7g |
| 7 — CLI + bin | 1g | 2g |
| 8 — Test + CI | 2g | 3g |
| 9 — Yayın + docs | 1g | 2g |
| **Toplam** | **25g** | **36g** |

> Ajan üretkenliğine göre takvim — paralel ajanlar Faz 1+4 ve Faz 6'yı eş zamanlı yürütebilir, kritik yol Faz 0→2→3→7→8.

---

## Plan Dışı (Bilinçli Hariç Tutuldu)

- **Kullanıcı yönetimi / auth** — Tek kullanıcı local app, multi-tenant değil
- **Bulut deploy** — Local-first; bulut sürümü v3.1+ konusu
- **Web hook tabanlı CI/CD entegrasyonu** — GitHub Actions yeterli
- **Visual workflow editor** — Workflow'lar markdown'da tanımlı kalacak; UI'da read-only görüntülenecek (v3.1+ düzenleme)
- **Plugin sistemi** — v4 konusu

---

## Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| Worker pool concurrency'de race condition | Yüksek | Her görev ayrı worktree; SQLite WAL mode; integration test ağırlığı |
| MCP SDK API değişiklikleri | Orta | Sürüm pinleme; AgentFlow MCP server referans implementasyon |
| TypeScript port'ta davranış kayması | Orta | Mevcut Python script'leri için characterization test → TS port testle eşle |
| Otonom mod yanlış karar verir | Yüksek | Onay kuyruğu zorunlu kritik gate'lerde; rollback pipeline'ı her zaman erişilebilir |
| Dashboard UX yanlış yön | Orta | Önce mockup, Eray onayı, sonra implement |
| Worktree disk yer kullanımı | Düşük | Pipeline başarısı sonrası worktree silme; max worktree limit |

---

## Sıradaki Adım

Faz 0'a başlanır. İlk somut adım:
1. `legacy/` klasörü oluştur, mevcut Python/Bash dosyalarını içine taşı (silmeden, referans için)
2. `package.json`'u TypeScript stack'i için yeniden yaz
3. Klasör iskeletini kur
4. Hello-world Express + Vite çalıştır
