# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-08) — Onboarding-driven directory + otomatik git TAMAM ✅

Eray UAT'tan sonra: "dizini niye iki kez soruyorsun, daha projem yok ki — onu onboarding'de seçiyorum." → tam bir tasarım turu (brainstorming → spec → plan → subagent-driven 9 görev). **Yeni akış:** non-coder herhangi bir yerde **`kortext start`** yazar → tarayıcıda sihirbaz açılır → proje bilgisi + BRD + **proje dizinini sihirbazda seç** → Kortext o klasörü iskeler, **git'i otomatik kurar** (init+commit+`development`), gerçek daemon'u doğurur, tarayıcı oraya geçer, **analiz kendiliğinden başlar**. Elle `cd`/`git` YOK.

**Mimari (1 daemon:1 klasör:1 port kısıtı):** çıplak `kortext start` → geçici **bootstrap sihirbaz daemon'u** (`KORTEXT_BOOTSTRAP=1`, scratch home, `:3199`, kayıtsız) → submit'te blueprint route'un bootstrap dalı `createProjectAndLaunch` (iskele→`bootstrapGit`→BRD/meta→gerçek daemon doğur) → `handoffUrl` → tarayıcı yönlenir → gerçek daemon boot'ta `autoStartPendingAnalysis` (idempotent). Detay [DECISIONS §7.11](./DECISIONS.md) · [spec](../docs/superpowers/specs/2026-06-07-onboarding-driven-directory-design.md) · [plan](../docs/superpowers/plans/2026-06-07-onboarding-driven-directory.md).

**⭐ Final review KRİTİK bug yakaladı:** `KORTEXT_BOOTSTRAP=1` `spawnDaemon`'un `{...process.env}` mirası ile gerçek daemon'a sızıyordu → gerçek daemon kendini wizard sanıp **analizi hiç başlatmıyordu** (özellik sessizce ölü; unit testler spawn'ı mock'ladığı için kaçırmıştı). Fix: env'de `KORTEXT_BOOTSTRAP: ''` ile temizle (wizard'ın `cmd.env`'i korunur) + regresyon testi.

**Durum:** **1003 test yeşil**, typecheck + build temiz. Feature `main`'e lokal merge + bellboy self-shutdown (commit `0cd736d`) + docs, hepsi lokal, **push EDİLMEDİ.** postinstall + UAT-GUIDE + UAT-SESSION-PROMPT yeni akışa güncellendi. **SIRADAKİ:** push (sen "push" deyince) + `npm publish` + senin GUI-UAT turun.

---

## Önceki bu-devir (2026-06-07 #2) — Gerçek prod merge + tam sayfalama + vocab TAMAM ✅

Eray "3,5,6,8,9'u yap" dedi → sonuç: **#3 gerçek git prod release** (`deployProd` artık gerçek `development→main` merge + version tag; çakışma→bug; idempotent; sunucu orijinal branch'e döner; prod-push CI hâlâ mock). **#5 tam sayfalama** (`GET /api/backlog/aggregate` — roll-up/facet/per-version açık-iş sunucu-tarafı + "Daha fazla yükle" kart sayfalaması). **#8 vocab toleransı belgelendi**. **#6 (dashboard boş-durum) + #9 (CLI nüansları) zaten bitmişti** — Eray onayıyla ek yapılmadı. Final review 4 bulgu buldu+düzeltildi (branch-restore, conflict-flag scope, drawer-progress aggregate, version-flicker). Detay [DECISIONS §7.10](./DECISIONS.md).

**Durum:** **977 test yeşil**, typecheck + build temiz. Bu blok +4 commit (`f2fb20c`..`bab0c77`), **push EDİLMEDİ** (toplam bekleyen: bu blok). **SIRADAKİ:** push (sen "push" deyince) + `npm publish`.

---

## Önceki bu-devir (2026-06-07) — Preprod substratı + CANLI KOŞU TEYİDİ TAMAM ✅

