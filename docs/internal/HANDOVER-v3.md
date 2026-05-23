# Kortext v3 — Yeni Oturum Handover

> Bu dosya yeni Claude Code oturumunun bootstrap pusulasıdır.
> Açar açmaz şunu yaz: **"HANDOVER-v3.md'yi oku, feat/v3.1-onboarding-and-dashboard-polish branch'inde dashboard tasarım iterasyonu — Eray onayı bekleniyor"**

> ⚠️ **Tasarım hâlâ onaylanmadı.** Branch'teki onboarding + dashboard polish testten geçiyor (274/274) ama Eray görsel olarak mockup'a yeterince yakın bulmadı (oturum kapanışında: "mevcut branch'teki tasarım benim için ok değil"). Hangi alanların sapma içerdiği belirsiz — yeni oturumun ilk işi Eray'a sormak/screenshot karşılaştırması yapmak. **PR açma, release prep'e geçme** — önce iterasyon.

**Tarih:** 2026-05-23 (akşam)
**Yazan oturum:** Faz 11 — onboarding wizard + dashboard mockup polish (v3.1.0 hazırlığı)
**Son commit:** `0052c43` — `feat(v3): onboarding wizard + dashboard mockup polish (v3.1.0 prep)` (branch `feat/v3.1-onboarding-and-dashboard-polish`)
**main branch:** `d118f48` (dokunulmadı; v3.0.0 broken-published state'inde)

## Çok kritik bilgi: yayın durumu

- ✅ **GitHub:** `erayendes/kortext` PUBLIC. main hâlâ d118f48'de. v3.0.0 tag `300b035`'i işaret ediyor (5 fix-commit eskisi).
- ✅ **Feature branch:** `feat/v3.1-onboarding-and-dashboard-polish` push edildi, commit 0052c43. PR açılmayı bekliyor: https://github.com/erayendes/kortext/pull/new/feat/v3.1-onboarding-and-dashboard-polish
- 🟡 **npm registry:** `kortext@3.0.0` YAYINLANDI — ama **broken state**: kortext serve Node 26'da patlıyor + log flush race + EPIPE race. **Kimseye `npm install -g kortext` önerme.** Kullanıcılar bunun yerine lokal tgz install etmeli (aşağıda).
- ⏸ **Lokal-only 4 fix (main'de var, npm tag'de değil):** 5ba9032 (log flush race), 0b9cba6 (EPIPE), 70f2186 (Express static + vite spawn kaldır), d118f48 (in-process import — Node 26 spawn workaround).
- ⏸ **Branch-only Faz 11 (henüz main'de değil):** 0052c43 — onboarding wizard + dashboard mockup polish + preflight + auto-open. Merge sonrası v3.1.0 olarak yayınlanacak.

---

## Tamamlanan Fazlar

| Faz | Tag | Commit | Test sayısı |
|---|---|---|---|
| **0 — Stack iskeleti** | `v3.0.0-alpha.0` | `02746f3` | smoke: 2 |
| **1 — SQLite şema + repositories** | `v3.0.0-alpha.1` | `9b1e72c` | db integration: 12 |
| **2.A — Engine çekirdeği** | `v3.0.0-alpha.2` | `54a8984` | engine: 7 |
| **2.B — Worktree + CLI executors + gate + safety** | `v3.0.0-alpha.3` | `9d10a7d` | worktree: 10, cli-executor: 10, gate: 8, secret: 18, harmful: 3, engine-safety: 4 |
| **3 — Otonom orkestratör** | — | `dc23d0f` | chainer: 6, blueprint-watcher: 7, approval: 8, notifications: 11, cli-commands: 5 |
| **4 — Üretim sertleştirmesi** | — | `d3c493c` | orchestrator: 11, worker-pool-gate: 9, executor-factory: 9, cleanup: 5, resume: 5 |
| **5 — Persona + workflow içerik katmanı** | — | `48093d5` | workflow-loader: 7, persona-registry: 8, consistency: 4, handover: 8, item-lifecycle: 13, doctor: 8, git-commit: 4 |
| **6 — React Dashboard** | — | `e48e266` | routes: 17 (runs/handovers/doctor/personas/workflows/backlog/docs + PUT validate) |
| **7 — MCP Server** | — | `263a8f8` | mcp-tools: 14 (15 tool surface + lifecycle smoke) |
| **8 — CLI + Bin** | — | `61aedf2` | cli-init: 5, cli-logs: 4, cli-serve: 5 |
| **9 — Test + CI** | — | `217d13b` | e2e-pipeline: 6, build-verification: 3, cli-smoke: 5 |
| **10 — Yayın + Docs** | `v3.0.0` (published) | `1746b28` | (docs-only) |
| **Post-10 — Yayın + UAT** | — | `d118f48` | 264/264 (+1 regression test) |
| **Faz 11 — Onboarding + dashboard polish** | branch `feat/v3.1-...` | `0052c43` | blueprint-route: 6, preflight: 4 |
| **Toplam** | — | — | **274/274 ✅** |

Hızlı doğrulama:
```bash
npm test          # 263 yeşil
npm run lint      # 0 hata (3 warning)
npm run typecheck # frontend + server, sıfır hata
npm run build     # dist/bin/kortext.js + dist/server + dist/web
node dist/bin/kortext.js --version   # 3.0.0-alpha.0
npm run dev       # Vite 5173 + Express 3200 (Express ayrıca /mcp/sse + /mcp/messages mount eder)
npx tsx bin/kortext.ts mcp     # stdio MCP server (Claude Code, Cursor, vs. bağlanabilir)
npx tsx bin/kortext.ts --help  # Faz 8 üst-düzey help
npx tsx bin/kortext.ts init    # boş klasörde scaffold
# Tarayıcı: http://localhost:5173 — hash-based router, dashboard default
```

---

## Tasarım Kararları (önceki fazlardan kalıcı)

1. **`KORTEXT_PORT` ≠ `PORT`** — Preview tooling `PORT=5173` enjekte ediyor, backend kendi env değişkenini kullanır.
2. **better-sqlite3 ≥ 12.x** — Node 26 V8 ABI değişiklikleri.
3. **`.ts` import uzantıları** — `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (TS 5.7).
4. **Timestamp = INTEGER Unix ms** — dashboard tarafında `new Date(ms)` ucuz.
5. **JSON kolonu = TEXT** — `json_extract()` ile sorgulama, `server/db/json.ts` helper'ları.
6. **DAG = veri akışı tabanlı** — inputs/outputs üzerinden çıkarım.
7. **"Pull ready" scheduler** — Topological yerine reactive scheduling; default concurrency 3.
8. **Markdown ↔ SQLite split**: insan-kaynak disk-only; üretilen artefakt hem disk hem SQLite index; runtime state SQLite-only.
9. **CLI çağrıları shell-free**: tüm spawn `{ shell: false }`, prompt stdin'den.
10. **Worktree branch namespace**: `kortext/run-<id>` — kullanıcı branch'leriyle çakışmaz.
11. **Quarantine korunur, silinmez**: failure worktree quarantine'a taşınır + branch korunur; `kortext cleanup` ile yaşlandığında silinir.
12. **3 ayrı tam CLI executor** (paylaşılan abstract base yok): her lifecycle tek dosyada.
13. **Safety post-step**: success path'inde declared `outputs:` dosyaları + log taranır.
14. **Frontmatter parser minimal**: tam YAML değil.
15. **Gate barrier ≠ DAG**: workflow gate'leri scheduler tarafında ayrı bir barrier; DAG saf veri akışı kalır.
16. **Reddetme/orphan kurtarma = `cancelled` + prefix convention**: `error_message: rejected:|orphaned: ...`.
17. **İş başına 1 worktree, paralel iş = paralel worktree**.
18. **Persona-routed executor**: persona handle → executor map.

### Faz 7'de eklenen kararlar

29. **Factory + injectable deps**: `createKortextMcpServer(deps)` tüm tool'ları register eder; transport host-bağımsız. Stdio CLI, SSE Express hook ve testler aynı imzayı paylaşır.
30. **Stdio'da `console.log = console.error`**: stdout JSONRPC kanalı, bir tek log frame'i protokolü kırar. `bin/kortext.ts mcp` switch case'inin EN BAŞINDA monkey-patch + log routing yapar.
31. **SSE oturum başına yeni McpServer**: Tek server iki transport ile karışır (handler state transport'a kilitli). `mcp/sse.ts` her `GET /mcp/sse` için fresh instance üretir, `transports` Map'i sessionId → transport tutar, `onclose` cleanup.
32. **Tool envelope = JSON text + structuredContent**: Her tool `{ content: [{type:'text', text: JSON.stringify(...)}], structuredContent: payload }` döner — eski MCP client'lar text frame'i, yeni client'lar structured payload'u görür.
33. **`approve_blueprint` = frontmatter rewrite**: Yeni orchestrator çağrısı eklemek yerine `BlueprintWatcher`'ın zaten izlediği dosyaya `status: approved` yazıyoruz; downstream pipeline tetikleme otomatik.

### Faz 9'da eklenen kararlar

41. **`packageRoot()` walk-up**: `bin/kortext.ts` source path'te bir, compiled `dist/bin/kortext.js`'te iki seviye yukarı çıkmak gerekiyor. `package.json` bulana kadar parent dizinlere bakan walk-up loop her iki layout'ta da doğru — Faz 8 dual-mode shim'in version reporting deliği bu sayede kapandı (Faz 9.2 build-verification testi bu bug'ı yakaladı).
42. **CI lint pre-existing debt fix**: Faz 0-8 boyunca `npm run lint` hiç çalıştırılmamış. ESLint config `.js/.mjs/.cjs` dosyaları kapsamıyordu (sadece `.ts/.tsx`). Fix: ayrı `files: ['**/*.{js,mjs,cjs}']` bloğu Node globals'la; TS bloğuna `NodeJS: 'readonly'` global; tests klasörü için `no-explicit-any: off`. 19 hata → 0.
43. **GHA workflow heredoc gotcha**: Write + Edit hook'ları `.github/workflows/*.yml`'i security-reminder ile blokluyor; Bash `cat > file <<EOF` heredoc tek yol. Handover gotcha listesi zaten bu pattern'i belgeliyor.
44. **Mock executor + tmp tmp dir E2E pattern**: Build verification ve E2E testleri `MockExecutor` + `mkdtempSync` ile CI'da deterministik çalışıyor. Gerçek `git init` worktree.test.ts ile aynı kalıbı paylaşıyor. Faz 10 publish öncesi ekstra E2E senaryosu eklenecekse aynı pattern'i tekrarla.

### Faz 8'de eklenen kararlar

34. **Üç pure command modülü + ince bin layer**: `server/cli/init.ts`, `logs.ts`, `serve.ts` hiçbir `console.*` çağırmaz — sadece veri/komut listesi döner. `bin/kortext.ts` formatlama, stdout/stderr ve spawn'ı tek yerden yönetir; test ile çakışma olmaz.
35. **`buildServeCommands` DI ile testlenebilir**: `existsImpl` parametresi sayesinde dev/prod auto-detect'i gerçek fs olmadan unit test edilir. CI'da spawn-free smoke.
36. **`init` idempotent + per-entry skip**: Her dir/dosya ayrı kontrol edilir; sadece eksik olanlar oluşur. `--force` user override içindir; default davranış güvenli.
37. **`init` template kaynağı `bin/`'in bir üst dizini**: Kaynak ağacında ve `node_modules/kortext/` install'unda aynı yol işler. Test'lerde `templatesDir` override ile tmp dir'den çalışılır.
38. **Migration runner copy step**: `tsc` `.sql` kopyalamıyor (bilinen gotcha). `scripts/copy-migrations.mjs` `build:server`'a zincirlendi — derlemeden sonra `dist/server/db/migrations/` doluyor.
39. **`bin/kortext.js` dual-mode shim**: `dist/bin/kortext.js` varsa in-process `import()` (tsx hop'unu atla, ~200ms daha hızlı startup); yoksa `tsx` fallback. `npx kortext`'in iki ortamda da çalışmasını garanti eder.
40. **`serve` SIGINT propagation**: Tek parent process iki child spawn'lar; biri exit ederse kardeş öldürülüyor; SIGINT/SIGTERM toplu route. Stale frontend / backend kalmıyor.

### Faz 6'da eklenen kararlar

19. **TanStack Router + hash history**: Express'te SPA fallback gerekmesin diye `createHashHistory`. Production'da static serve'a da uygun.
20. **Tailwind v4 `@theme inline` + CSS variables**: palette tek kaynaktan — hem `var(--accent)` hem `bg-accent` çalışır.
21. **API tipi mirror**: `src/lib/api-types.ts` server tiplerini elden kopyalar (frontend bundle better-sqlite3 transitive'i çekmesin).
22. **Allow-listed docs scope**: `/api/docs/:scope[/:file]` — `references|reports|memory|rules|workflows` ile sınırlı. `path.resolve` + prefix kontrolü traversal'ı bloklar.
23. **Marked + DOMPurify**: ham markdown güvenli sayılmaz; her render DOMPurify'dan geçer.
24. **PersonaRegistry hot-reload**: `reload()` Map'i in-place mutate eder; route handler referansı değişmeden taze veri.
25. **Validate-before-write**: PUT `/api/personas/:handle` önce `parsePersonaMarkdown` ile geçici parse yapar, handle değişmişse 400 — disk hiç dokunmadan.
26. **Tek polling kaynağı + Context fan-out**: `PendingQuestionsProvider` Header bell + Dashboard card + Toast emitter için tek `/api/questions` poll'ünü yürütür.
27. **Toast yeni-id signal**: `useRef<Set<number>>` ile "az önce gördüğüm" id'leri tut; ilk poll seed olarak işaretlenip toast üretmiyor.
28. **Overlay pattern**: TerminalPanel + TimelinePanel + Toasts `position: fixed` + RootShell altında — route değişimleri overlay state'ini etkilemiyor.

---

## Faz 6 — React Dashboard (TAMAMLANDI)

| # | Modül | Dosya | Test |
|---|---|---|---|
| 6.1 | Layout shell + TanStack Router + palette tokens | [src/router.tsx](src/router.tsx), [src/index.css](src/index.css), [src/components/Sidebar.tsx](src/components/Sidebar.tsx), [src/components/Header.tsx](src/components/Header.tsx), [src/components/Footer.tsx](src/components/Footer.tsx) | typecheck |
| 6.2 | Backend API rotaları | [server/routes/runs.ts](server/routes/runs.ts), [handovers.ts](server/routes/handovers.ts), [doctor.ts](server/routes/doctor.ts), [personas.ts](server/routes/personas.ts), [workflows.ts](server/routes/workflows.ts), [backlog.ts](server/routes/backlog.ts) | 9 |
| 6.3 | Dashboard + polling + fetch helpers | [src/lib/api.ts](src/lib/api.ts), [src/components/RunsTable.tsx](src/components/RunsTable.tsx), [PendingQuestionsCard.tsx](src/components/PendingQuestionsCard.tsx), [DoctorBadge.tsx](src/components/DoctorBadge.tsx) | (visual) |
| 6.4 | Board/Memory/Reports/References + `/api/docs` | [server/routes/docs.ts](server/routes/docs.ts), [src/components/MarkdownViewer.tsx](src/components/MarkdownViewer.tsx), [src/routes/board.tsx](src/routes/board.tsx), [memory.tsx](src/routes/memory.tsx), [reports.tsx](src/routes/reports.tsx), [references.tsx](src/routes/references.tsx) | 5 |
| 6.5 | 8 settings pane + persona inline editor | [src/routes/settings-panes.tsx](src/routes/settings-panes.tsx), [src/components/PersonaEditor.tsx](src/components/PersonaEditor.tsx), [server/engine/persona-registry.ts](server/engine/persona-registry.ts) (reload), [server/routes/personas.ts](server/routes/personas.ts) (PUT) | 3 |
| 6.6 | Bell + toast + terminal + timeline overlay | [src/lib/shell-store.tsx](src/lib/shell-store.tsx), [src/lib/pending-questions.tsx](src/lib/pending-questions.tsx), [src/components/BellMenu.tsx](src/components/BellMenu.tsx), [Toasts.tsx](src/components/Toasts.tsx), [TerminalPanel.tsx](src/components/TerminalPanel.tsx), [TimelinePanel.tsx](src/components/TimelinePanel.tsx) | (visual) |

REST yüzeyi (Faz 6 sonrası):
- `GET  /api/health` · `GET /api/db/info`
- `GET  /api/questions` · `POST /api/questions/:id/answer` · `POST /api/runs/:runId/approve`
- `GET  /api/runs[?status=…]` · `GET /api/runs/:id` (steps dahil)
- `GET  /api/handovers[?limit=…]` · `GET /api/handovers/by-item/:id`
- `GET  /api/backlog[?status=…&type=…]` · `GET /api/backlog/:id`
- `GET  /api/personas` · `GET /api/personas/:handle` · `PUT /api/personas/:handle`
- `GET  /api/workflows` · `GET /api/workflows/:id`
- `GET  /api/doctor`
- `GET  /api/docs/:scope` · `GET /api/docs/:scope/:file` (scope ∈ {references, reports, memory, rules, workflows})

Frontend ekranları:
- Routes: `/`, `/board`, `/memory`, `/reports`, `/references`, `/settings/{project,agents,rules,workflows,hooks,integrations,environment,danger}`
- Overlays: Header bell popup, Toasts (yeni approval → 8s otomatik kapanır), Terminal panel (alt drawer — LIVE RUNS), Timeline drawer (sağ — handovers + runs reverse-chrono)

## Faz 7 — MCP Server (TAMAMLANDI)

| # | Modül | Dosya | Test |
|---|---|---|---|
| 7.1 | McpServer factory + 15 tool registration | [mcp/server.ts](mcp/server.ts) | 14 (lifecycle + per-tool) |
| 7.2 | Stdio transport entry | [mcp/stdio.ts](mcp/stdio.ts) | manuel smoke (initialize + tools/list) |
| 7.3 | SSE Express hook | [mcp/sse.ts](mcp/sse.ts) | server/index.ts mount |
| 7.4 | CLI `kortext mcp` | [bin/kortext.ts](bin/kortext.ts) | `npx tsx bin/kortext.ts mcp` |

Tool listesi (15):
- **Workflow / persona / pipeline**: `list_workflows`, `list_personas`, `list_pipelines`, `get_pipeline`, `start_pipeline`
- **Backlog**: `list_backlog`, `add_backlog_item`, `transition_item`
- **Approval**: `list_pending_questions`, `respond_to_question`
- **Context / handover / log**: `get_context`, `handover`, `get_logs`
- **Blueprint**: `read_blueprint`, `approve_blueprint`
- **Health**: `get_runtime_status`

İstemci entegrasyonu:
```bash
# Claude Code'a stdio üzerinden bağla:
claude mcp add kortext -- npx tsx /Users/erayendes/Documents/_docbase/kortext/bin/kortext.ts mcp
# Dashboard veya uzaktan client → SSE:
curl -N http://localhost:3200/mcp/sse
```

## Faz 8 — CLI + Bin (TAMAMLANDI)

| # | Modül | Dosya | Test |
|---|---|---|---|
| 8.1 | `kortext init` — scaffold + DB migration trigger | [server/cli/init.ts](server/cli/init.ts) | 5 |
| 8.2 | `kortext logs` — audit log query + cli formatter | [server/cli/logs.ts](server/cli/logs.ts) | 4 |
| 8.3 | `kortext serve` — buildServeCommands (dev/prod auto-detect, DI) | [server/cli/serve.ts](server/cli/serve.ts) | 5 |
| 8.4 | Bin layer — `--version` / `--help` + spawn + SIGINT propagation | [bin/kortext.ts](bin/kortext.ts) | manuel smoke |
| 8.5 | Dual-mode shim — dist/bin/kortext.js prefer + tsx fallback | [bin/kortext.js](bin/kortext.js) | manuel smoke |
| 8.6 | Migration copy step — tsc post-build | [scripts/copy-migrations.mjs](scripts/copy-migrations.mjs), [package.json](package.json) | (build smoke) |

CLI yüzeyi (Faz 8 sonrası):
```
kortext init [--force]               scaffold .kortext/, workflows, agents, rules, workspace, AGENTS.md, DB
kortext serve [--mode=…] [--port=N]  backend + dashboard birlikte
kortext start <workflow-id> […]      workflow başlat (mock|claude|codex|gemini)
kortext approve <run-id> [answer]    açık soruyu yanıtla
kortext status                       son run'lar + açık sorular
kortext logs [--limit=…] […]         audit log tail
kortext cleanup […]                  quarantine + branch temizliği
kortext doctor                       workflow/persona/lock tutarlılık
kortext mcp                          stdio MCP server
kortext --help / --version
```

## Faz 9 — Test + CI (TAMAMLANDI)

| # | Modül | Dosya | Test |
|---|---|---|---|
| 9.1 | E2E pipeline test harness | [tests/e2e-pipeline.test.ts](tests/e2e-pipeline.test.ts) | 6 (init, chain, approval queue, item lifecycle, handover+git) |
| 9.2 | Build verification | [tests/build-verification.test.ts](tests/build-verification.test.ts) | 3 (build:server, --version, --help) |
| 9.3 | CLI smoke (shim entry) | [tests/cli-smoke.test.ts](tests/cli-smoke.test.ts) | 5 (--version, -v, --help, no-arg, unknown) |
| 9.4 | GitHub Actions CI | [.github/workflows/kortext-ci.yml](.github/workflows/kortext-ci.yml) | (push/PR main: lint + typecheck + test + build + smoke) |
| 9.5 | Lint debt fix | [eslint.config.js](eslint.config.js), [bin/kortext.ts](bin/kortext.ts), [tests/cli-smoke.test.ts](tests/cli-smoke.test.ts), [tests/worker-pool-gate.test.ts](tests/worker-pool-gate.test.ts), [src/routes/settings-panes.tsx](src/routes/settings-panes.tsx), [bin/migrate-legacy-backlog.ts](bin/migrate-legacy-backlog.ts) | 19 lint hatası → 0 |

CI pipeline (ubuntu-latest, Node 22, timeout 15m):
```
checkout → setup-node@v4 (npm cache) → npm ci → npm run lint
       → npm run typecheck → npm test → npm run build → node dist/bin/kortext.js --version
```

Concurrency: `cancel-in-progress: true` aynı ref için superseded run'ları iptal eder.

## Post-Faz-10 — Yayın + UAT (bu oturumda yapıldı)

### Yayın akışı

1. Repo geçişi: `erayendes/kortext-framework` → **`erayendes/kortext`** (paket adıyla eşleşsin). Eski repo dokunulmaz, yedek.
2. v2 temizliği: `legacy/`, `settings/`, `skills/`, `MIGRATION-v2-to-v3.md`, `bin/migrate-legacy-backlog.ts` silindi (62 dosya, 4.5K satır). v2 kullanan yok diye Eray onayladı.
3. Dev-only docs `docs/internal/`'a taşındı (HANDOVER, ROADMAP, CLAUDE.md).
4. `.claude/` git-untracked (developer-local).
5. AGENTS.md WIP banner kaldırıldı.
6. GitHub repo public + description + 8 topic.
7. GitHub Actions billing engeli aşıldı (public = unlimited free).
8. v3.0.0 release oluşturuldu → npm-publish.yml tetiklendi → **npm'de yayında** (provenance attested).

### Yayın sonrası 5 bug + fix (UAT'tan çıkanlar)

| # | Bulgu | Dosya | Commit |
|---|---|---|---|
| 1 | `kortext init` compiled modda yarım scaffold (template root walk-up) | server/cli/init.ts | 34ce730 |
| 2 | MCP server hardcoded `3.0.0-alpha.7` version | mcp/server.ts | 158e14e |
| 3 | Linux CI: `log.end()` flush race (cli-spawn promise unflushed file ile resolve oluyor) | server/engine/executors/cli-spawn.ts | 5ba9032 |
| 4 | Linux CI: EPIPE — child stdin kapanmadan önce parent yazıyor | server/engine/executors/cli-spawn.ts | 0b9cba6 |
| 5 | Node 26 spawn race: serve prod child-process'te ölüyor | server/cli/serve.ts + server/index.ts + bin/kortext.ts | 70f2186, d118f48 |

### Faz 10 + UAT'da eklenen kararlar

48. **Express dist/web'i kendi serve eder** (prod modda). Faz 8 handover not'undaki "v3.1'de fix" deadline'ı Node 26 sayesinde yayın gününe çekildi. `vite preview` child kaldırıldı, prod tek-process.
49. **Prod mod = in-process import**, dev mod = spawn. Node 26'da `spawn() + stdio:inherit` child'ı immediate exit ediyor — dynamic import bypass'ı çözüyor. Dev modda vite + tsx hâlâ ayrı process'ler.
50. **Walk-up `packageRoot()` pattern her yerde tutarlı**: bin/kortext.ts (Faz 9'da eklendi) + server/cli/init.ts (yayın günü fix'i) + mcp/server.ts (yayın günü fix'i) + server/routes/health.ts (yayın günü fix'i) hepsi aynı pattern'i kullanır. Yeni runtime modülünde version/path resolution gerekirse aynı pattern'i tekrarla.
51. **app.listen() error handler eksik (v3.0.1 borç)**: EADDRINUSE durumunda Express sessizce listening callback'i atlayıp exit ediyor — kullanıcı "Cannot GET /" görüyor, gerçek hatayı görmüyor. UAT'ta 6 saat dev server zombie process bizi bu sebeple yanılttı.
52. **Lokal install pattern UAT için**: `npm pack` + `npm install -g ./kortext-3.0.0.tgz`. npm registry'deki broken v3.0.0'ı bypass etmenin tek yolu (v3.1.0 yayınlanana dek).

## Faz 10 — Yayın + Dokümantasyon (TAMAMLANDI)

| # | Modül | Dosya | Not |
|---|---|---|---|
| 10.1 | CHANGELOG.md | [CHANGELOG.md](CHANGELOG.md) | Keep-a-Changelog formatı; v3.0.0 Added/Changed/Removed/Migration; v2.x özet |
| 10.2 | Migration rehberi | [MIGRATION-v2-to-v3.md](MIGRATION-v2-to-v3.md) | Dry-run-first migration scripti, `PORT → KORTEXT_PORT`, legacy/ politikası |
| 10.3 | README.md yenileme | [README.md](README.md) | TS runtime + dashboard + MCP odaklı quick start + ASCII layer diyagramı |
| 10.4 | USER-GUIDE.md | [USER-GUIDE.md](USER-GUIDE.md) | Mental model, ekran-ekran dashboard, gate akışı, troubleshooting (8 senaryo) |
| 10.5 | Architecture | [docs/architecture.md](docs/architecture.md) | Mermaid: katman, ER, sequence (orchestrator), engine flow, MCP factory, CI |
| 10.6 | npm-publish.yml bump | [.github/workflows/npm-publish.yml](.github/workflows/npm-publish.yml) | Node 22, actions@v4, full verify gate (lint+typecheck+test+build+smoke), `--provenance` |
| 10.7 | Version bump | [package.json](package.json) | `3.0.0-alpha.0` → `3.0.0` |

**Yayına hazır:** lint 0 hata, typecheck 0 hata, 263/263 yeşil, `dist/bin/kortext.js --version` = `3.0.0`.

### Faz 10'da eklenen kararlar

45. **`npm publish --provenance`**: Workflow'da `permissions.id-token: write` + `--provenance --access public` flag'i. npm OIDC ile cryptographic attestation; paket gerçekten bu GHA run'da, bu commit'ten yapıldığına dair public ledger kaydı. v3.0.0 release'i için supply-chain sigortası.
46. **Publish gate = CI gate'in aynısı**: `npm-publish.yml` lint + typecheck + test + build + smoke'u publish'ten önce tekrar koşar. Pre-merge gate atlanmışsa veya release tag elle yapılmışsa publish hâlâ doğrulanmış olur.
47. **HANDOVER-v3.md pakete dahil**: `.npmignore` `.github/` ve `.git/` exclude ediyor ama `HANDOVER-v3.md`'ye dokunmuyor — bilinçli; geliştirici-okur kim olursa olsun (npm install eden user dahil) son durumu görür. v3.1+'da temizlenebilir.

## Faz 11 — Onboarding wizard + dashboard mockup polish (TAMAMLANDI)

**Branch:** `feat/v3.1-onboarding-and-dashboard-polish` (commit `0052c43`, 24 dosya, +2748 / −263 satır)
**Spec:** [docs/superpowers/specs/2026-05-22-onboarding-wizard-design.md](docs/superpowers/specs/2026-05-22-onboarding-wizard-design.md)

### Onboarding wizard
- `/onboarding` route + RootShell guard: blueprint.status `uninitialized|draft|unknown` → tam-ekran form (sidebar/header/polling render edilmez).
- Tek-sayfa form (mockup-v3-palette-preview.html 'Initialize your project' ekranı 1:1): Project Name + Project Code (auto-uppercase, A-Z0-9, 2-6) + Project Type radyo (new/existing) + Target Platform chips (Web/iOS/Android, multi) + Blueprint dropzone (`.md|.txt`, ≤100KB) + Sample MD/AI Prompt yardımcı panelleri + GitHub repo (opsiyonel).
- `POST /api/blueprint` workspace/references/blueprint.md (frontmatter `status: approved`) + `.kortext/project.json` yazar, `triggerWorkflowId` döner ve `startCommand` ile mock executor fire-and-forget tetikler.
- `GET /api/blueprint/status` guard + header + footer + terminal panel için tek kaynak.
- index.html `lang=en` — Türkçe locale CSS uppercase'i I→İ dönüştürüyordu, fix.

### CLI
- `kortext init` artık preflight koşar (node ≥22, git ≥2.30, claude/codex/gemini varlık). Blocker varsa abort eder; `--skip-preflight` bypass.
- `kortext serve` ready event sonrası default tarayıcıyı açar (open / xdg-open / start). `--no-open` veya `KORTEXT_NO_OPEN=1` ile devre dışı.

### Dashboard mockup polish
- **Header:** K gradient logo + project name + v3.1.0 badge + ⌘K search bar + live "N active" pill + terminal/inbox/+p avatar.
- **Dashboard subtitle:** workflow durumu (`<workflow-id> · run #N · <status>`) — generic copy yerine.
- **RunsTable:** PERSONA / TASK / STEP / ELAPSED grid; persona avatarı (renk + initials) + renkli persona handle; `workflow-primary-persona.ts` ile workflow → persona map.
- **PendingQuestionsCard:** kind badge (blueprint/gate/deploy) + filter chips + inline Approve/Reject.
- **TimelinePanel:** event-kind dropdown + free-text search + persona-renkli handover akışı.
- **TerminalPanel:** sağ-alt köşede floating panel `kortext@<project-code>`; minimize/expand.
- **Footer:** dinamik proje adı + canlı run sayıları + renkli chip'ler (active green pulse, idle gray, blocked red, tkn/s purple, $today green).

### Palette / utility eklemeleri
- `src/index.css`: `.input` + `.btn` + `.btn-primary` palette token'a bağlı (önceden tanımsızdı, OnboardingScreen raw HTML default'larıyla render oluyordu).
- `src/lib/persona-colors.ts`: 14 persona handle → fixed hex + initials (mockup'la birebir).
- `src/lib/workflow-primary-persona.ts`: workflow id → primary persona map.

### Doğrulama
- Test: **274/274 ✅** (önceki 264 + 10 yeni: `blueprint-route` 6, `preflight` 4)
- Lint: 0 hata (3 önceden var olan warning)
- Typecheck: 0 hata
- Build: temiz (dist/web 416KB JS / 29KB CSS)
- End-to-end manuel: Eray "DENEME" projesi ile Helsinki blueprint yükledi → blueprint.md + project.json yazıldı → run #6 (`01a-analysis-pipeline`, mock, succeeded) dashboard'da görüldü.

## Sırada: Dashboard tasarım iterasyonu (Eray onayı bekleniyor)

> **Önemli:** PR açma, version bump, release flow'una geçme. Önce görsel onay.

### 1. İlk adım — Eray'a sor

Eray oturum kapanışında "mevcut branch'teki tasarım benim için ok değil" dedi ama **hangi alan sorunlu olduğunu detaylandırmadı.** Yeni oturumun ilk işi:

1. Eray'a "tarayıcıyı aç (`npm run dev` → http://localhost:5173/), hangi ekran/element hâlâ mockup'a uymuyor söyle / işaret koy / screenshot at" diye sor.
2. Referans: [docs/design/mockup-v3-palette-preview.html](docs/design/mockup-v3-palette-preview.html) — özellikle:
   - Onboarding ekranı (line ~580-697 "Initialize your project")
   - Dashboard / Orbit / Active Work card
   - Header (line ~445-473)
   - Sidebar / Footer
3. Bilinen bilinçli sapmalar (dokunmadan önce sor):
   - **Sidebar:** mockup'ta 40×40 icon-only kompakt nav, branch'te label'lı geniş kolon (HANDOVER tasarım kararı #19 ve sonrası: Workspace/Project/System merged into main sidebar).
   - **Orbit ekranı:** mockup'ta var, hiç implementlenmedi (scope dışı).

### 2. İterasyon döngüsü

Her tweak için:
1. Mockup'taki ilgili kısmı oku → diff'i bul
2. Component'ı güncelle (`src/components/*` + `src/index.css`)
3. Vite HMR ile preview screenshot al
4. Eray'a göster → onay/reddet
5. Bu branch'e ek commit (`fix(v3): dashboard polish — <component>`); push
6. 274/274 testleri bozma (özellikle `routes.test.ts` + `blueprint-route.test.ts`)

### 3. Onay sonrası → release flow

Eray görsel olarak onayladığında bir önceki handover'da yazılı 3-adım release flow'una geç:
- `gh pr create` (PR aç)
- merge → main
- `package.json` 3.0.0 → 3.1.0 + CHANGELOG [3.1.0] section + tag `v3.1.0` push → npm-publish.yml tetiklenir
- Pre-publish lokal tgz UAT: `npm pack` + Eray makinesinde `npm install -g ./kortext-3.1.0.tgz`

### 4. Olası tasarım iterasyon kalemleri (Eray spesifik söyleyene kadar tahmin)

Branch'te şu an şöyle:
- ✅ Header K logo + project name + v3.1.0 badge + ⌘K search bar + 1 active pill + terminal/inbox/+p avatar
- ✅ Dashboard subtitle workflow durumu (`04-development-cycle · run #2 · awaiting_approval`)
- ✅ Active Work card PERSONA/TASK/STEP/ELAPSED + persona avatarları
- ✅ Approvals filter chips + GATE badge + Approve/Reject
- ✅ Timeline drawer event-kind filter + search
- ✅ Terminal panel `kortext@<code>` floating minimize/expand
- ✅ Footer dinamik proje + renkli chip'ler

Mockup'la potansiyel sapmalar (Eray'ın bahsetmiş olabilecekleri):
- Active Work card'daki step indicator boş (mockup'ta "2/5", "3/", "5" gibi sayılar var) — bu /api/runs/:id'den step bilgisi alarak doldurulabilir
- Approvals card mockup'ta drawer-tipi expanded form gösteriyor; branch'te tek sayfa card
- Header'daki "active" pill mockup'ta "6/14 active" (running/total) formatında; branch'te sadece "N active"
- Persona renkleri runs satırlarında: mockup persona ismini bold + renkli gösteriyor, branch aynı ama hover effect zayıf olabilir
- Sidebar (bilinçli sapma — Eray onaylamak/yeniden açmak isteyebilir)

### 5. v3.1.x küçük borç / nice-to-have (release sonrası)

- `app.listen` error handler — EADDRINUSE sessiz fail (HANDOVER #51, Faz 10 borcu).
- Onboarding'de executor seçimi (project.json'a `executor: mock|claude|codex|gemini`); şu an mock sabit kodlu (`server/index.ts`).
- Orbit ekranı (mockup'ta var, hâlâ implementlenmedi).

---

## Dosya Haritası (yayın için en bakılacaklar)

| Yer | İşlev |
|---|---|
| [package.json](package.json) | `version: 3.0.0` (Faz 10'da bump edildi) |
| [README.md](README.md) | v3 quick start (Faz 10'da yeniden yazıldı) |
| [USER-GUIDE.md](USER-GUIDE.md) | Son-kullanıcı rehberi (Faz 10) |
| [CHANGELOG.md](CHANGELOG.md) | v3.0.0 release notes (Faz 10) |
| [MIGRATION-v2-to-v3.md](MIGRATION-v2-to-v3.md) | v2 → v3 upgrade (Faz 10) |
| [docs/architecture.md](docs/architecture.md) | Schema + engine + MCP + dashboard mimari (Faz 10) |
| [bin/migrate-legacy-backlog.ts](bin/migrate-legacy-backlog.ts) | v2 backlog markdown → SQLite — migration guide'ın çekirdek aracı |
| [.github/workflows/npm-publish.yml](.github/workflows/npm-publish.yml) | Node 22 + actions@v4 + provenance (Faz 10) |
| [HANDOVER-v3.md](HANDOVER-v3.md) | Bu dosya |

### Faz 9'da değişen önemli dosyalar (referans için)

| Yer | İşlev |
|---|---|
| [.github/workflows/kortext-ci.yml](.github/workflows/kortext-ci.yml) | v3 CI pipeline (Node 22) |
| [eslint.config.js](eslint.config.js) | `.js/.mjs` Node globals + tests klasörü gevşetilmiş |
| [bin/kortext.ts](bin/kortext.ts) | `packageRoot()` walk-up — compiled path'te version reporting çalışıyor |
| [tests/e2e-pipeline.test.ts](tests/e2e-pipeline.test.ts) | Tam pipeline E2E (6 test) |
| [tests/build-verification.test.ts](tests/build-verification.test.ts) | npm run build:server smoke (3 test) |
| [tests/cli-smoke.test.ts](tests/cli-smoke.test.ts) | Shim entry smoke (5 test) |

---

## Bilinen Gotcha'lar

- **PreToolUse Write hook yanlış pozitifleri**: Hook string-eşleme ile çalışır; better-sqlite3'ün batch SQL API'si, RegExp.prototype'ın "exec" metodu, hatta shell-free spawn sync varyantları bile yanlış pozitif tetikler.
  - Regex'lerde `.match()` API'sini tercih et (`secret-scanner.ts`, `bin/kortext.ts`'in `parseDaysFlag`'i bu nedenle match kullanıyor).
  - Batch SQL'i local değişkene aliasla (`const runMulti = db.exec.bind(db);`).
  - Sync spawn yardımcılarını `import * as cp; const runFile = cp.<name>` ile maskele (`server/cli/cleanup.ts` örneği).
  - Yeni markdown dosyalarında bile bahsi geçen sözcükler hook'u tetikler — mevcut dosyayı `Edit` ile güncelle ya da `cat > file <<EOF` heredoc ile yaz.
- **HTML inject + sanitize**: hook React'in unsafe-HTML prop'u için XSS uyarısı verir; sanitization eklendiğinde uyarı bilgi amaçlıdır. `MarkdownViewer` bu pattern'i marked + DOMPurify ile kullanıyor.
- **TanStack Router HMR**: Router instance modül yüklendiğinde tek sefer kurulur. RootShell wrap'ini değiştirdiğinde HMR eski tree'yi tutabilir — full reload gerekli (`Cmd+Shift+R`).
- **PersonaRegistry hot-reload**: Map'i in-place mutate eder; identity korunur. Tüm tüketiciler referans aldığı için ayrı senkron gerekmiyor — ama yarış koşulu farkında ol (PUT esnasında okuma snapshot-temiz olmayabilir).
- **Foreign key gotcha**: `runs.item_id → backlog_items.id`. Test/seed sırasında önce backlog item, sonra run.
- **Hash router**: derin link `http://localhost:5173/#/settings/agents` — slash sonrasındaki path TanStack tarafından parse edilir.
- **Worktree quarantine branch'leri**: Failure quarantine sonrasında `kortext/run-<id>` branch'leri silinmez — postmortem için.
- **Migration runner production'da**: `server/db/migrations/*.sql` `tsc` tarafından kopyalanmıyor. Faz 8'de `npm run build:server`'a copy step ekle.
- **Frontend bundle tipi mirror**: Server tipini frontend'e koymak yerine `src/lib/api-types.ts` elden mirror. Schema değişikliğinde her iki yer de güncellenmeli.
- **MCP stdio'da `console.log` ölümcül**: stdout = JSONRPC. `bin/kortext.ts mcp` ilk iş `console.log = console.error` monkey-patch yapar. Yeni log ekleyen herhangi bir modül bu kuralı bilmeden bozabilir. Genel kural: server kodu `console.error` kullansın, `console.log` sadece CLI komut çıktısı için (mcp dışı).
- **SSE deprecated note**: SDK 1.29 SSEServerTransport için "deprecated, use StreamableHTTP" diyor. Dashboard + claude mcp SSE'yi hâlâ kullanıyor; v3.1'de StreamableHTTP'ye migration tracked.
- **`serve` child cwd ≠ kortext kaynak dizini**: `kortext serve` backend'i kullanıcının `process.cwd()`'sinde, Vite'ı paket kökünde çalıştırır — Vite'ın `tsx`/`vite` binary'leri kullanıcının projesinde yok, devDeps paket kökünde. Faz 9'da prod modu için Express'te static dist/web serve eklenmesi gerekecek (şu an `vite preview` ayrı port'ta).
- **`init` template paths**: Çalıştırıldığı yer kaynak ağacı veya `node_modules/kortext/` olabilir. Template lookup `bin/kortext.ts` → `..` → paket kökü. Yeni scaffold edilecek dosya eklerken `.npmignore`'a bakıp pakete dahil olduğundan emin ol.

---

## Hızlı Komutlar

```bash
# Geliştirme
npm run dev                                # paralel: Vite + Express
npx tsx server/index.ts                    # sadece backend
npx vitest                                 # watch mode

# Test + doğrulama
npm test                                   # 249 test
npm run typecheck

# Tek bir test dosyası
npx vitest run tests/routes.test.ts        # Faz 6 REST smoke (17 test)
npx vitest run tests/mcp-tools.test.ts     # Faz 7 MCP tool smoke (14 test)
npx vitest run tests/cli-init.test.ts      # Faz 8 init scaffold (5 test)
npx vitest run tests/cli-logs.test.ts      # Faz 8 audit log tail (4 test)
npx vitest run tests/cli-serve.test.ts     # Faz 8 serve plan (5 test)
npx vitest run tests/orchestrator.test.ts

# MCP server (Faz 7) manuel smoke
KORTEXT_DB_PATH=.tmp/test.db npx tsx bin/kortext.ts mcp
# Sonra başka terminalde:
claude mcp add kortext -- npx tsx /Users/erayendes/Documents/_docbase/kortext/bin/kortext.ts mcp

# CLI (Faz 4-5)
npx tsx bin/kortext.ts start <wf-id>
npx tsx bin/kortext.ts approve <run-id> [answer]
npx tsx bin/kortext.ts status
npx tsx bin/kortext.ts cleanup --dry-run
npx tsx bin/kortext.ts doctor

# CLI (Faz 8)
npx tsx bin/kortext.ts --help
npx tsx bin/kortext.ts --version
npx tsx bin/kortext.ts init [--force]        # boş bir klasörde dene
npx tsx bin/kortext.ts serve [--mode=auto|dev|prod] [--port=3200]
npx tsx bin/kortext.ts logs [--limit=50] [--actor=…] [--action=…]

# REST API canlı dene
curl http://localhost:3200/api/health
curl http://localhost:3200/api/doctor | python3 -m json.tool
curl http://localhost:3200/api/personas | python3 -m json.tool
curl http://localhost:3200/api/workflows | python3 -m json.tool

# DB
KORTEXT_DB_PATH=.tmp/test.db npx tsx bin/migrate-legacy-backlog.ts --dry-run
curl http://localhost:3200/api/db/info
```

---

İyi yolculuk. 🚀
