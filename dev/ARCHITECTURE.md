# Kortext v1.0 — Architecture

Bu dosya v1.0'ın kanonik mimari referansı (E0–E5'te inşa edildi, 2026-08-28). Eski v3.1 mimarisi: git geçmişi + [DECISIONS.md](./DECISIONS.md) Bölüm 18 gerekçesi. Eski kod referansı: `docs/codes/`.

---

## 1. Tek satır özet

> **Kortext = projenin pasif beyni.** Ajan çalıştırmaz, LLM çağırmaz. Brief'ten analiz belgelerine giden süreci tanımlar (workflow md), dış coding ajanının (Claude Code/Codex) ürettiği belgeleri izler, prime onayından geçirir, rapor gösterir, istenirse kanonik `backlog.yaml` dışa aktarır. Görev takibi Kopeng'in işi (bağımsız uygulama; Kortext formatına uyar).

## 2. Bileşenler

```
kortext (npm, global)                     ~/.kortext/kortext.db (SQLite, tek DB çok proje)
└─ bin: kortext → serve + tarayıcı aç     tablolar: projects · requests · reports · transfers
   ├─ Express sunucu (tek port, vars. 4200)
   │   ├─ REST /api/*          → panel
   │   ├─ MCP  /mcp (HTTP)     → dış ajan: get_pending_requests · complete_request · get_project_context
   │   └─ fs-watch             → proje reposundaki .kortext/ belgelerini izler
   └─ React panel (statik servis)
       ├─ Proje listesi + Proje ekle (yeni: blueprint şablonu kopyalanır / mevcut: repo yolu)
       └─ Proje ekranı: Belgeler · Raporlar · Bağlantı
```

Belgeler **projenin kendi reposunda** yaşar (`.kortext/foundation/`, `.kortext/references/`, `.kortext/reports/`); Kortext DB'si yalnız kayıt/kuyruk/dizin tutar. Kaynak-of-truth = dosya + frontmatter `status`.

## 3. Akış

1. **Brief:** `blueprint.md` (şablon `templates/`den) → panelde Approve (`draft→approved`).
2. **Bağlantı:** panel komut kartı: CLI one-liner (`cd <repo> && claude "AGENTS.md'yi oku, analize başla"`) ya da desktop prompt; + `claude mcp add --transport http kortext http://localhost:4200/mcp` (tek sefer).
3. **Analiz:** ajan AGENTS.md kontratını okur. Workflow adımlarındaki `inputs:/outputs:/approver:` alanları = bağımlılık haritası (panel de aynı alanlardan çizer). Kural: bağımsız belgeler hemen (`draft`); **bağımlı belge, üstündeki `approved` olmadan yazılmaz**; her adım başında istek kuyruğu kontrol edilir.
4. **Onay/revize:** panelde belge drawer'ı — Approve · satır notu + "Revize iste" (istek kuyruğuna) · doğrudan düzenleme. Onaylıya revize → durum düşer, bağımlılara "üstü değişti" uyarısı.
5. **Planlama (yalnız istekle):** "Kopeng'e aktar" → planlama isteği → ajan planning-pipeline koşar → `backlog.yaml` + `TODO.md` → prime onayı. Şema donuk sözleşme (version/epic/task, `blocked_by`, atama `ai`/`prime`). Canlı Kopeng push'u: kopeng hazır olunca ince adapter.
6. **Raporlar (kullanıcı tetikler):** Değişiklik = deterministik (git + belge hareketi). Risk & Öneri, Karar Özeti = istek kuyruğu → ajan yazar → panel gösterir. İlerleme = Kopeng bağlanınca.

## 4. İçerik dosyaları (repo'da canlı)

- `workflows/` (3): new-project-analysis · existing-project-analysis · planning-pipeline — adımlar `inputs/outputs/approver` taşır; motor-dönemi adımları (model/persona ataması) E3/E5'te tıraşlanır, her adıma `approver: +prime` eklenir.
- `templates/`: AGENTS.md tabanı · foundation (BRD/PRD/TRD/PFD) · references (STACK, SECURITY, API, …13) · reports (E4'te 4'e damıtılır) · backlogs · memory.
- `agents/` (11, Eray onaylı): compliance-expert, growth-expert, product-manager, copywriter, engineering-manager, security-engineer, designer, db-admin, qa-engineer, operation-manager, devops-engineer. `rules/` yok — özü AGENTS.md içinde.

## 5. Sınırlar (bilinçli YOK'lar)

- Worker pool, executors, orchestrator/chainer, gate-engine, worktree yönetimi, Slack/Telegram, model-atama — **yok** (arşivde: `docs/codes/`).
- Kortext hiçbir zaman ajan başlatmaz; kullanıcı kopyala-yapıştır bağlar.
- Kopeng'e build-time/runtime bağımlılık yok.