**Preprod substratı:** §5.11 zinciri tamamlandı — `deployPreprod` + `deployProd` (mock-first) Deployer'a eklendi; version staging-onaylanınca `deployPreprod`→`preprod-approval` sorusu; `consumePreprodApproval` (onay→epic'ler `preprod_approved` + `deployProd` mekanik release; red→bug; idempotent) + route. Zincir preprod-onayında biter (prod gate'i yok, §5.11). Gerçek git main-merge/tag mock `deployProd`'a foldlandı (follow-up).

**⭐ CANLI KOŞU TEYİDİ — gerçek claude ajanı, izole sandbox (DevVault, code DV):** Gerçek planning ajanı 39 item + 6 epic üretti. **Sonuç:**
- ✅ Kodlu id'ler kusursuz: `DV-001`…`DV-039` + sentetik epic'ler `DV-E01`…`DV-E06`.
- ✅ **Bağımlılıklar GERÇEKTEN üretildi** (39 item, mantıksal zincirler) — A2 talimat pekiştirmesi tuttu, esas belirsizlik çözüldü.
- 🐛 **Canlı koşu gerçek bir kalibrasyon boşluğu yakaladı** (unit-test'in yakalayamayacağı): ajan `depends_on` yazdı (motorun beklediği `blocked_by` değil). **Fix: ingester `depends_on`'u `blocked_by` alias'ı kabul ediyor** ("LLM'i olduğu yerde karşıla"). Tip (`feature/chore`→`task`), status (`todo`→`to_do`), epic-etiketi→sentetik-epic normalizasyonları zaten çalışıyordu.
- ✅ **Fix sonrası gerçek veride uçtan uca:** 39'un **38'i auto-block**, simetri türetildi, DV-001 kapanınca bağımlıları `to_do`'ya döndü ama **çoklu-blocker'lı DV-005 `blocked` kaldı** (doğru semantik). Bağımlılık-sıralı yürütme gerçek LLM çıktısında çalışıyor.

**Not (kazı):** `dev:run --executor=claude` için `--binary`/`KORTEXT_CLAUDE_BIN` şart. Full pipeline (9 adım gerçek-LLM) bir sonraki zenginleştirme adımında ~70 dk askıda kaldı (kill); step-1 backlog'u (esas artefakt) erkenden üretmişti.

**Durum:** **951 test yeşil**, typecheck temiz. Bu blok (preprod + alias) +2 commit → bu oturum toplam **bekleyen 10 commit** (`710a0df`..`6a9d683`), push EDİLMEDİ. **SIRADAKİ:** push (sen "push" deyince) + `npm publish`. Kalan follow-up'lar aşağıda + [TODO](./TODO.md).

---

## Önceki bu-devir — Motor takibi + CLI sertleştirme + sayfalama TAMAM ✅

Eray'ın seçtiği 3 blok ([plan](../docs/superpowers/plans/2026-06-07-motor-cli-pagination.md), 3 paralel keşif → karar → TDD subagent'ları). **Hiç yeni migration gerekmedi** — biri hariç: staging metadata için `010` (nullable ADD COLUMN, güvenli).

**🔧 Motor takibi:**
- ✅ **Blocker-clear** (kararın: otomatik 'blocked' — dürüst board): ingest'te bağımlılığı bitmemiş item'lar oto-`blocked`; kapanışta bağlı item'lar oto-`to_do` (driver tekrar alır — `in_progress` DEĞİL, yoksa takılırdı). Frontmatter tabanlı, DB kolonu yok. Bu, **bağımlılık-sıralı yürütmeyi uçtan uca işler hale getirdi.** (Eski Slice 2 ertelemesi — migration gerekmeden çözüldü.)
- ✅ **Staging-onay tüketicisi** (kararın: tam zincir): prime onay→epic raporları 'approved' + epic `staging_approved` + **version-tamamlama** (bir version'ın tüm epic'leri onaylanınca `preprod-approval` sorusu); red→motor gerekçeyle **bug açar**. Cevap route'ta işleniyor. Staging raporları artık **gerçek dosya** (`writeReport`), epicId/version soru `metadata`'sında.
- ⚠️ **Preprod DEPLOY substratı yok** — sadece preprod-onay sorusu açılıyor (preprod ortam hedefi ayrı follow-up, [TODO](./TODO.md)).

**🖥️ CLI sertleştirme:**
- ✅ Paralel-`start` yarış kilidi (`server/registry/lock.ts`, sync O_EXCL + stale-reclaim; allocate+write kilit içinde, taze re-read). ✅ `allocatePort` tükenme mesajına kurtarma ipucu. ✅ Yeni-proje kaydı spawn'dan önce persist edilir.

**📐 Teknik borç:**
- ✅ Sayfalama küçük adım: `/api/backlog` `total` + `offset` döner, cap 2000'e çıktı, board "N / M gösteriliyor" der. Epic roll-up korundu (filtre-öncelikli model, full fetch kalıyor). Tam sayfalama (~500+ item olunca) hâlâ TODO.

**Final inceleme 2 bulgu buldu+düzeltildi:** (1) route consumer'ı fire-and-forget'ti → `await` edildi (yan etkiler 200'den önce durable); (2) `checkVersionCompletion` idempotent değildi → çift `preprod-approval` engellendi (+ regresyon testi).

**Durum:** **929 test yeşil** (807→929, +122 TDD bu oturum), typecheck temiz, build başarılı. Bu blokta 7 yeni commit (`710a0df`..`2537c12`). v3.1 + tüm fazlar dahil **toplam 25 commit push edildi `origin/main`'e (1971b1b'e kadar)**; bu blok (`1971b1b`..`2537c12`, 7 commit) **henüz push EDİLMEDİ.**

**SIRADAKİ:** push (sen "push" deyince). Açık follow-up'lar [TODO](./TODO.md): preprod deploy substratı, bağımlılık üretimi canlı-koşu teyidi, tam sayfalama (gerekince). Sonra `npm publish` + senin GUI-UAT turun.

---

## Önceki devir (2026-06-06) — Faz-3 boşlukları + Motor dilimleri + İçerik kalibrasyonu TAMAM ✅

Eray'ın seçtiği 3 alan ([plan](../docs/superpowers/plans/2026-06-06-phase3-engine-content.md), 3 paralel keşif ajanıyla haritalandı, TDD subagent'larıyla koşturuldu):

