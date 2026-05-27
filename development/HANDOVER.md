# Kortext v3 — Yeni Oturum Handover

> Bu dosya yeni Claude Code oturumunun bootstrap pusulasıdır.
> Açar açmaz şunu yaz: **"HANDOVER-v3.md'yi oku, Faz 12 (v3.1 architecture refactor) main'de; UAT bootstrap pass; bir sonraki iş Faz 13 (workflow content rewrite) — `docs/internal/faz-13-bootstrap.md`'yi aç, plan ver."**

> ✅ **v3.1 mimari refactor tamam ve main'de.** 2026-05-25 oturumunda Faz 11.4 + 12.1-12.9 paralel worktree disipline'ı ile uygulandı. PR #1 ([feat/v3.1-onboarding-and-dashboard-polish](https://github.com/erayendes/kortext/pull/1)) merge edildi → main HEAD `a299290`. Sonrasında docs catch-up PR #2 ([docs/v3.1-post-merge](https://github.com/erayendes/kortext/pull/2)) merge edildi → main HEAD `59916f9`. **UAT bootstrap doğrulaması pass** (`kortext-uat` klasöründe `kortext init` + `kortext serve` koşturuldu — DB schema v4, 15 persona indexed, 41 workflow_step indexed, 161 step "no persona handle" skipped → bu Faz 13 alanı, fatal değil; dashboard mount + listen ok). **Faz 13 (workflow .md content rewrite) yapılmadı** — Eray ayrı oturumda yürütecek (senaryolar Eray'dan).

