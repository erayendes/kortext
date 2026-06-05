# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-05) — Workflow kuralları runtime'a bağlandı + sistem-geneli paralellik ✅

**Bağlam:** Eray tespit etti — canlı UAT'ta sistem **workflow'ların içindeki kuralları atlıyordu**: artifact onay kapıları +prime'a hiç düşmedi, epic/versiyon üretilmedi, persona modelleri seçilmedi. Kurallar workflow dosyalarında doğru yazılıydı ama runtime uygulamıyordu (onboarding, kapı-denetleyicisiz `startCommand` kısayolundan gidiyordu). Detay [DECISIONS Bölüm 14](./DECISIONS.md).

**Üç dilim (paralel ajanlarla):** (1) **Onay kapıları bağlandı** — `QueueGateController` (`server/orchestrator/queue-gate-controller.ts`) mevcut `ApprovalQueue`+REST uçlarına bağlanır, onboarding koşusuna geçer; `pending_questions`'a `artifact_path`/`persona`/`phase` (migration 007). (2) **Epic/versiyon/model** — `backlog-ingest` artık `version`/`parent_epic`→sütun eşler + yeni `model` sütunu (migration 008) + `planning-pipeline.md` bunları üretir (DB sütunları zaten vardı). (3) **"Proje hazırlanıyor" timeline ekranı** (`src/routes/initializing.tsx`).