**A — Bağımlılık üretimi + epic-id** (motor enforcement; ajan-yazar + motor-doğrular kararı):
- ✅ Kodlu epic id'leri `<CODE>-E0N` — `deriveSyntheticEpics`'e `code` `server/index.ts` hook'undan geçirildi. **Entegrasyon bug'ı yakalandı+düzeltildi:** hook proje kökünü `dirname×2` ile çözüyordu (`.kortext` veriyordu) → `dirname×3` (gerçek kök) — yoksa `code` çözülmez, epic-id slug'a düşerdi.
- ✅ Motor simetri zorlaması (`enforceSymmetricDeps`, additive) + dangling-ref audit uyarısı. Workflow talimatı (planning-pipeline) zaten güçlüydü, pekiştirildi.

**B — Motor ertelenen dilimleri** (Slice 2/blocker-clear hariç — şema migrasyonu gerek, yine ertelendi):
- ✅ **Slice 3:** UAT verdict artık `gate_runs` satırı (attempt = önceki uat + 1, UNIQUE çakışması çözüldü).
- ✅ **Slice 4:** epic'in tüm çocukları bitince epic board'da `done` (direct write + audit, idempotent).
- ✅ **Slice 1:** handover-on-close — `HandoverEngine` closure'a bağlandı. **Final inceleme 2 boşluk buldu+düzeltildi:** driver `handoverEngine`'i `runClosure`'a geçirmiyordu (sessiz no-op) + `record()` sentetik `+prime` handle'ını reddediyordu (prod'da hiç yazılmazdı). Driver thread + `SYNTHETIC_PERSONA_HANDLES` izni + driver-e2e guard test eklendi.
- ✅ **Slice 6:** preview URL kalıcılığı — migration `009`, `backlog_items.preview_url`, `frontmatter.preview` flag ile gate'li, API'de açık.
- ✅ **Slice 5:** staging raporları (`reports_index` gate-persona başına) + prime staging-onay sorusu (`run_id=null`; `ApprovalQueue.enqueue` gevşetildi). Yeni `staging-approval.ts`.

**C — İçerik kalibrasyonu** (tam):
- ✅ Ölü MCP tool refs (`write_learned`/`write_decision`/`get_backlog_item`) → gerçek dosya-yazım/tool. ✅ Tüm `kortext-*.py` script refs (`commands.md`, `behavior.md`, dev-agent'lar) → gerçek v3 MCP tool'ları (`transition_item`/`handover`/`get_acceptance_criteria`/`get_runtime_status`) ya da "motor-otomatik". Doctor yeşil, içerikte hiç ölü ref kalmadı.

**Durum:** **874 test yeşil** (807→874, +67 TDD), typecheck temiz, build başarılı. **24 yeni lokal commit** (v3.1'in 12'si + bu fazın 12'si: `0dce640`..`c7acc53`), **origin'e PUSH EDİLMEDİ.**

**SIRADAKİ:** push (sen "push" deyince) → publish. Ertelenen follow-up'lar [TODO](./TODO.md): staging-onay tüketicisi (prime onay→version ilerle / red→bug), staging `reports_index` sentetik `file_path` (gerçek özet dosyası yazımı), + v3.1 nitleri (paralel-start kilidi, allocatePort mesajı). Blocker-clear (Slice 2) hâlâ ertelendi.

---

## Önceki devir (2026-06-06) — v3.1 CLI per-project-daemon TAMAM ✅ (11 görev) + paketlenmiş smoke test geçti

**v3.1 CLI yeniden tasarımı bitti.** [Plan](../docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md)'ın 11 görevi `subagent-driven-development` ile koşturuldu (TDD). Sonuç: **proje-başına port** mimarisi — global registry (`~/.kortext/projects.json`, atomik yazım) + daemon launcher (detached spawn / pid-liveness / kill) + 9-komutluk CLI yüzeyi. Sunucu/API/React dokunulmadı.

- ✅ **9 komut:** `start / stop / pause / list / remove / purge / update / doctor / help`. Eski mock-executor workflow runner → `kortext dev:run <id>` (testler için korundu); `serve`/`init` dev komutu olarak kaldı.
- ✅ **Registry core** (slug `<CODE>`→lowercase, çakışmada `-N`; stabil port 3200+; atomik temp+rename). **Daemon** (prod-mode `node dist/server/index.js`, log → `<proj>/.kortext/data/logs/daemon.log`).
- ✅ **EADDRINUSE handler** (v3.0.1 borcu kapandı): çakışan port artık net mesaj + exit 1, sessiz "Cannot GET /" değil. Canlı doğrulandı.
- ✅ **Paketlenmiş smoke test** (Task 11) uçtan uca geçti — `npm pack` → izole temp-prefix kurulum → iki paralel daemon gerçek portlarda (3201/3202, HTTP 200) → stop / aynı-port restart / remove (.kortext korundu) / purge (.kortext silindi). Senin global kortext'ine ve canlı `:3200` UAT sunucuna **dokunulmadı** (izole HOME + temp prefix).
- 🐛 **Smoke test + final review 2 defect yakaladı, ikisi de düzeltildi:** (1) `js-yaml` runtime'da import ediliyordu ama `dependencies`'te yoktu → paketlenmiş daemon `ERR_MODULE_NOT_FOUND` ile çöküyordu (artık deklare edildi); (2) `spawnDaemon` parent log fd'sini kapatmıyordu (fd sızıntısı → `closeSync` eklendi).
- **Durum:** **835 test yeşil** (807→835, +28 TDD), typecheck temiz, build başarılı, version **3.1.0**, CHANGELOG `[3.1.0]`. **12 yeni lokal commit (`672f06c`..`681302e`), origin'e PUSH EDİLMEDİ** (senin onayını bekliyor).

**SIRADAKİ:** (1) **push** (sen "push" deyince) → ardından **`npm publish`** (kasıtlı manuel adım, otomatik değil). (2) Final-inceleme ertelenen nitler [TODO](./TODO.md)'da: paralel-`start` yarış kilidi (EADDRINUSE hafifletiyor), `allocatePort` tükenme mesajına `kortext list/remove` ipucu. (3) Ertelenen faz-3 boşlukları: dependency üretimi + epic-id (`TF-E01`).

**⚠️ Not:** Mevcut global `kortext` (`/opt/homebrew/bin/kortext`) eski sürüm — yayın sonrası `kortext update` veya yeniden global install ile tazelenir. Canlı UAT sunucusu hâlâ `:3200`'de ayakta (dokunulmadı).

---

## Önceki devir (2026-06-06) — UI fazlarının TAMAMI (1+2+4+3) BİTTİ ✅; faz-3 canlı koşuyla doğrulandı

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

**SIRADAKİ — v3.1 CLI yeniden tasarımı (plan hazır).** Eray mimariyi seçti: **A = proje-başına port** (tek-daemon-URL değil — frontend/API/backend dokunulmaz; iş = registry + CLI + daemon yaşam döngüsü). Tam, no-placeholder TDD planı: **[docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md](../docs/superpowers/plans/2026-06-06-cli-per-project-daemon.md)** — 11 görev, dalga-paralel (Wave1: registry+daemon sıralı → Wave2: 6 komut paralel → Wave3: bin wiring → Wave4: release). **Uygulama YENİ oturumda** (bu oturum bağlamı dolu): `subagent-driven-development` ile planı task-task koştur. Önce push (Eray onayladı, bu oturumda yapıldı). Sonra faz-3 boşlukları (dependency üretimi + epic-id, ertelendi) istenirse.

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

## Açık işler (KALAN — tam liste + detay [TODO.md](./TODO.md))

> Bu oturumda biten her şey [DECISIONS Bölüm 7](./DECISIONS.md)'de. Aşağısı = **gerçekten kalan**.

**🚀 Yayın**
- [ ] **push** — bu oturumun işi dahil tüm lokal commit'ler `origin/main`'e gönderilmedi (sen "push" deyince). `main` origin'den ~18 commit ileride.
- [ ] **`npm publish`** — push sonrası son kasıtlı manuel adım. Yayın sonrası mevcut global `/opt/homebrew/bin/kortext` eski → `kortext update`.
- [ ] **Senin GUI-UAT turun** — yeni `kortext start` → sihirbaz → dizin-seç → otomatik git → analiz akışını tarayıcıda gez ([UAT-SESSION-PROMPT](./UAT-SESSION-PROMPT.md) güncel).

**🧙 Bootstrap sihirbazı**
- [x] ~~**Sihirbaz ("bellboy") daemon self-shutdown**~~ ✅ (2026-06-08, commit `0cd736d`). `scheduleBootstrapSelfExit` — `KORTEXT_BOOTSTRAP=1` guard'lı unref'li 2sn timer; blueprint bootstrap dalı handoff 201'ini flush edince wizard `process.exit(0)` yapar → `:3199` boşalır, sıradaki `kortext start` çakışmaz. +4 test (1003 yeşil). Elle kill gerekmez.

**🔧 Motor follow-up'ları**
- [ ] **Prod push (CI) substratı** — `deployProd` artık gerçek `development→main` merge + tag yapıyor ✅; ama `git push origin main`/CI tetikleme hâlâ yok (gerçek prod hedefi yok). Gerçek prod altyapısı gelince ekle.
- [ ] **Full planning pipeline canlı dayanıklılık** — 9-adım gerçek-LLM koşusunda adım-zaman-aşımı + hung-claude tespiti (canlı teyitte bir zenginleştirme adımı ~70dk askıda kaldı, kill). + auto-approve poller ile uçtan-uca canlı koşu.

**🧹 Küçük / opsiyonel**
- [ ] Concurrency tavanları (`DRIVE_MAX_ITEMS=6`, `DRIVE_MAX_WORKTREES=12`) — Eray isterse ayarlanır.
- [ ] İçerik kalibrasyonu (persona/workflow ince ayar) — ölü ref'ler temizlendi + vocab toleransı belgelendi; gerçek koşularda davranış gözlemiyle süren bir tur.
- [ ] Sayfalama: EpicDrawer çocuk LİSTESİ hâlâ yüklü sayfadan (ilerleme sayısı aggregate'ten doğru; liste "Daha fazla yükle" ile tamamlanır) — büyük epic'lerde tam liste için ufak follow-up.

> **Biten (2026-06-08):** onboarding-driven directory + otomatik git (9 TDD görevi, sihirbaz daemon → gerçek daemon devri → boot auto-start; kritik env-leak bug'ı final review'da yakalandı). [DECISIONS §7.11](./DECISIONS.md).
> **Biten (önceki blok):** gerçek git prod merge+tag (#3), tam sayfalama/aggregate (#5), vocab (#8); dashboard boş-durum (#6) + CLI nüansları (#9) zaten yeterliydi.

---

## Sabitler (her oturum)

- **Eray:** non-coder, Türkçe konuşur, kod+commit+yorum İngilizce, GUI-first, somut artefakt ister (screenshot/dosya yolu/çalışan önizleme).
- **Mimari/UX kararları:** `AskUserQuestion` ile **sade dille** (jargon değil, öneri başa). Büyük kararları Eray onaylar.
- **Push kuralı:** `origin/main`'e Eray **açıkça "push"/"merge" demeden** push YOK. Lokal commit serbest.
- **Önizleme tuzakları (kayıtlı):** `tsx watch` server dosyası düzenlenince restart olur → düşerse `preview_start`. `preview_eval` reload/animasyonda flaky → reload AYRI çağrıda, kısa senkron eval tercih et. `preview_screenshot` 1-2 kare geride olabilir → ölçü/durum için `getComputedStyle`/DOM teyidi (screenshot ikincil).

## Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) · Kararlar: [DECISIONS.md](./DECISIONS.md) · Tasarım: [DESIGN.md](./DESIGN.md) · Açık iş: [TODO.md](./TODO.md) · UAT: [UAT-GUIDE.md](./UAT-GUIDE.md) · Davranış+dosya haritası: [../CLAUDE.md](../CLAUDE.md)
