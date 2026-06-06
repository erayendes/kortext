# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-06) — UI fazlarının TAMAMI (1+2+4+3) BİTTİ ✅; faz-3 canlı koşuyla doğrulandı

**Faz 3 (persona kalibrasyonu) — taze canlı koşu `kortext-live-uat-v3` ile doğrulandı.** Yeni sandbox sıfırdan koştu (onboarding TaskFlow BRD → analiz → planning, iki run da `succeeded`, 102 item / 86 task + 16 epic). Auto-approve poller +prime gate'lerini sürdü. Sonuç **kısmi ama ana hedefler tuttu:**
- ✅ **item-id:** 86 task hepsi `TF-001`…`TF-086` (slug→`<CODE>-NNN` çözüldü).
- ✅ **memory:** `.kortext/memory/decisions.md` 15KB gerçek ADR günlüğü (analiz+planning yazdı).
- ✅ **dependency UI:** `dependenciesOf` frontmatter okuyor + drawer Dependencies bölümü (synthetic dep ile kanıtlandı).
- ⚠️ **KALAN:** dependency ÜRETİMİ (ajan 0 üretti — yalnız görsel boşluk, motor kullanmıyor) + epic-id (ajan `TF-E01` uygulamadı, slug kaldı). Eray: şimdilik ertele ([TODO §D](./TODO.md)).
- **Bonus:** inşaat-fazı paralelliği 6 görev / 12 worktree'ye çıkarıldı (Eray "orta", `server-drive.ts`).

**⚠️ Backend artık v3'ü gösteriyor:** port `:3200` cwd=`kortext-live-uat-v3` (v2 değil). v2 verisi diskte duruyor. Eski UI bulguları v2'de keşfedildi; v3 = kalibre koşu.

---

## Önceki bu-devir özeti — UI fazı 1+2+4 (UAT bulguları)

**Bağlam:** Tam zincir kesintisiz canlı koştu (§14.7–14.9, sandbox `kortext-live-uat-v2`, 127 item/18 epic — detay [DECISIONS §14.7–14.9](./DECISIONS.md)). Eray canlı veriyi gerçek UI'da gezip ~18 UAT bulgusu verdi; sıra **1→2→4→3**. **1, 2, 4 tamamlandı ve canlı tarayıcıda doğrulandı.** Hepsi "veri doğru, UI bağlı değil" türündendi — motorda değişiklik gerekmedi.

**Bu devirde yapılanlar (4 yeni lokal commit `2f0cbf6`..`96be236`):**
- **Faz 1 — veriyi bağla:** epic kolonu (`?limit=500`), assignee (`assigneeOf` owner→frontmatter), versiyon filtresi (`VersionSelect` + en-küçük-bitmemiş varsayılan, semver sort), Dashboard activity timeline (yeni `GET /api/activity` küratörlü audit feed + `describeAuditEvent`).
- **Faz 2 — eksik özellikler:** doküman scroll (`.fb-view min-height:0`), "New" görev gerçek in-app form (prompt→form, POST `version` kabul eder), item yorumu (`POST .../comment`→audit_log, drawer+timeline aynı feed), çalışan Assignee filtresi (+ per-item feed küratörü; "Group:Epic" pill kaldırıldı).
- **Faz 4 — agents/ikonlar:** Agents paneli `deriveActiveAgents` (yalnız açık-görevli ajan + statü, açıklamasız); persona ikon seti Eray'ın seçimiyle güncellendi (`persona-colors.ts`).

**Durum (tüm fazlar):** **807 test yeşil** (767→807, +40 TDD), typecheck temiz, konsol hatasız. Yeni saf-mantık modülleri: `agents-panel.ts` + board-drawer'a `assigneeOf`/`assigneesOf`/`compareVersions`/`sortedVersions`/`defaultActiveVersion`/`dependenciesOf`. **Bu oturumda main'e ~19 lokal commit (`28f3b65`..`6e71a39` + bu docs commit'i), origin'e PUSH EDİLMEDİ.**

**SIRADAKİ:** UI UAT fazlarının tamamı kapandı. Açık işler: (1) faz-3 kalan boşlukları (dependency üretimi + epic-id — [TODO §D](./TODO.md), ertelendi); (2) lokal commit'leri push (Eray onayıyla); (3) [TODO](./TODO.md)'daki diğer kuyruk (motor backend dilimleri, CLI redesign, paketlenmiş UAT, v3.1.0 release).

**Canlı sandbox + sunucular AYAKTA:** Backend `:3200` cwd=`kortext-live-uat-v3` (kalibre koşu, 102 item / 86 task `TF-NNN` + 16 epic + `memory/decisions.md`). Eski v2 (127 item) diskte duruyor. vite önizleme `:5173` (preview MCP `kortext-uat-web`) /api'yi 3200'e proxy'ler. (Düşerse: `cd kortext-live-uat-v3 && KORTEXT_PORT=3200 npx --prefix <repo> tsx <repo>/server/index.ts &`; server dosyası düzenlenince elle restart — `tsx watch` değil.)

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
