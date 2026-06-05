# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-05) — Kapı Faz 2 (revize tek başına döner) + ekran bug'ları kapandı ✅

**Bağlam:** Önceki devirde açık kalan üç yıldızlı işten ikisi (kod tarafı) bitti + tarayıcıda kanıtlandı. Üçüncüsü (gerçek-Claude canlı koşu) hâlâ açık. Detay [DECISIONS Bölüm 14.2/14.5](./DECISIONS.md).

**Dilim 1 — Kapı Faz 2 "revize tek başına döner" (commit `7e56755`):** `reject` artık run'ı **abort etmiyor**. Kök değişiklik `worker-pool`'da: tekil `rejectionReason` + paylaşılan `aborter.abort()` kaldırıldı; bir kapı reddedilince **sadece o adım** yerinde yeniden üretiliyor — `done`'dan düşür + `firedGates`'ten temizle → scheduler aynı adımı yeniden başlatır, bitince kapısı yeniden ateşlenir. Onaylanan kardeş kapılar `gateApproved`'da durur. Revize nedeni `ExecutorContext.reviseFeedback` ile re-execution'a taşınır (claude prompt'una "⚠ REVISION REQUESTED" olarak girer, tek-seferlik). `retryRun` artık yalnız crash-recovery (`orphaned:`) için — kapı reddi artık `cancelled` run üretmiyor. **Yeni paralel test:** LEGAL∥GROWTH'ta GROWTH bir kez reddedilip yeniden üretiliyor + onaylanıyor, LEGAL'in onayı dokunulmadan duruyor, PRD ikisi de onaylanınca koşuyor.

**Dilim 2 — "Proje hazırlanıyor" ekran bug'ları (commit `575ca49`):** Dördü de çözüldü + tarayıcıda kanıtlandı (375px screenshot + DB teyidi). (1) `main.tsx` hash deep-link normalizer — çıplak `/initializing` router mount'tan önce `/#/initializing`'e `replaceState`'leniyor, Dashboard'a düşmüyor; (2) satır Onayla = gerçek `<button>` + `stopPropagation` → drawer açmadan inline onay (`/api/questions/:id/answer`; DB'de `answered`/`approve`/`prime` doğrulandı); (3) satır Revize drawer'ı doğrudan revize modunda açıyor (`initialRevise` prop); (4) `@media (max-width:560px)` — sidebar 52px ikon-moduna iniyor, satır butonları kırpılmıyor (edge 338<375), drawer tam-genişlik. Desktop'ta sızma yok (835px'te sidebar 212px).

**Dilim 3 — Canlı koşu (gerçek Claude) ✅ + 2 bulgu:** Sandbox `kortext-live-uat`'ta tam zincir koştu (onboarding TaskFlow BRD → analysis 12 adım → planning-pipeline → Board 100 item). **§14.2 canlı kanıtlandı:** LEGAL∥GROWTH iki kapı aynı anda; LEGAL onay (durdu), GROWTH revize → tek başına yeniden üretildi (251→184 satır), **Claude revize feedback'ini prompt'tan aldı** (frontmatter'a birebir `revision_note: …ASO and paid channels removed; KPIs limited to 3` yazdı), `regenerate_step: product-analysis.2`, run abort YOK. **Bulgular (TODO'da detaylı):** (A) epic/version/model Board'a inmiyor — `backlog.yaml` yalnız step-0'da yazılıyor (enrichment adımları yeniden yazmıyor) + alan-adı uyuşmazlığı (`epic:` vs ingester `parent_epic:`) + hiç `type: epic` item yok → sütunlar 0; (B) step-8 konsolidasyon FAILED (declared report output pattern eşleşmedi, dosya yazılmış olsa da). Bunlar §14.2 işini etkilemez — planning-pipeline persona/köprü kalibrasyonu işi.

**Durum:** **745 test yeşil, typecheck temiz, console hatasız.** Üç yeni lokal commit (`7e56755` kapı Faz 2, `575ca49` ekran, `0620832` docs) main'de. **origin'e PUSH EDİLMEDİ.** **SIRADAKİ:** Canlı koşunun çıkardığı **backlog enrichment + step-8 bulgusu** (TODO ⚠️) — planning-pipeline persona talimatları + köprü kalibrasyonu. Sandbox `kortext-live-uat/.kortext/` inceleme için duruyor.

---

## Önceki devir (özet) — backlog köprüsü + v6 hi-fi app + otonomi + motor

- **Canlı UAT + backlog file-ingestion köprüsü (2026-06-05, [DECISIONS §13](./DECISIONS.md)):** MCP yaklaşımı canlı testte çöktü (headless ajan Write-tool kullanıyor) → Eray "dosya köprüsü" seçti. Planning agent `.kortext/foundation/backlog.yaml` yazar → `backlog-ingest.ts` parse eder. Gerçek ajan BRD'den 83 item yazdı → Board'da 83 görev. main'e push edildi.
- **v6 hi-fi gerçek app'e indi (2026-06-04→05):** 14 ekranın tamamı React'te (`src/`) — Dashboard/Board/References/Memory/Reports + 4 project + 7 kortext settings + onboarding wizard + ⌘K + bildirim + terminal + light/dark tema. Paylaşılan primitifler: `FileBrowser`/`AnnotatableDoc`/`SettingsPane`/`Drawer`. Tasarım kaynağı `concepts/wireframe-v6-hifi.html`. Kararlar [DECISIONS §11–§12](./DECISIONS.md).
- **Üretim otonomisi (2026-06-04, `e209ac0`):** dashboard "Run once" + "Auto" toggle + `DriveScheduler` (60sn). Ana env kilidi (`KORTEXT_DRIVE_ENABLED`, varsayılan kapalı) üstünde ikinci toggle. Canlı kanıtlandı.
- **Motor/şema epic §5.9 TAMAM:** tek-item lifecycle + epic→staging + capstone + son montaj + `driveReadyItems` ("başlat düğmesi") + `POST /api/drive` (kilitli). Gerçek git ile to_do→done kanıtlı (`driver-e2e.test.ts`). Detay [DECISIONS §5](./DECISIONS.md).

---

## Açık işler (özet — tam liste [TODO.md](./TODO.md))

- **⭐ Backlog enrichment + step-8 (canlı koşu bulgusu):** Canlı koşu §14.2'yi kanıtladı ama (A) epic/version/model Board'a inmiyor (`backlog.yaml` yalnız step-0'da yazılıyor + `epic:` vs `parent_epic:` alan uyuşmazlığı + hiç `type: epic` item yok) ve (B) step-8 konsolidasyon FAILED (rapor output pattern). Çözüm: planning-pipeline persona talimatları + köprü kalibrasyonu (alttaki "Backlog köprüsü zenginleştirme" ile birleşir). Detay [TODO ⚠️](./TODO.md).
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