**Kritik düzeltme — DAG-paralel kapılar:** Eray "LEGAL ∥ GROWTH paralel olmalıydı" dedi (ilke: koşabilen her şey paralel). Kök sebep: `worker-pool` kapıyı **adım index'ine** + tekil `pendingGate`'e bağlamıştı → seri. Çözüm: kapı per-step + **DAG bağımlılığına** bağlandı (`gateByStepKey`/`gateApproved`); birden çok kapı aynı anda pending olabilir. **Canlı kanıt:** `/api/questions` aynı anda **2 açık kapı** (LEGAL+GROWTH); GROWTH onaylanınca PRD belirmedi, LEGAL de onaylanınca belirdi. Seçilen semantik (Eray): **"onaylanan kalır, revize tek başına döner"** — ama **FAZ 2 açık** (reject hâlâ tüm run'ı abort ediyor).

**Sistem-geneli paralellik (driver):** `pool.ts` `mapWithPool` ile dev-cycle Phase 2 (test gate'leri) tam paralel; Phase 3 yargılar paralel ama **git merge'ler seri** (paylaşılan `development` dalı). `review-cycle` `judgeReview`/`runClosure` olarak bölündü.

**Durum:** **744 test yeşil, typecheck temiz.** İki lokal commit (`237acc6` kapılar, `e9efac2` driver) + üç dilim main'de. **origin'e PUSH EDİLMEDİ.** **SIRADAKİ:** [Açık işler](#açık-işler-özet--tam-liste-todomd) — ekran bug'ları / kapı Faz 2 / canlı koşu.

---

## Önceki devir (özet) — backlog köprüsü + v6 hi-fi app + otonomi + motor

- **Canlı UAT + backlog file-ingestion köprüsü (2026-06-05, [DECISIONS §13](./DECISIONS.md)):** MCP yaklaşımı canlı testte çöktü (headless ajan Write-tool kullanıyor) → Eray "dosya köprüsü" seçti. Planning agent `.kortext/foundation/backlog.yaml` yazar → `backlog-ingest.ts` parse eder. Gerçek ajan BRD'den 83 item yazdı → Board'da 83 görev. main'e push edildi.
- **v6 hi-fi gerçek app'e indi (2026-06-04→05):** 14 ekranın tamamı React'te (`src/`) — Dashboard/Board/References/Memory/Reports + 4 project + 7 kortext settings + onboarding wizard + ⌘K + bildirim + terminal + light/dark tema. Paylaşılan primitifler: `FileBrowser`/`AnnotatableDoc`/`SettingsPane`/`Drawer`. Tasarım kaynağı `concepts/wireframe-v6-hifi.html`. Kararlar [DECISIONS §11–§12](./DECISIONS.md).
- **Üretim otonomisi (2026-06-04, `e209ac0`):** dashboard "Run once" + "Auto" toggle + `DriveScheduler` (60sn). Ana env kilidi (`KORTEXT_DRIVE_ENABLED`, varsayılan kapalı) üstünde ikinci toggle. Canlı kanıtlandı.
- **Motor/şema epic §5.9 TAMAM:** tek-item lifecycle + epic→staging + capstone + son montaj + `driveReadyItems` ("başlat düğmesi") + `POST /api/drive` (kilitli). Gerçek git ile to_do→done kanıtlı (`driver-e2e.test.ts`). Detay [DECISIONS §5](./DECISIONS.md).

---

## Açık işler (özet — tam liste [TODO.md](./TODO.md))

- **⭐ "Proje hazırlanıyor" ekranı — etkileşim bug'ları (Bölüm 14):** (1) Sidebar "Setup" linki hash-farkında değil (`/initializing#/initializing` → Dashboard'a düşüyor); (2) satırdaki **Onayla `stopPropagation` eksik** → tıklama drawer açıyor, onaylamıyor; (3) drawer içi onay/revize aksiyonları; (4) <500px responsive overlap. Şu an onay **Dashboard "For review" kartından** çalışıyor.
- **⭐ Kapı Faz 2 — "revize tek başına döner":** Analiz kapıları artık DAG-paralel ([DECISIONS §14.2](./DECISIONS.md)) ama `reject` hâlâ **tüm run'ı abort** ediyor. Eray'ın seçtiği semantik (onaylanan kalır, sadece revize edilen yeniden üretilir) için `worker-pool` reject + `Orchestrator.retryRun` ayıklanmalı.
- **⭐ Canlı koşu — epic/versiyon/model + dev-cycle paralelliği:** ingestion + driver paralelliği **test yeşil** ama gerçek-Claude ile canlı kanıtlanmadı (~25dk). Mock ile analiz kapıları kanıtlandı.
- **Concurrency knob'ları:** workflow-içi `concurrency=3`, `maxConcurrentWorktrees=10` — ayarlanabilir tavanlar (Eray isterse yükseltilir).
- **Backlog köprüsü follow-up:** zenginleştirme (sonraki planning adımlarını da ingest), standalone CLI'a ingester bağla, kesintisiz canlı koşu. [TODO](./TODO.md).
- **Motor — ertelenen backend dilimleri:** handover-on-close, blocker-temizle, `gate_runs` uat verdict, epic-status-flip, gate-persona staging raporları + prime staging onayı, preview wiring/persistence. [TODO §"Motor epic"](./TODO.md).
- **v3.1 CLI/onboarding redesign:** multi-project daemon, postinstall onboard, native folder picker, 9 komutluk CLI. Yön [DECISIONS Bölüm 0](./DECISIONS.md), sıralı kuyruk [TODO](./TODO.md).
- **v3.0.1 borç:** `app.listen()` EADDRINUSE silent-fail handler.
- **Manuel UAT (paketlenmiş):** `npm pack` + global install + `kortext init/serve` ile **paketlenmiş** akış doğrulaması (kaynak değil — bu oturum kaynak-modda UAT yaptı).
- **v3.1.0 release flow** + **içerik review turu** (personas/rules/workflows/templates kalibrasyon). [TODO](./TODO.md).

---

## Sabitler (her oturum)

- **Eray:** non-coder, Türkçe konuşur, kod+commit+yorum İngilizce, GUI-first, somut artefakt ister (screenshot/dosya yolu/çalışan önizleme).
- **Mimari/UX kararları:** `AskUserQuestion` ile **sade dille** (jargon değil, öneri başa). Büyük kararları Eray onaylar.
- **Push kuralı:** `origin/main`'e Eray **açıkça "push"/"merge" demeden** push YOK. Lokal commit serbest.
- **Önizleme tuzakları (kayıtlı):** `tsx watch` server dosyası düzenlenince restart olur → düşerse `preview_start`. `preview_eval` reload/animasyonda flaky → reload AYRI çağrıda, kısa senkron eval tercih et. `preview_screenshot` 1-2 kare geride olabilir → ölçü/durum için `getComputedStyle`/DOM teyidi (screenshot ikincil).

## Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) · Kararlar: [DECISIONS.md](./DECISIONS.md) · Tasarım: [DESIGN.md](./DESIGN.md) · Açık iş: [TODO.md](./TODO.md) · UAT: [UAT-GUIDE.md](./UAT-GUIDE.md) · Davranış+dosya haritası: [../CLAUDE.md](../CLAUDE.md)
