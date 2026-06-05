# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-06) — Tam zincir KESİNTİSİZ canlı koştu ✅ (§14.7–14.9)

**Bağlam:** Backlog enrichment (§14.7) + transient retry (§14.8) + delta köprüsü (§14.9) bitti ve **tam zincir gerçek-Claude ile kesintisiz tamamlandı (ilk kez)** — sandbox `kortext-live-uat-v2`. Detay [DECISIONS §14.7–14.9](./DECISIONS.md).

**Canlı sonuç:** onboarding → analiz (12 adım, 30 dk) → planning (9 adım, 56 dk) → Board. İki run da `succeeded`.
- **§14.7 (5/5 sütun, DB 127 item):** epics=18, parent=109, version=127, model=127, gates=97 (önceki koşuda 0/0/0). Synthetic epic fallback + step-8 konsolidasyon + rapor hepsi canlı çalıştı.
- **§14.9 hız:** qa 24→7dk, security 22→5dk, designer 22→3dk (3-7×). Planning ~56 dk (eskiden ~3 saat). gate union canlı birikti.
- **§14.8 retry:** önceki v2 koşusunda adım 9 transient socket hatasını retry'la kurtardı (canlı kanıt); bu koşuda gerek olmadı.

**Durum:** **767 test yeşil, typecheck temiz.** 7 lokal commit (`28f3b65`..`9c04fae`) main'de. **origin'e PUSH EDİLMEDİ.** **SIRADAKİ seçenekler:** (1) bu 7 commit'i push (Eray onayıyla); (2) `/api/backlog` limit=100 sayfalama follow-up'ı (127 item'da epic'leri kesiyor — Board görünümü); (3) codex/gemini executor'larına transient retry; (4) diğer açık işler ([TODO](./TODO.md)).

---

## Önceki devir (2026-06-05) — Backlog enrichment + step-8 bulgusu kapandı ✅

**Bağlam:** Canlı koşunun (§14.2) çıkardığı iki gerçek bulgu giderildi. Önceki devrin üç yıldızlı işinin tamamı (kapı Faz 2, ekran bug'ları, canlı koşu) + bu bulgular artık kapalı. Detay [DECISIONS §14.7](./DECISIONS.md).

**Kök neden (ortak):** headless Claude ajanı Kortext'in iç yardımcılarını (`writeReport`, MCP) değil **düz Write tool'unu** kullanıyor → kendi format/anahtarlarını uyduruyor. İki cepheli çözüm (Eray onayı: "ikisi birden" workflow+motor, "var olanı güncelle" upsert).

**(A) Epic/versiyon/model Board'a inmiyordu — 3 katman:**
1. **Upsert ingester** (`server/engine/backlog-ingest.ts` + `server/db/repositories/backlog.ts`): `ingestBacklogItems` artık var olan id'yi atlamıyor — planning kolonlarını **günceller** (yeni `updatePlanningFields`, `status`/`owner`'a dokunmaz), `updated[]` döner. Çok-adımlı pipeline her adımda backlog.yaml'i baştan yazınca uzman katkıları (gate/versiyon/model) birikiyor.
2. **Synthetic epic** (`deriveSyntheticEpics`): ajan düz `epic: "X"` etiketi (id değil) yazarsa gerçek `type: epic` türetir + bağlar (kemer+askı; düzgün `parent_epic`'te tetiklenmez).
3. **Workflow** (`workflows/planning-pipeline.md` yeniden yazıldı): ölü `update_backlog_item` MCP temizlendi; her adım "oku→uygula→bütün dosyayı yeniden yaz" + backlog.yaml'i **ek output** verir (token zinciri sıralar, backlog.yaml input'a girmez → DAG döngüsüz, `buildGraph` lineer 1→9 doğrular). Step-0 `type: epic`+`parent_epic` zorunlu.

**(B) Step-8 rapor FAILED — `server/engine/output-resolver.ts`:** `<ts>` pattern'i yalnız canonical `2026-06-05-1959` eşliyordu; ajan `…_20260605.md` yazınca dosya diskte olduğu halde "üretilmedi" dedi. Pattern gevşetildi (compact/date-only/with-time eşler, çöp reddedilir; canonical regresyonsuz).

**Kanıt:** **751 test yeşil** (745→751, +6 TDD test), typecheck temiz. Uçtan uca in-memory: skeleton→enriched ingest → 0 yaratım/3 güncelleme, Board **1 epic / 2 child / 3 version / 3 model** (canlı koşuda 0/0/0'dı). Fallback: düz `epic: Payments` → `epic-payments` türetildi.

**Durum:** Değişiklikler **henüz commit edilmedi** (working tree'de). Önceki 5 commit (`7e56755`, `575ca49`, `0620832`, `9ad605c`, `70080df`) main'de, **origin'e PUSH EDİLMEDİ.** **SIRADAKİ:** (1) bu işi commit et; (2) kesintisiz canlı koşu ile §14.7'yi gerçek-Claude'da doğrula (sandbox `kortext-live-uat` runbook'u TODO'da); (3) diğer workflow/persona dosyalarındaki ölü araç atıflarını temizle (deployment-cycle, hotfix, rollback, operation-manager, qa-engineer, engineering-manager — TODO'da).

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
