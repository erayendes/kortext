# Kortext v1.0 — Architecture

Bu dosya v1.0'ın kanonik mimari referansı (vizyon v2, R1–R6 turu, 2026-08-30; karar: [DECISIONS.md](./DECISIONS.md) Bölüm 20). Eski v3.1 mimarisi: git geçmişi + Bölüm 18 gerekçesi. Eski kod referansı: `docs/codes/`.

---

## 1. Tek satır özet

> **Kortext = Faz A'da AKTİF proje beyni.** Kullanıcının kendi kurulu ajan CLI'ını (claude/codex/gemini) headless kendisi sürer; analiz belgeleri bağımlılık sırasıyla `draft` düşer, prime panelden onaylar/revize eder/sorar. Tüm belgeler yerleşince **el sıkışma**: Kortext emekli olur — belgeler projenin kutsal guideline'ı, `AGENTS.md` devir anayasası; sonrası kullanıcı ↔ kendi istemcisi. Kopeng opsiyonel tamamlayıcı ("Kopeng'e aktar" → `.kopeng/` görev bölmesi). Rapor özelliği YOK.

## 2. Bileşenler

```
kortext (npm, global)                     ~/.kortext/kortext.db (SQLite, tek DB çok proje)
└─ bin: kortext → serve + tarayıcı aç     tablolar: projects · settings · jobs
   ├─ Express sunucu (tek port, vars. 4200; --port/--db)
   │   ├─ REST /api/*   → panel (poll 3-5 sn; fs-watch yok)
   │   └─ motor         → runner.ts: adım promptu → CLI spawn (cwd=repo, prompt stdin)
   └─ React panel (ui/dist statik servis; dev'de vite :5300 proxy)
       ├─ Proje listesi + Proje ekle (New/Existing = workflow seçimi; Browse; kod; brief yaz/yükle)
       └─ Proje ekranı: tek Documents görünümü + el sıkışma kartı + (kopeng varsa) TransferPanel
```

- **Motor (`server/runner.ts`)**: `producibleSteps` workflow `inputs:/outputs:/approver:` alanlarından; girdileri `approved|not-applicable` olmayan adım koşulmaz. Paralel havuz MAX 3 + onayla uyanma (waker map). `runStep`: exit/çıktı/frontmatter doğrulama → jobs `done|failed`; boot'ta `failStaleJobs`, panelde Retry. `reviseDoc` = üretici adımın notlarla tekrar koşusu; `explainDoc` = satır-çapa geçici soru-cevap (hiçbir şey yazmaz); `runPlanning` = "Kopeng'e aktar" tek büyük koşu → `.kopeng/`.
- **Motor seçimi (`server/engines.ts`)**: `which` taraması; settings'te seçili motor; headless bayraklar motor başına (`claude --print --dangerously-skip-permissions` · `codex exec --sandbox workspace-write` · `gemini --yolo`).
- **Belgeler (`server/docs.ts`)**: kaynak-of-truth = dosya + frontmatter `status` (`uninitialized→draft→approved | not-applicable | log`). `listDocs` blocked/upstreamChanged hesaplar; `analysisComplete` = haritadaki her belge yerleşmiş (+ yeni projede BRD).

Belgeler **projenin kendi reposunda** — mühürlü yerleşim (§20): `.kortext/` kökü düz (ARCHITECTURE, STACK, STRUCTURE, API, DATABASE, SECURITY, DESIGN, TEST, LEGAL, GROWTH, CONTENT, ENVIRONMENT, DECISIONS.md `status: log`) · `foundation/` (BRD, PRD, TRD, PFD) · `.kopeng/` (yalnız aktarım sonrası). Workflows/personas projeye kopyalanmaz — Faz A'da promptun içine gömülür; sonrasında sözleşme = repo dosyaları.

## 3. Akış

1. **Proje ekle:** New → brief (yaz/yükle; kullanıcı brief'i `approved` düşer, zincir hemen başlar) · Existing → koddan (BRD'siz). Scaffold: kök `AGENTS.md` + `.kortext/` iskeletler.
2. **Analiz (Faz A):** motor adım adım koşar; her belge persona ağzından `draft`. Paralel bağımsız adımlar; onay = zincir tetiği.
3. **İnceleme:** drawer — Approve · satır seç → persona'yla inline sohbet (geçici) · notlar → Request revision (adım tekrar koşar) · doğrudan Edit · `not-applicable` gerekçeyle yerleşir.
4. **El sıkışma:** hepsi yerleşince tamamlanma kartı + istemci başlangıç komut kartları (tıkla-kopyala). Kortext'in işi biter.
5. **Kopeng (opsiyonel):** kopeng kuruluysa "Kopeng'e aktar" → `.kopeng/project.yaml + versions/ + epics/ + tasks/` (zengin gövde: Description · Functional Requirements · User Flow · UI Requirements · Technical Notes · Acceptance Criteria; `assignee: ai|prime`, `blocked_by/blocks`, `<KOD>-E01/-T001`). Plan özeti panelde; **Approve plan** = el sıkışmanın son imzası; Revise plan notla yeniden böler. `.kopeng/` düzeni taslak sözleşme — kopeng buna uyacak.

## 4. İçerik dosyaları (pakette)

- `workflows/` (3): new-project-analysis · existing-project-analysis (BRD'siz, ARCHITECTURE + ENVIRONMENT adımlı) · planning-pipeline (görev bölme sözleşmesi).
- `templates/`: AGENTS.md (devir anayasası) · core (13 iskelet) · foundation (BRD/PRD/TRD/PFD).
- `agents/` (11, Eray onaylı): compliance-expert, growth-expert, product-manager, copywriter, engineering-manager, security-engineer, designer, db-admin, qa-engineer, operation-manager, devops-engineer.

## 5. Sınırlar (bilinçli YOK'lar)

- Raporlar, istek kuyruğu, MCP sunucusu, `/api/agent/*` REST — **söküldü** (R6). Dış ajan analiz sırasında Kortext'le hiç konuşmaz.
- Worker pool, orchestrator/chainer, gate-engine, worktree, Slack/Telegram, model-atama — yok (arşiv: `docs/codes/`).
- Kortext LLM API çağırmaz, API anahtarı tutmaz — kullanıcının kendi CLI'ı ve aboneliği.
- Kopeng'e build-time/runtime bağımlılık yok (yalnız `which kopeng` tespiti).
