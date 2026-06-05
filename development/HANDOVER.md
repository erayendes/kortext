# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-05) — Canlı UAT + backlog file-ingestion köprüsü ✅

**Bağlam:** Gerçek bir BRD (`~/Downloads/BRD.md`, "Dinamik Hidrasyon Asistanı") ile `/Users/erayendes/Documents/_codebase/UAT` dizininde **canlı uçtan-uca UAT** (proje **HydroFlow**, executor=claude). Backend `cwd=UAT` ile çalıştırıldı (tüm `.kortext/` verisi UAT'a; kortext reposu temiz). Frontend: `.claude/launch.json > kortext-uat-web` (sadece vite, `/api`→3200 proxy).

**Vitrin doğrulandı:** onboarding + 14 ekran gerçek veriyle gezildi; onboarding gerçek analiz pipeline'ını tetikledi → gerçek Claude ajanları BRD'den **PRD/TRD/PFD + 9 referans** üretti.

**Bulunan + düzeltilen 4 UAT bug'ı:** `e6adc8b` Memory/Reports 500→boş liste (yeni projede `memory/` yokken ENOENT) · `bca744c` onboarding **analiz→planning zinciri** (backlog hiç türetilmiyordu) · `9614386` sabit "Acme CRM"→gerçek proje adı (`useProjectMeta`) · `30af9d8` Vite HMR createRoot uyarısı.

**Asıl iş — backlog file-ingestion köprüsü (DECISIONS Bölüm 13):** Otonom pipeline backlog'u **dolduramıyordu**. Önce MCP yaklaşımı denendi → **canlı testte çöktü** (headless ajanlar Write-tool/dosya ile çalışıyor, MCP çağırmıyor). Eray **"dosya köprüsü"** seçti → MCP commit'leri geri alındı (`busy_timeout` kaldı). Köprü: planning agent `.kortext/foundation/backlog.yaml` yazar → motor hook'u (`SafetyGuards.backlogIngester`, `server/engine/backlog-ingest.ts`) parse edip gerçek backlog satırlarına çevirir. Sağlamlık: fenced ```yaml fallback · out-of-enum tip coerce · bilinmeyen alan passthrough · **sessiz kayıp yok** (bozuk blok→hata + audit özeti) · idempotent.

**Canlı kanıt:** gerçek Claude ajanı BRD'den **83 item'lık temiz `backlog.yaml`** yazdı → ingester **83/0** satır → **Board'da 83 gerçek görev**. **721 test yeşil, typecheck temiz. main'e merge + origin'e push edildi.**

**Caveat'lar:** (1) bu koşuda `acceptance_criteria`/`review_gates` seyrekti (ajan kendi alanlarını kullandı, frontmatter'da korundu, kayıp yok) → zenginleştirme TODO'da. (2) Auto-fire B2 testinde kanıtlı ama tek-seferlik kesintisiz onboarding→Board (~25dk) koşusu yapılmadı. (3) Standalone `kortext start` `safetyGuards` almıyor → ingester sadece backend yolunda (onboarding/drive). **SIRADAKİ:** [TODO §"Backlog köprüsü — sonraki"](./TODO.md).

---

## Önceki devir (özet) — v6 hi-fi app + otonomi + motor

- **v6 hi-fi gerçek app'e indi (2026-06-04→05):** 14 ekranın tamamı React'te (`src/`) — Dashboard/Board/References/Memory/Reports + 4 project + 7 kortext settings + onboarding wizard + ⌘K + bildirim + terminal + light/dark tema. Paylaşılan primitifler: `FileBrowser`/`AnnotatableDoc`/`SettingsPane`/`Drawer`. Tasarım kaynağı `concepts/wireframe-v6-hifi.html`. Kararlar [DECISIONS §11–§12](./DECISIONS.md).
- **Üretim otonomisi (2026-06-04, `e209ac0`):** dashboard "Run once" + "Auto" toggle + `DriveScheduler` (60sn). Ana env kilidi (`KORTEXT_DRIVE_ENABLED`, varsayılan kapalı) üstünde ikinci toggle. Canlı kanıtlandı.
- **Motor/şema epic §5.9 TAMAM:** tek-item lifecycle + epic→staging + capstone + son montaj + `driveReadyItems` ("başlat düğmesi") + `POST /api/drive` (kilitli). Gerçek git ile to_do→done kanıtlı (`driver-e2e.test.ts`). Detay [DECISIONS §5](./DECISIONS.md).

---

## Açık işler (özet — tam liste [TODO.md](./TODO.md))

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
