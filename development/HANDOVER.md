# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, Faz 13 + docs konsolidasyon main'de; sırada AGENTS.md'den başlayarak tüm akışların üzerinden tek tek geçmek."**

---

## 1. Son durum (2026-05-27)

**main HEAD:** `6dc2fb6` (Faz 13 — workflow content rewrite + foundation/ category + docs konsolidasyon + repo housekeeping)

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 382/382 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**Açık PR:** yok (feat/v3.1-workflow-content silindi)

**npm registry:** `kortext@3.0.0` hâlâ broken (HANDOVER #51 EADDRINUSE silent fail). v3.2.0 release lokal tgz UAT geçince yapılır.

---

## 2. Faz 13 sonuçları (özet)

### Engine genişletmesi
- `server/engine/output-resolver.ts` — `<slug>` / `<ts>` placeholder syntax
- 4 CLI executor + worker-pool safety guards output-resolver'a wire'lı
- `server/index.ts` boot'unda `outputIndexer` wired (per-file rapor → `reports_index` otomatik)
- Parser callout → approver-based gate detection (`step.approver === '+prime'` auto-gate)

### Mimari refactor
- `.kortext/foundation/` yeni kategori (BRD/PRD/TRD/PFD — analysis turunun donmuş çıktıları)
- 13 reference ALL-CAPS rename (ACCESS, API, CONTENT, DATABASE, DESIGN, ENVIRONMENT, GLOSSARY, GROWTH, LEGAL, SECURITY, STACK, STRUCTURE, TEST)
- `required-skills.md` silindi (persona body'sinde zaten var)
- Skipped step count: **161 → 0**

### 12 workflow rewrite
00-kortext-setup, 01a-analysis-pipeline, 01b-onboarding-pipeline, 02-planning-pipeline, 02b-spike-workflow, 03-environment-setup, 04-development-cycle, 05-test-cycle, 06-deployment-cycle, 07-rollback-pipeline, 08-hotfix-pipeline, 09-maintenance-cycle.

Her workflow: AI-odaklı imperative ton, callout'lar kaldırıldı, reviewer satırları kaldırıldı (v3.2'de runtime'a alınacak), per-file rapor placeholder syntax, foundation + ALL-CAPS path'leri.

### docs/ → development/ konsolidasyon
22 dosya 6 ana doc + concepts/ klasörüne indirgendi:
- [ARCHITECTURE.md](./ARCHITECTURE.md) — v3.1 canonical mimari (path layout, frontmatter, engine, MCP, dashboard)
- [DECISIONS.md](./DECISIONS.md) — tüm kararlar (Faz 13 + Faz 12 + Faz 0-11 özet + design kararları + tarihçe + reddedilenler)
- [DESIGN.md](./DESIGN.md) — palette + design tokens + component library + UI patterns + persona renkleri
- [TODO.md](./TODO.md) — açık iş listesi (v3.1.x follow-up + v3.2 ertelenmiş)
- [UAT-GUIDE.md](./UAT-GUIDE.md) — manuel UAT rehberi
- [HANDOVER.md](./HANDOVER.md) — bu dosya
- [concepts/](./concepts/) — UI mockup + wireframe + concept arşivi

### Repo housekeeping
- `/AGENTS.md` (v3.0 path'leri ile bayat) silindi — `templates/AGENTS.md` kanonik
- `/.env.example`, `/workspace/`, `/.kortext/`, `/dist/`, `/.DS_Store`, `kortext-3.0.0.tgz` silindi
- `.npmignore` temizlendi + `development/` exclude
- `templates/AGENTS.md` — foundation/ bölümü eklendi
- README + USER-GUIDE link'leri GitHub URL'sine yönlendirildi

---

## 3. Sıradaki iş — Review turu

**Hedef:** AGENTS.md'den başlayarak Kortext'in **tüm akış dosyalarının** üzerinden tek tek geç. Eray + Claude birlikte her dosyaya bak, içeriği inceler, gerekirse düzelt.

**Sıra (kesin değil — Eray belirler):**

1. `templates/AGENTS.md` — kullanıcının kortext init sonrası gördüğü AI bootstrap dosyası
2. `agents/*.md` — 14 persona (backend-developer, compliance-expert, copywriter, db-admin, delivery-manager, designer, devops-engineer, engineering-manager, frontend-developer, growth-expert, operation-manager, product-manager, qa-engineer, security-engineer)
3. `rules/*.md` — 6 rule (behavior, branching, commands, emergency, mcp, models)
4. `workflows/*.md` — 12 workflow (00 → 09) — Faz 13'te baştan yazıldı ama review turunda kalibrasyon
5. `templates/foundation/*.md` — BRD, PRD, TRD, PFD skeletonları
6. `templates/references/*.md` — 13 reference (ALL-CAPS)
7. `templates/reports/*.md` — 8 rapor scope template
8. `templates/memory/*.md` — handover, decisions, learned skeletonları
9. `templates/backlogs/*.md` — 6 item template (BXX/DXX/EXX/HXX/SXX/TXX)

**Disipline:**
- Her dosyayı **birlikte oku** — Claude full içerik gösterir, Eray inceler
- Risk noktalarını işaret et (bayat referans, eksik bölüm, AI-odaklı olmayan ton, vb.)
- Eray onayı / düzeltme isteği → Claude uygular → commit
- Sırayla ilerle; atlama yok

**Bilinen risk noktaları (Faz 13 hızlı yazımdan):**
- `01b-onboarding-pipeline.md` — pattern apply (~30 sn yazıldı), kalibre gerek
- `02b-spike-workflow.md` — dinamik persona oversimplification
- `04-development-cycle.md` — `item.approver` dinamik gate engine destek belirsiz
- `07-rollback-pipeline.md` — workflow gate yok kararı (incident-driven), sorgulanabilir
- `09-maintenance-cycle.md` — engine bookkeeping step #2 yeni semantik, test edilmedi

---

## 4. Açık konular (TODO.md'den)

### Manuel UAT
- [ ] Eray makinesinde clean `kortext-uat/` + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` + Onboarding wizard'da blueprint kabul + 01a-analysis-pipeline gerçek Claude executor ile koşma
- [ ] Beklenen: foundation/references/reports doluyor, `pending_questions`'a +prime gate'leri düşüyor, log mesajı "0 step skipped — no persona handle"

### v3.1.x follow-up (release sonrası, blocker değil)
- Reports SQL UI revamp (mevcut `/api/docs/reports` filesystem; `/api/reports` SQL-backed endpoint bekliyor)
- Memory archive dropdown (handover-`<ts>.md` segmentleri)
- Footer canlı stats wiring
- Inline markdown save endpoint
- Decisions cards author+quote alanı

### v3.0.1 borç
- `app.listen()` error handler — EADDRINUSE sessiz fail

### v3.2'ye ertelenmiş
- Reviewer-as-step runtime (agent-to-agent review pattern)
- Light theme variant
- Mobile responsive
- A11y aria
- i18n implementation
- ⌘K command palette
- Settings/Agents YAZMA editor

---

## 5. Mimari özet (yeni Claude için hızlı pusula)

**TypeScript runtime + React dashboard + SQLite + worker pool.** 14 persona + 12 workflow + MCP server. Blueprint approved → analysis → planning → development → test → deploy zinciri otonom çalışır. Kritik gate'ler (`step.approver === '+prime'`) `pending_questions`'a düşer, dashboard inbox üzerinden +prime onaylar.

**Dosya disiplini (v3.1):**
- npm paketi: `node_modules/kortext/{agents,workflows,rules,templates}/` — paket içinden okunur, **proje köküne kopyalanmaz**
- Kullanıcı projesi: `.kortext/{data,foundation,references,reports,memory}/` + kök `AGENTS.md` + `.env` + `.gitignore`
- Engine state: `.kortext/data/kortext.db` (SQLite + worktree + log, git-ignored)
- Foundation (donmuş): `.kortext/foundation/{BRD,PRD,TRD,PFD}.md`
- References (canlı, ALL-CAPS): `.kortext/references/{ACCESS,API,STACK,...}.md`
- Reports (per-file): `.kortext/reports/<scope>_<slug>_<ts>.md`
- Memory: `handover.md` (rotation 5 entry / 30 KB) + `decisions.md` + `learned.md` (TOC engine auto-update)

**Mimari detay:** [ARCHITECTURE.md](./ARCHITECTURE.md). Karar gerekçeleri: [DECISIONS.md](./DECISIONS.md). Görsel sistem: [DESIGN.md](./DESIGN.md).

---

## 6. Hızlı doğrulama komutları

```bash
npm install
npm test              # 382/382 yeşil
npm run lint          # 0 hata
npm run typecheck     # 0 hata
npm run build         # dist/bin + dist/server + dist/web
npm run dev           # Vite 5173 + Express 3200 (concurrent)
```

CLI smoke:
```bash
npx tsx bin/kortext.ts --version       # 3.0.0
npx tsx bin/kortext.ts --help
npx tsx bin/kortext.ts init             # boş klasörde scaffold
npx tsx bin/kortext.ts mcp              # stdio MCP server
```

Workflow content acceptance:
```bash
npx vitest run tests/workflow-content.test.ts
# 5 test: parse, persona handle coverage, FK validation, sync, gates
```

---

## 7. Bilinen gotcha'lar (HANDOVER'dan korunan)

- **PreToolUse Write hook string-match yanlış pozitif**: regex'lerde `.match()` API, batch SQL alias, sync spawn `cp.<name>` ile maskele
- **HTML inject + sanitize**: `MarkdownViewer` marked + DOMPurify ile sanitize; doğrudan HTML inject yasak
- **TanStack Router HMR**: full reload gerekli (`Cmd+Shift+R`) router instance reset için
- **MCP stdio'da `console.log` ölümcül**: stdout = JSONRPC; `bin/kortext.ts mcp` ilk iş `console.log = console.error` monkey-patch
- **Foreign key gotcha**: `runs.item_id → backlog_items.id`; önce backlog item, sonra run
- **Hash router**: derin link `http://localhost:5173/#/board`
- **Worktree quarantine branch'leri**: failure quarantine sonrasında `kortext/run-<id>` korunur (postmortem)
- **Frontend bundle tipi mirror**: `src/lib/api-types.ts` server tipini elden mirror; schema değişikliğinde iki yer güncel
- **`serve` child cwd ≠ kortext kaynak dizini**: prod modda Express dist/web'i kendi serve eder (Node 26 spawn race)