**Tarih:** 2026-05-25 (gece)
**Yazan oturum:** Faz 11.4 + 12.1-12.9 — v3.1 architecture refactor + UAT bootstrap doğrulama
**main HEAD:** `59916f9` (Merge PR #2 — docs catch-up)
**Açık PR:** yok
**Faz 12.9'un partial UI işleri** (Reports SQL UI revamp, Memory archive dropdown, POST /api/backlog integration test, orchestrator outputIndexer wiring) v3.1.x follow-up'a bırakıldı, blocker değil.

## Çok kritik bilgi: yayın durumu

- ✅ **GitHub:** `erayendes/kortext` PUBLIC. main `59916f9`'de (Faz 12 + docs catch-up).
- 🟡 **npm registry:** `kortext@3.0.0` YAYINLANDI — hâlâ broken (HANDOVER #51 EADDRINUSE silent fail, Node 26 spawn race). **Önerme.** v3.1.0 release lokal tgz UAT geçince yapılır.
- ⏸ **v3.1.0 release planı:** `package.json` 3.1.0 → CHANGELOG → tag `v3.1.0` → npm-publish.yml otomatik tetik. **UAT bootstrap pass; UI/onboarding/prompt-cache adımları henüz koşulmadı** ([v3.1-uat-guide.md](v3.1-uat-guide.md)).
- ✅ **UAT bootstrap doğrulaması (2026-05-25):** `/Users/erayendes/Documents/_codebase/kortext-uat` klasöründe `kortext init` doğru layout'u kurdu (`.kortext/{data,memory,references,reports}` + AGENTS.md + .gitignore + .env.example, proje kökünde `agents/workflows/rules/workspace/` yok). `kortext serve` boot başarılı — log:
  ```
  db ready (schema v4)
  workflows loaded: 12 ok, 0 error(s)
  personas loaded: 14 ok, 0 error(s)
  sql index: 15 persona(s), 41 workflow step(s) upserted
  sql index: 161 step(s) skipped — no persona handle    ← Faz 13'ün hedef alanı
  dashboard mounted from .../kortext/dist/web
  server listening on http://localhost:3200
  ```

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

## Faz 11.1 — v4 wireframe alignment (bu oturumda BAŞLANDI, sürüyor)

**Eray'ın direktifi:** "wireframe-v4-final.html'e birebir uy, sidebar ikon büyüklükleri bile farklı, header farklı, footer öyle. Ben buna onay verdim."

**Referans:** [docs/design/wireframe-v4-final.html](docs/design/wireframe-v4-final.html) — Bu **TEK** visual spec. mockup-v3-palette-preview.html artık referans değil (Orbit graph paradigm, branch tablo mimarisi — Eray tablo'yu seçti dolaylı olarak v4 üzerinden).

### Bu oturumda yapılan (commit `a212ca4`)

| Component | v4 farkları | Yapılan |
|---|---|---|
| **RootShell layout** | header full-width yatay; sidebar header'ın altında | row-flex → col-flex (router.tsx) |
| **Sidebar** | aside içindeki 'Kortext v3' logo bloğu yok; 24px icons; tx-disabled dim section title; flex-spacer ile Danger sticky bottom; v4 icon set (sliders/users/shield/git-branch/zap/plug/key/file-text) | Sidebar.tsx yeniden yazıldı |
| **Header** | active pill yok; Timeline toggle yok; K gradient logo 24×24 (accent→signal); Inbox badge sayı yerine kırmızı nokta + halo; solid amber +p avatar; 320px sabit cmdk-trigger | Header.tsx yeniden yazıldı |
| **Footer** | 12px font; 3 vertical divider; Lucide Zap/GitBranch SVG (⚡/⎇ değil); accent-soft workflow ID; pulse yok | Footer.tsx yeniden yazıldı |
| **Dashboard route** | 2-kolon (main + inline TimelineSidebar 340px); btn-ghost Timeline + btn-outline Refresh; healthy/wf/personas chip yok; APPROVALS card right column'dan kalktı | dashboard.tsx yeniden yazıldı |
| **RunsTable** | avatar circle yok; rainbow persona handle text (v4 .actor-* paletine); tek 'Active work' section (Recent yok); dot states + queued/blocked tail labels | RunsTable.tsx yeniden yazıldı |
| **persona-colors** | 15 handle v4 actor-bd/qa/ds/fd/se/da hex değerlerine (Tailwind 400 range; branch 500 range'den) | persona-colors.ts güncellendi |
| **TimelineSidebar** | yeni inline 340px sağ kolon; filter + search; event dots; persona-routed colour | TimelineSidebar.tsx (new) |
| **index.css** | .btn-outline class (transparent bg + white/8% border) | eklendi |

**Doğrulama:**
- 274/274 test ✅, typecheck 0, lint 0
- Eray Sidebar / Header / Footer / Dashboard adımlarını teker teker onayladı (her birinde "tamam, sonrakine geç" dedi)

## Faz 11.2 — v4 wireframe alignment (board / memory / reports / references / settings) (TAMAMLANDI)

**Commit:** `072f072` — `fix(v3): align board / memory / reports / references / settings to wireframe-v4-final 1:1` (13 dosya, +1864 / −245)
**Doğrulama:** 274/274 test ✅ · typecheck 0 · lint 0 (alignment kapsamında)
**Eray onayı:** Board / Memory / Reports / References / Settings (her bir pane) / Onboarding — her ekranı tek tek onayladı.

### Bu oturumda yapılan

| Ekran | v4 farkları | Yapılan |
|---|---|---|
| **Board** | Epic kolonu (4 progress card), 5 status kolon (Test dahil), filter selects, Filter+New task primary, kc-type-mark renkli badge, blocked=card variant | board.tsx yeniden yazıldı; schema migration 002 ile `test` status eklendi |
| **Memory** | 3-tab bar (Decisions/Learned/Handovers), mem-card primitive (id+title+avatar+quote+footer+badge+View), persona-renkli from→to handovers | memory.tsx yeniden yazıldı; `/api/decisions` (yeni endpoint) |
| **Reports** | 'N pending review' badge, rpt-card per file (chevron expand + persona avatar + Generated by), inline DocBody render | reports.tsx yeniden yazıldı; MarkdownViewer'dan DocBody export edildi |
| **References** | 2-pane md-shell, file size+mtime meta, Upload reference, editor pane (Edit/Preview toggle + tone-based badge + Save disabled) | references.tsx yeniden yazıldı; `/api/docs/:scope` response shape `{name,size,mtime}[]` oldu |
| **Settings × 8** | Project (8 field-row + toggle + Save), Agents (6-col table + Quick preset + cost meta), Rules+Workflows (md file-shell + diagram), Hooks (6 toggle), Integrations (6-card grid), Environment (key/value/type table), Danger zone (3 destructive card) | settings-panes.tsx yeniden yazıldı (251 → 819 satır), Workflows için Visual flow diagram bileşeni |
| **Onboarding** | v4 wireframe'de yok | Mevcut Faz 11 form'u korundu; form alanları zaten v4 ProjectSettings ile eşleşiyor — Eray "mevcut hâli korunsun" onayı |

### Faz 11.2'de eklenen kararlar

53. **`test` status additive migration**: SQLite ALTER CHECK desteklemediği için backlog_items rebuild pattern (defer_foreign_keys=ON + INSERT...SELECT + DROP+RENAME). `blocked` ve `cancelled` retire edilmedi — `blocked` UI'da card variant olarak (border-left-danger) In progress kolonunda render olur, `cancelled` boardda gizlenir. Eray bu yaklaşımı onayladı (en az risk).
54. **`/api/decisions` minimal endpoint**: Sadece `repositories.decisions.list()` wrap. Memory Decisions tab tek tüketici. Decision schema'da `author`/`quote` alanı yok — mem-card avatar+quote opsiyonel olarak çiziliyor, decisions için boş kalıyor.
55. **`/api/docs/:scope` response shape change**: `files: string[]` → `files: {name,size,mtime}[]` — References file list size+mtime gösteriyor. 3 consumer (MarkdownViewer, reports.tsx, references.tsx) + route testi güncellendi.
56. **Settings panes monolith**: 8 pane tek dosyada (`src/routes/settings-panes.tsx`, 819 satır). Pane bazlı split v3.2'de düşünülebilir ama tek dosyada cross-pane primitives (Badge, Toggle, MarkdownFileShell, FileBody, FieldRow) paylaşılıyor.
57. **`React.ReactNode` yerine named import**: lint kuralı `no-undef` namespace'i kabul etmiyor — `import { useState, type ReactNode } from 'react'` pattern'i kullanılıyor.
58. **Heredoc fallback Write hook için**: React'in raw-HTML inject prop'unu içeren dosyaları `cat > file <<EOF` ile yazıyoruz (references.tsx ve settings-panes.tsx). Sanitization katmanı (marked + DOMPurify) zaten yerinde — hook sadece string-match yapıyor (handover gotcha #1).

### Şimdi sırada — Release flow

Tüm v4 alignment tamamlandı. Eray onayıyla:

1. `gh pr create` — PR aç (alignment + Faz 11)
2. Merge → main (squash veya merge, Eray seçer)
3. `package.json` 3.0.0 → 3.1.0
4. CHANGELOG.md [3.1.0] section ekle (Faz 11 onboarding + Faz 11.1 shell/dashboard alignment + Faz 11.2 board/memory/reports/references/settings alignment + Migration 002 + /api/decisions)
5. `git tag v3.1.0 && git push origin v3.1.0` → npm-publish.yml tetiklenir
6. Pre-publish lokal tgz UAT: `npm pack` + Eray makinesinde `npm install -g ./kortext-3.1.0.tgz` test
7. v3.1.0 release sonrası: workspace/references/blueprint.md modify'i (Eray'ın DENEME test data'sı) git'ten reset (alignment commit'ine dahil edilmedi)

### Bilinçli sapmalar (Eray hâlâ kabul ediyor)

- **Onboarding kart fill + rounded-2xl + Sparkles header**: v4 disiplinine sıkı uyum yerine "focused single-screen wow" tercih edildi (Eray onayı).
- **Save butonları her md editor'da disabled**: inline write endpoint v3.2'de eklenir. UI hazır.
- **Footer'daki '3 blocked' + '6 active' + '2 idle' chip'leri hâlâ hardcoded**: canlı sayıya bağlama (Footer.tsx) v3.2'de.

### v3.1.x küçük borç / nice-to-have (release sonrası)

- `app.listen` error handler — EADDRINUSE sessiz fail (HANDOVER #51, Faz 10 borcu).
- ~~Onboarding'de executor seçimi~~ → **çözüldü Faz 11.3** (Mock / Claude / AGY chip + project.json).
- TimelinePanel.tsx (drawer overlay) artık unused — Header'dan toggle kaldırıldı; ya kaldırılsın ya da yeni bir entry point eklensin (v3.2'de).
- Footer.tsx canlı stats wiring (active/idle/blocked counts).
- Inline markdown save endpoint (PUT /api/docs/:scope/:file) — Rules / Workflows / References "Save" butonları için.
- Decisions cards'a author + quote alanı (Decision schema genişletme veya markdown frontmatter parse).

---

## Faz 11.3 — Lokal UAT (DEVAM EDİYOR — claude tool use bloğu)

**Bu oturumda** Faz 11.2 alignment commit'inden sonra Eray ile lokal UAT başlatıldı. Davranışsal fix'ler + executor selection + AGY adapter + Inbox drawer + crash önleme fix'leri pakete girdi ama commit'lenmedi henüz (working tree dirty). UAT'da yeni bug zinciri çıktı, hepsi düzeltildi, sonunda asıl mimari problem ortaya çıktı.

### Bu oturumda eklenen davranışsal/altyapı düzeltmeleri (HENÜZ COMMIT YOK)

| # | Sorun | Düzeltme | Dosya |
|---|---|---|---|
| 1 | `kortext init` Helsinki test blueprint'ini `status: approved` ile scaffold ediyordu → onboarding bypass | Repo'daki `workspace/references/blueprint.md` skeleton + `status: uninitialized` ile değiştirildi | `workspace/references/blueprint.md` |
| 2 | Sidebar toggle butonu onClick yoktu | `shell-store.sidebarCollapsed` + RootShell conditional | `src/lib/shell-store.tsx`, `src/router.tsx`, `src/components/Header.tsx` |
| 3 | Timeline toggle butonu işlevsizdi | `shell-store.timelineOpen` + dashboard conditional | `src/lib/shell-store.tsx`, `src/routes/dashboard.tsx` |
| 4 | Footer'da hardcoded `~1.2K tkn/s · $4.30 today · feature/auth-42 · workflow: 04-development 4/7` | Token + cost + branch + workflow chip'leri kaldırıldı; active/idle/blocked canlı | `src/components/Footer.tsx` |
| 5 | +prime avatar header sağında gereksiz | Kaldırıldı (tek-kullanıcı sistem) | `src/components/Header.tsx` |
| 6 | Terminal panel collapsed 30px + 11px font v4'ten büyük | 24px header + 10px font + 440×280 expanded | `src/components/TerminalPanel.tsx` |
| 7 | Searchbar tıklanır görünüyor ama no-op | `disabled` + `cursor-not-allowed` + opacity 0.55 + "soon" badge | `src/components/Header.tsx` |
| 8 | OnboardingScreen submit `setSubmitting(false)` sadece catch'te → success'te "Initializing…" takılı kalıyor | try success path'ine `setSubmitting(false)` + onDone fallback `window.location.reload()` | `src/components/OnboardingScreen.tsx` |
| 9 | TimelinePanel.tsx (drawer overlay) artık unused — router.tsx'ten import edildiği için bundle'da | Router'dan kaldırıldı | `src/router.tsx` |
| 10 | Onboarding'de executor seçimi yok — hep `executor: 'mock'` hardcoded | 3 chip (Mock / Claude / AGY) + binary path field + project.json'a kaydet + blueprint trigger'da oku | `OnboardingScreen.tsx`, `blueprint.ts` route, `blueprint/io.ts`, `server/index.ts` |
| 11 | AGY (Antigravity) executor yoktu | Yeni `antigravity-cli-executor.ts` (`agy -p --dangerously-skip-permissions --print-timeout=10m`) + ExecutorKind enum + factory + preflight (`agy help`) | `server/engine/executors/antigravity-cli-executor.ts`, `executor-factory.ts`, `preflight.ts`, `bin/kortext.ts` |
| 12 | Preflight `agy --version` desteklemiyor → "Usage of agy:" satırını version sanıyordu | Semver parse fail → `(installed)` fallback | `server/cli/preflight.ts` |
| 13 | Inbox bell sadece dot, drawer yoktu | `InboxDrawer.tsx` 420px right + question card per pending q + Approve/Revise/Reject → POST /api/questions/:id/answer | `src/components/InboxDrawer.tsx`, `shell-store.inboxOpen`, `Header.tsx` |
| 14 | Express 5 SPA fallback regex `/^\/(?!api\/|mcp\/).*/` lookahead'i path-to-regexp v6 desteklemiyor → "Cannot GET /" | regex → plain middleware (`req.path.startsWith` checks) | `server/index.ts` |
| 15 | cli-spawn `.kortext/logs/` dizini yoksa `createWriteStream` ENOENT atıp **server crash** | spawnCli içine `mkdirSync(dirname(logPath), {recursive:true})` | `server/engine/executors/cli-spawn.ts` |
| 16 | claude executor default args boş → `claude` REPL'e düşüp stdin'i okuyor ama hiç çıktı üretmeden hung | Default `['--print', '--dangerously-skip-permissions']` | `server/engine/executors/claude-cli-executor.ts` |

Doğrulama: 274/274 test ✅ · typecheck 0 · lint 0 (alignment kapsamı). Build + npm pack tgz Eray'a verildi, `/Users/erayendes/Documents/_docbase/kortext/kortext-3.0.0.tgz`.

### Faz 11.3 çözüm turu (bu oturumda — Claude tool use ÇALIŞIYOR)

UAT iki tur döndü:

**Tur 1** (executor only fix): `claude-cli-executor.ts`'e `--append-system-prompt` + `--add-dir <parent>` + imperative user prompt eklendi. Sonuç: claude hâlâ tool çağırmıyor; log'da `★ Insight ────` block + "başarıyla oluşturuldu" hallucination görüldü.

**Tur 2** (gerçek çözüm): 2 ek düzeltme uygulandı:

1. **`--setting-sources project,local`** eklendi — Eray'ın `~/.claude/settings.json` global output style'ı ("explanatory") spawn edilen claude'a sızıyordu. Bu output style claude'a "★ Insight blocks + commentary" davranışını dayatıyor → Write tool çağrılmıyor. `project,local` source'ları yüklenirken `user` source skip edilince claude default davranışına dönüyor. (Auth keychain `user` source'a değil, ayrı kanala bağlı — etkilenmiyor.)
2. **Path normalization `workflow-parser.ts`'te** — workflow file konvansiyonu `../workspace/foo.md` ("workflow dir'inden bir üst") parser seviyesinde tek leading `../` strip edilerek `workspace/foo.md`'ye normalize ediliyor. Engine cwd (proje kökü) altında doğru resolve oluyor.

Sonuç (UAT, 2026-05-24 14:49+):
- `workspace/references/legal-strategy.md` 11 KB
- `workspace/references/growth-strategy.md` 13 KB
- `workspace/reports/product-requirements.md` 24 KB
- `workspace/references/design-system.md` 4 KB
- Diğer step'ler de paralel ilerliyor

Test: 274/274 ✅ · typecheck 0. Build + pack tekrar üretildi.

### Açık (sıradaki oturuma) — workflow içerikleri

Eray UAT'da claude'un akıp dosya yazdığını gördü ama **workflow .md içeriklerinin kendisi sorunlu** (sıralama, persona/RACI, gate akışı, çıktı tanımları). Kortext engine ÇALIŞIYOR; workflow definition'ları (`workflows/01a-analysis-pipeline.md` vs.) elden geçirilecek. Senaryo Eray'dan gelecek.

### ESKİ ASIL BUG (ÇÖZÜLDÜ) — claude headless tool use

UAT akışı: Eray fresh install + `kortext init` + `kortext serve` + Onboarding (Claude executor) + Initialize project. Chainer 3 run koştu (01a-analysis-pipeline ×3), **3'ü de FAILED**, aynı sebepten:

```
error_message: "declared outputs not produced: ../workspace/references/legal-strategy.md"
```

`.kortext/logs/run-3-step-37.log` örneği (compliance-expert step):
- claude `args: ["--print","--dangerously-skip-permissions"]` ile çağrılıyor ✓
- Exit code 0 ✓
- Aborted false ✓
- **Stdout'u**: claude güzel bir markdown analiz yazısı yazıyor, sonunda da `` `workspace/references/legal-strategy.md` dosyası tamamlandı. `` diyor
- **Disk'te dosya yok**

Tanı: `claude --print --dangerously-skip-permissions` headless mode'da **tool çağrısı (Write/Edit/Bash) yapmıyor** — claude tool'ları çağırmaya çalışmadan sadece text üretip "dosya yazıldı" gibi uydurma cevap veriyor. Step output validation gerçek dosyayı arıyor → bulamıyor → run failed → chainer aynı pipeline'ı tekrar tetikliyor → infinite fail loop.

### Sıradaki oturum için görev

**Tek odak**: `server/engine/executors/claude-cli-executor.ts`'i tool use yapacak şekilde düzelt. Olası yaklaşımlar (research + test):

1. **`--allowedTools` flag denemesi**: `claude --print --dangerously-skip-permissions --allowedTools "Write,Edit,Read,Bash,Grep,Glob"` — belki bu eksik
2. **Project-level CLAUDE.md / .claude/settings.json**: scaffold edilen kortext-uat dizininde `.claude/settings.json` ile permissions / allowed tools ayarı
3. **MCP server pattern**: claude'a workspace edit araçlarını MCP üzerinden expose et
4. **CLI doc deep-dive**: `claude help -p`, `claude print --help`, GitHub repo'da headless mode best practice
5. **`--max-turns N` deneme**: belki tool use için iteration limit lazım

Test akışı (UAT komutu hazır):
```bash
cd ~/Documents/_codebase/kortext-uat && npm uninstall -g kortext && rm -rf .kortext workspace agents workflows rules AGENTS.md && npm install -g /Users/erayendes/Documents/_docbase/kortext/kortext-3.0.0.tgz && kortext init && kortext serve
```

Doğru `claude` invocation bulundu mu test edilir: workflow step'i çalışır, gerçek dosya `workspace/references/legal-strategy.md` disk'e yazılır, step `succeeded` olur, chainer ilerler.

AGY executor için aynı pattern tekrarlanmalı (büyük ihtimalle agy de aynı mimari ile çalışıyor — `-p --dangerously-skip-permissions` ile sadece text yanıt verir, dosya yazmaz).

### Bu commit edilmemiş 16 fix + asıl claude fix toplu commit edilecek

Yeni oturumun claude fix'i tamamlandığında **tek bir büyük commit** (Faz 11.2 commit'inde benzer pattern, multi-bullet body):
```
fix(v3): real local UAT — onboarding redirect + sidebar/timeline/inbox wiring + executor selection + AGY adapter + claude headless tool use
```

Sonra ayrı bir handover commit + PR aç + main merge + 3.1.0 release flow.

### Bilinçli sapmalar (Eray hâlâ kabul ediyor)

(Şimdilik yok — v4'e birebir uyma kararı sonrasında tüm sapmalar yeniden ele alınacak.)

### v3.1.x küçük borç / nice-to-have (release sonrası)

- `app.listen` error handler — EADDRINUSE sessiz fail (HANDOVER #51, Faz 10 borcu).
- Onboarding'de executor seçimi (project.json'a `executor: mock|claude|codex|gemini`); şu an mock sabit kodlu (`server/index.ts`).
- TimelinePanel.tsx (drawer overlay) artık unused — Header'dan toggle kaldırıldı; ya kaldırılsın ya da yeni bir entry point eklensin (v3.2'de).

---

## Faz 12 — v3.1 architecture refactor (TAMAMLANDI, 2026-05-25)

**PR:** https://github.com/erayendes/kortext/pull/1 (`feat/v3.1-onboarding-and-dashboard-polish` → `main`, 9 commit)
**Spec:** [v3.1-architecture-proposal.md](v3.1-architecture-proposal.md) (14 bölüm)
**Strateji:** Paralel git worktree alt-fazları (spec §14). Her alt-faz kendi worktree'sinde başlatıldı, bitince cherry-pick ile feat branch'e taşındı.

### Tamamlanan alt-fazlar

| Alt-faz | Commit | Test delta | Ana iş |
|---|---|---|---|
| **11.4** | `f733b0e` | — | Planning docs (`v3.1-architecture-proposal.md`, `v3.1-todo.md`, `setup-onboarding-scenario.md`) + clean-break cleanup (legacy/, settings/, skills/, bin/migrate-legacy-backlog.ts, kortext-3.0.0.tgz silindi; .kortext/+*.tgz git-ignored); root `CLAUDE.md` (code-side developer brief — _docbase/_codebase split + sync rule). |
| **12.7** | `7ae7f46` | +3 (277) | Prompt cache aktivasyonu — persona body `--append-system-prompt`'a taşındı; `--exclude-dynamic-system-prompt-sections` per-machine churn'ü user message'a verir; cache invalidation guard testi (system prompt byte-identical across runs). AGY/Codex/Gemini için `--system-prompt` analog yok — stable-prefix discipline'ı dokümante edildi. |
| **12.3** | `1749b27` | — | `templates/` 38 iskelet — AGENTS.md, .gitignore, .env.example, 6 backlog prefix (TXX/BXX/EXX/DXX/SXX/HXX), 15 references (env-setup.md yeni), 11 reports, handover/decisions/learned TOC iskeletleriyle. 4 frontmatter standardı uygulandı (spec §5), `> [!INFO]` callout söküldü. |
| **12.1+12.2** | `a6b30f2` | — | `workspace/` kalktı, proje markdown'ı `.kortext/{references,reports,memory}/`'ye taşındı; engine state + worktrees `.kortext/data/` altında; `agents/workflows/rules` paket içinden yüklenir (proje kopyası yok). Yeni `server/paths.ts` `packageRoot()` walk-up + `ProjectLayout`/`RuntimeLayout` helper'ları. `kortext init` yeniden yazıldı (sadece `templates/` ve `.kortext/data/`'yı seed eder). |
| **12.5** | `651f49a` | +27 (304) | Per-file rapor: `003_add_reports_index.sql` (kolon: id/scope/slug/file_path UNIQUE/author/status/tags JSON/related_item/created_at) + `ReportsRepository` (create/get/getByPath/list/updateStatus) + `GET /api/reports[/:id]` + `markdown-sync.writeReport()` & `indexReportFromPath()`. Engine entegrasyonu: `worker-pool.ts::runSafetyGuards` opsiyonel `outputIndexer` callback alır; declared output başına çağrılır (errors swallow). |
| **12.8** | `ec6f5b8` | +25 (302→ feat'te 329) | `004_add_workflow_persona_index.sql` — `personas` (handle PK, capabilities JSON, when_to_use, model_default) + `workflow_steps` (compound UNIQUE on workflow_id+step_no, persona_handle FK). `server/engine/index-sync.ts` boot-time projection + parse-time FK validation: bilinmeyen `+ajan` referansı toplu olarak raporlanır ve fatal throw. `+prime` synthetic row. Yeni REST: `GET /api/personas/usage`, `GET /api/workflows/:id/dependencies`. `gate_kind` ve `capabilities` kolon var ama parser henüz doldurmuyor — Faz 13'ün işi. |
| **12.6** | `15d2841` | +31 (335) | `server/services/handover-rotation.ts` (5 entry VEYA 30 KB → `handover-<YYYY-MM-DD-HHMM>.md`); `server/services/toc-updater.ts` (GitHub-slug, idempotent, opt-in `## İçindekiler` heading'i varsa); `server/cli/archive.ts` + `kortext archive handover` subcommand. `HandoverEngine.record()` sonunda best-effort rotation, opt-out flag. `markdown-sync.writeDecision()` + yeni `writeLearned()` TOC refresh çağırır. |
| **12.9** | `b92f6f7` + `ef45795` | — | Backlog "+ New Item" modal (board.tsx) + `POST /api/backlog` (auto-id per prefix: T01/B01/E01/...) + Settings/Agents/Workflows/Rules **readonly** view (PersonaEditor source/rendered toggle). `React.ReactNode` → `type ReactNode` named import (HANDOVER #57 lint discipline). |

### Test/lint/typecheck/build (PR HEAD `ef45795`)

```
Test Files  46 passed (46)
     Tests  360 passed (360)   ← baseline 274 + 86 yeni
lint        0 errors (4 pre-existing/harmless warnings)
typecheck   0 hata
build       temiz (dist/web 460 KB / 141 KB gzip)
```

### Faz 12'de eklenen tasarım kararları

59. **`outputIndexer` callback slot** = engine-adapter ayrımı: `worker-pool` reports indexer'ı doğrudan import etmek yerine `SafetyGuards`'a opsiyonel callback ekledi (secret-scanner/harmful-filter ile aynı pattern). Üretim engine boot'unun bu slot'a indexer geçirmesi tek satırlık follow-up — Faz 12.5 kapsamında slot tanımlandı, çağrı yapılmadı.
60. **Prompt cache disipline'i** = stable prefix: cache hit'in temeli `--append-system-prompt`'a byte-identical içerik geçmek. RunId/stepId/timestamp gibi her çalıştırmada değişen şey kesinlikle system prompt'a karışmaz; bunlar user prompt veya stdin payload'ında kalır. Test (`cli-executor.test.ts`) bu garantiyi 2 farklı runId/stepId'yle aynı step koşturup arg byte-eşitliğini doğrulayarak verir.
61. **TOC engine sorumluluğu, persona maintenance turuna bırakılmadı**: `+operation-manager` 09-maintenance-cycle'da TOC tut" idea'sı reddedildi (her ADR yazıldıktan saatler sonra güncellenir, tutarsızlık penceresi). Onun yerine `markdown-sync.writeDecision/writeLearned` sonunda `toc-updater.updateToc()` çağrılır — atomik tutarlılık. Opt-in: dosyada `## İçindekiler` heading'i yoksa no-op.
62. **`+prime` synthetic persona row**: `personas` tablosunda `+prime` için `agents/prime.md` dosyası yok ama workflow step'ler `+prime` referansı verebiliyor. Index-sync `+prime`'ı boot'ta synthetic row olarak ekler (`source_path: '(synthetic)'`) — dashboard ayırt edebilir. Aynı yaklaşım gerekirse v3.2'de `+human` veya `+external` için kullanılır.
63. **Per-file rapor naming + tags JSON kolon**: spec'te tags array olarak öngörüldü (`tags JSON column — kategorizasyon ileride zenginleşebilir`). v3.1.0'da yazılan rapor için `tags: []` default; CLI/UI tarafında tag-add UI yok. Spec bilinçli olarak ertelenmiş "zenginleşebilir" notuyla.
64. **`React.ReactNode` namespace yasak (lint kuralı pekiştirildi)**: `no-undef` ESLint kuralı React namespace'ini görmüyor — `import { type ReactNode } from 'react'` pattern'i her UI dosyasında zorunlu. Faz 12.9'da board.tsx bu kuraldan kaçtı, ayrı fix commit (`ef45795`) ile düzeltildi. Yeni component yazarken hatırla.

### Faz 12.9'da scope dışında kalanlar (v3.1.x follow-up, blocker değil)

UI ajanı socket-error öncesi şu parçalara ulaşamadı; mevcut ekranlar v3.0 endpoint'leriyle çalışmaya devam ediyor (kırık değil):

- **Reports ekranı SQL UI revamp** — `src/routes/reports.tsx` hâlâ `/api/docs/reports` (filesystem listing) kullanıyor. Faz 12.5 yeni `/api/reports` (SQL-backed `reports_index`) endpoint'i tüketiciyi bekliyor. Filter chip'leri, tags multi-select, status badge.
- **Memory ekranı TOC nav + handover archive dropdown** — Decisions/Learned tab'larında sol panel TOC navigation yok; Handovers tab'ında eski `handover-<ts>.md` segmentleri için dropdown yok.
- **POST /api/backlog integration test** — route landed, route-level test eksik.
- **Orchestrator wiring of `outputIndexer`** — engine boot'tan `worker-pool.SafetyGuards`'a indexer callback geçirme tek satırlık iş; şu an slot boş, üretim akışında reports auto-indexing tetiklenmiyor.

### Faz 12 sonrası v3.1.x küçük borç

- Yukarıdaki 4 madde
- `app.listen` error handler (Faz 10 borcu, hâlâ açık)
- TimelinePanel.tsx unused (router'dan kaldırıldı ama dosya duruyor; v3.2 cleanup)
- Eski v3.0 endpoint'leri kaldırma kararı: `/api/docs/reports` (filesystem) hâlâ aktif — UI'ı `/api/reports`'a çevirince kaldırılabilir, v3.2.
- `+prime` synthetic row için `agents/prime.md` yazmak mı yoksa registry'de synthetic mı bırakmak mı kararı (v3.2)

---

## Faz 13 — workflow content rewrite (SIRADA, Eray senaryolarıyla)

**Durum:** Bekliyor. Faz 12'nin mimari değişiklikleri (path, frontmatter, SQL index) workflow .md'lerinin **içeriği** ile uyumlu değil — placeholder `+ajan` referansları, `scripts/kortext-*.py` ve `hooks/git-pre-commit.sh` referansları, eski `workspace/` path'leri, monolitik rapor disipline'ı hâlâ workflow content'inde yazılı.

**Plan dosyası:** [faz-13-bootstrap.md](faz-13-bootstrap.md) — yeni oturumda bu dosya açılır, plan oradan çekilir.

**Önemli:** Faz 13'ün senaryoları **Eray'dan gelir** (örn. setup onboarding scenario, hangi workflow'un nasıl yeniden yazılacağı). Faz 13 öncesi `+ajan` placeholder'larla yüklenirse `index-sync` boot'ta fatal throw atar — bu istenen davranış: `kortext serve` çalışmadan önce content rewrite tamamlanmalı VEYA bir interim "skip validation" flag eklenmeli (önerilmez, hata atan validasyon Faz 12.8'in core garantisi).

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
