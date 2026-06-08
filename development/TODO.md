# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de.

---

## ✅ ÇÖZÜLDÜ (UAT #7 → #8, 2026-06-08): "Sinyal çıktıları" dosya sanılıyordu → planning step-1 codex'te çöküyordu

> **Belirti:** codex executor ile planning **ilk adımda** (`backlog-tanm.1` +engineering-manager) çöktü: `declared outputs not produced: backlog-drafted`. Gerçekte `backlog.yaml` **yazıldı** (16KB, `items:`, 16 item) ve codex `exit 0` döndü — ama adım fail olduğu için backlog **ingest edilmedi** (DB total 0). Enrichment hiç test edilemedi.

**Kök neden:** Workflow adımları iki tür çıktı tanımlar — **dosya** (`.kortext/foundation/backlog.yaml`) ve **sinyal/marker** (`backlog-drafted`, `backlog-acceptance-set`, `backlog-security-marked`, `backlog-epics-linked`, `backlog-versions-set`, `backlog-assignees-set`, `backlog-models-set`, …). Ama `server/engine/output-resolver.ts` `findActualOutputFiles` **her çıktıyı dosya yolu sanıyor**: `backlog-drafted` → `worktree/backlog-drafted` dosyası arar, bulamaz → "not produced". Dört executor de (claude/codex/gemini/antigravity) `step.outputs.filter(rel => findActualOutputFiles(rel)===0)` ile **tüm** çıktıları dosya gibi doğruluyor; sinyal filtresi YOK.

**Neden #6 (antigravity) geçti, codex patladı:** Sinyal yalnızca ajan **tesadüfen o isimde bir dosya yaratırsa** "geçiyor". Antigravity `backlog-drafted` marker dosyası oluşturmuş (geçti); codex sadece metinde "Çıktı durumu: backlog-drafted" yazıp dosya yaratmadı (patladı). Akış ajan davranışına bağlı → kırılgan.

**Düzeltilecekler:** ✅ **TAMAM (2026-06-08 #8, TDD, +12 test).**
- [x] ~~**Sinyal vs dosya ayrımı**~~ ✅ — yeni `output-resolver.isFileOutput` (`/` veya `.` içerir → dosya; aksi → sinyal) + `findMissingFileOutputs` ortak helper. 4 executor de (claude/codex/gemini/antigravity) bunu kullanıyor → bare-token sinyaller (`backlog-drafted`, `staging-approved`, …) **dosya olarak doğrulanmaz**, yalnız `.kortext/...` dosyaları kontrol edilir. +6 helper + 6 executor regresyon testi.
- [ ] **Regresyon (gerçek codex):** koşu çalışıyor — sonuç HANDOVER #8'de.

---

## ✅ ÇÖZÜLDÜ (UAT #7 → #8) `rules/` dosyaları ajan prompt'una enjekte edilmiyordu

> **Belirti/keşif:** Eray sordu — ajanlar `rules/behavior.md` gibi kuralları okuyor mu? **Hayır.** Hiçbir executor `rules/` içeriğini prompt'a koymuyor. `rulesDir` yalnız: (a) dashboard gösterimi (`server/index.ts:366` `/api/`), (b) `markdown-sync` salt-okunur doküman listesi, (c) ölü/yorum referansları (`backlog-ingest.ts` `models.md` yorumu; `harmful-output-filter.ts` `banned-phrases.md` "ileride yüklenecek" TODO'su — aktif değil).

**Sonuç:** `behavior.md`, `models.md`, vb. runtime'da ajan için **görünmez**. Ajan prompt'una giren: persona gövdesi (`agents/<persona>.md`) + workflow adım talimatı (`step.description`) + input dosya **yolları** (içerik değil). Yani "rules ajanları yönetir" beklentisi şu an **gerçekleşmiyor** — kurallar yalnız insan/dashboard için duruyor, motor-prompt zincirine bağlı değil.

**Düzeltilecekler:** ✅ **TAMAM (2026-06-08 #8, TDD, +10 test).**
- [x] ~~**Karar + uygula (hibrit a+b)**~~ ✅ — yeni `server/engine/rules-injection.ts` `buildRulesBlock(stepInputs, rulesDir)`: **behavior.md evrensel her adıma** + adımın `inputs`'unda bildirdiği her `rules/*.md` (örn. model-atama adımı `rules/models.md` input'u var → o adıma iner). Persona gövdesinden SONRA enjekte edilir (cache-dostu, step-type'a göre stabil). 4 executor de bağlandı (claude system-prompt'a, codex/gemini/antigravity stdin'e); `rulesDir` factory → 3 caller (commands/index/server-drive) boyunca thread'lendi. +6 helper + 4 executor testi.
- [x] ~~**`models.md` model-atama adımına ulaşıyor**~~ ✅ — workflow zaten `inputs: …, rules/models.md` bildiriyor; buildRulesBlock bunu yakalayıp o adımın prompt'una koyuyor. Ajan artık mapping'i görüyor (test: models.md içeriği o adımın prompt'unda).
- [ ] **`banned-phrases.md`** safety filtresine bağlama — ayrı/kapsam dışı (bu tur prompt-enjeksiyonu odaklıydı).

---

## ✅ ÇÖZÜLDÜ (UAT #7 → #8) Codex BRD kapsam notunu (≤8 item) dikkate almıyordu

> BRDTEST.md'de "Toplam item sayısı 8'i geçmesin" notu vardı; codex **16 item** üretti. Antigravity aynı notla 8 üretmişti. Kapsam kaldıracı executor'a bağlı, codex'te tutmuyor.

- [x] ~~**Granularite talimatı pekiştirildi**~~ ✅ (2026-06-08 #8) — `planning-pipeline.md` step-1'e **🎯 Kapsam ve granularite — ZORUNLU** bloğu: PRD/BRD'deki item-sayısı sınırı bir **tavandır, aşma**; "bir özellik = bir task" (FE/BE/test'i ayrı item'a BÖLME — review_gates+persona zaten paralel yürütür); şüphede **daha az/daha büyük** item. "tüm item'ları çıkar" → "kapsam sınırlarına uyarak çıkar" olarak yumuşatıldı (codex bunu literal alıp 16 üretmişti). Codex koşusunda item sayısı doğrulanacak (HANDOVER #8).
- [ ] **Kalıcı çözüm (ayrı):** onboarding "proje boyutu" kontrolü — talimat pekiştirme yine de executor-bağımlı; deterministik tavan için onboarding sinyali daha sağlam.

---

## 🧙 Onboarding-driven directory + otomatik git (2026-06-08)

> Yeni akış **tamam** + `main`'e lokal merge (9 TDD görevi, 999 test). `kortext start` (proje yok) → sihirbaz → dizini GUI'de seç → otomatik git → gerçek daemon devri → boot auto-start. Detay [DECISIONS §7.11](./DECISIONS.md) · [plan](../docs/superpowers/plans/2026-06-07-onboarding-driven-directory.md).

- [x] ~~**Dizini onboarding seçsin** (terminalde değil)~~ ✅ — bootstrap sihirbaz daemon'u (`:3199`, kayıtsız) + blueprint bootstrap dalı + `handoffUrl` devri.
- [x] ~~**Otomatik git bootstrap**~~ ✅ — `bootstrapGit`: yeni klasörde init+commit+`development`; mevcut repo'da yalnız `development` (dosyalara dokunmaz).
- [x] ~~**`kortext start` → sihirbaz**~~ ✅ — proje yokken `launchBootstrapWizard`; `--new` bayrağı; gerçek daemon boot'ta `autoStartPendingAnalysis` (idempotent).
- [x] ~~**Env-leak kritik bug**~~ ✅ — `KORTEXT_BOOTSTRAP` gerçek daemon'a sızıp auto-start'ı öldürüyordu; `spawnDaemon` env'i temizlendi + regresyon testi (final review yakaladı).
- [x] ~~**Sihirbaz ("bellboy") daemon self-shutdown**~~ ✅ (2026-06-08). `scheduleBootstrapSelfExit` (cmd-bootstrap.ts): `KORTEXT_BOOTSTRAP=1` guard'lı, unref'li 2sn timer → blueprint bootstrap dalı handoff 201'ini flush ettikten sonra (`onBootstrapHandoff`) wizard `process.exit(0)` yapar → `:3199` boşalır, sıradaki `kortext start` çakışmaz. +4 test (1003 yeşil). Elle `lsof -ti:3199 | xargs kill` artık gerekmez.
- [ ] **Sihirbazdan "yeni klasör oluştur"** (kapsam dışı bırakıldı) — şu an mevcut bir klasör seçiliyor; istenirse picker'a "create folder" eklenir.

---

## ✅ KRİTİK (ÇÖZÜLDÜ 2026-06-08 #4): Planning zenginleştirmesi sessizce kayboluyordu (UAT bulgusu)

> **Belirti:** UAT'ta analiz + planning gerçek Claude ile koştu, **70 item** üretildi — ama Board'da **owner/assignee, parent_epic, version, review_gates, blocked_by hepsi `null`/boş**, tüm item'lar düz `to_do`. Planning'in en değerli çıktısı (kim, hangi epic, hangi sürüm, hangi kapı, bağımlılık) hiç persist olmadı.

**Kök neden — patch parser yalnız `items:` kabul ediyor, ajan başka tepe-anahtar yazıyor.** `server/engine/backlog-ingest.ts` parse_backlog (satır ~109-157) sadece (a) tepe seviye `items:` dizisi veya (b) ` ```yaml ` fenced blok kabul ediyor. Ajanın ürettiği `backlog.patch.yaml` tepe anahtarı **`dependency_patches:`** (kanıt: `notlarim/.kortext/foundation/backlog.patch.yaml`) → `errors: ['no "items" array found']` → patch **tümüyle atlanıyor**. Aynı şey atama/epic/versiyon/model adımlarında da olmuş (hepsi null → hiçbiri parse edilmemiş). Activity'de 6× `backlog.patch.summary parse_errors:1`.

**Düzeltilecekler (yeni oturum):** ✅ **TAMAM (2026-06-08 #4, A-F, +10 TDD test → 1037 yeşil, typecheck+build temiz).**
- [x] ~~**(A — birincil) Generic tepe-anahtar kabulü**~~ ✅ — yeni `findItemArray` helper: `items:` yoksa tepe seviyedeki **ilk `id` taşıyan obje listesini** kabul eder (skaler diziler reddedilir → `versions: [v0.1]` yanlışlıkla yakalanmaz). Hem top-level hem fenced dalda. Canlı `dependency_patches:` dosyası artık parse oluyor.
- [x] ~~**(B) `assignee`→`owner` alias**~~ ✅ — parser `owner`/`assignee`'yi `parsed.owner`'a çözer; yeni `repos.backlog.setOwner` (yalnız değer-set, asla null) ingest create/update + patch yollarına bağlandı. `updatePlanningFields` "owner'a dokunma" garantisi korundu → step-1 re-ingest atamayı silmez. Serializer da `owner` yazıyor.
- [x] ~~**(C) `acceptance_criteria` için ev**~~ ✅ — AC zaten frontmatter'a iniyor + `acChecklist()` UI'da gösteriyor (faz-2/3); tek sorun patch'in hiç parse olmamasıydı (A). Test: generic tepe-anahtarla gelen AC frontmatter'a iniyor. Ek kolon/UI gerekmedi.
- [x] ~~**(D) Sessiz başarısızlık**~~ ✅ — `ingestBacklogPatchFile`: parse_errors VAR + 0 update (tam kayıp) olduğunda **ayrı, görünür** `backlog.patch.dropped` audit olayı (eyleme dönük mesaj + tepe-anahtar ipucu). Düşük-sinyalli `summary parse_errors:1` artık tek başına değil. (Hard-fail YOK — iyi-huylu patch planning'i kırmasın diye; görünür uyarı.)
- [x] ~~**(E) Tek paylaşılan patch dosyası overwrite**~~ ✅ (A+D ile kapandı) — motor her adımın çıktısını yazıldığı an ingest edip backlog.yaml'i yeniden serialize ediyor (sonraki adım ezmeden önce). Gerçek kayıp = sessiz parse-drop (A) + görünmezlik (D); ikisi de çözüldü. **Adım-başına ayrı dosya** ertelendi (A+D gerçek deliği kapattı, marjinal fayda).
- [x] ~~**(F) workflow talimatı sertleştir**~~ ✅ — `workflows/planning-pipeline.md`: patch format bloğuna **⛔ tepe anahtar `items:` OLMALI** kuralı (`dependency_patches:` vb. YANLIŞ, adım sessizce kaybolur) + Konsolidasyon adımına somut bağımlılık patch örneği.

---

## ✅ Codex executor (ÇÖZÜLDÜ 2026-06-08 #4): `exec` alt-komutu eksikti (UAT bulgusu)

> UAT'ta Codex executor seçildi → analiz pipeline'ı **1 saniyede çöktü**. Kök neden: `codex-cli-executor.ts` `args`'a hiç `exec` eklemiyordu → ham `codex` interaktif TUI olarak açılıyor → `stdin is not a terminal`, `code 1`.

- [x] ~~**Codex executor'ı düzelt**~~ ✅ — `args = ['exec', '--sandbox', 'workspace-write', '--skip-git-repo-check', ...extraArgs]`. Flag'ler codex-cli 0.137.0'da `codex exec --help` ile doğrulandı; prompt argümansız → stdin'den okunur (mevcut akış korunur). +1 args-spy testi (`exec` ilk arg, sandbox=workspace-write). **Kalan:** gerçek-codex canlı smoke (UAT'ta Claude'la devam edildi).

---

## ✅ UX: çıplak `kortext start` (ÇÖZÜLDÜ 2026-06-08 #4) — env değişkeni artık gerekmiyor (UAT bulgusu)

> Non-coder kullanıcı `KORTEXT_DRIVE_ENABLED=1 KORTEXT_CLAUDE_BIN=$(which claude) kortext start` yazmak zorunda kalıyordu. İkisi de kalktı.

- [x] ~~**`KORTEXT_CLAUDE_BIN` otomatik bul**~~ ✅ — yeni `server/cli/binary-resolver.ts` (`resolveExecutorBinary`): env override > PATH+bilinen dizinlerde mutlak-yol keşfi (`whichSync`, detached daemon ince PATH'te bile bulur) > çıplak komut adı. `defaultBinaryFor` (server/index.ts) buna devredildi; antigravity→`agy` eşlemesi korundu. Sihirbaz binary-path alanı hâlâ override. +6 test.
- [x] ~~**`KORTEXT_DRIVE_ENABLED` → varsayılan**~~ ✅ — `kortext start` ile doğan daemon artık driver'ı **varsayılan armed** başlatıyor (`buildDaemonEnv`: switch unset/boş ise `'1'`; kullanıcının açık `'0'`'ı hâlâ kazanır). Kapsam güvenli: çıplak prod sunucu node'u doğrudan koşar, spawnDaemon'dan geçmez → orada OFF kalır. Scheduler ("Auto") hâlâ ayrı/varsayılan kapalı — sadece düğmeler silahlandı. +6 test. (GUI toggle yerine "makul varsayılan" yolu seçildi.)

---

## ✅ Home dizininden `kortext start` (ÇÖZÜLDÜ 2026-06-08 #4): sihirbaz kirletmiyordu (UAT bulgusu)

> cwd=home iken çıplak `kortext start` `~/.kortext`'i (global registry dizini) bir proje `.kortext`'i sanıp home'u "erayendes" projesi olarak iskeliyordu + auto-handoff tetiklenmedi → "elle cd && serve" fallback.

**Kök neden:** `resolveStartTarget` (`server/cli/cmd-start.ts`) `cwd/.kortext` var mı diye bakıyordu; ama home'da bu **registry dizininin ta kendisi** (`defaultRegistryDir()` = `~/.kortext`).

- [x] ~~**Registry-home guard'ı**~~ ✅ — `resolveStartTarget`'a `registryDir` parametresi + `isRegistryHome(dir)` (dir'in `.kortext`'i registry dizinine çözülüyorsa = home, asla proje değil). Hem arg hem no-arg dalında: home → `list`/`onboard` (sihirbaz), `new-path` değil. Kardeş gerçek proje dizinleri etkilenmez (guard yalnız home'a kapsamlı). +4 test. İkinci belirti (auto-handoff/serve fallback) kök düzelince giderildi: artık doğru `onboard` → sihirbaz.

## ✅ ÇÖZÜLDÜ (UAT #5 → fix oturumu #6, 2026-06-08): Planning çökmesi + naming standardı

> Kök neden: konsolidasyon adımı `planning-reports_<slug>_<ts>.md` (olmayan tür) + output-resolver'ın ts regex'i antigravity'nin `_174649` formunu eşleştiremiyordu → adım fail → o adımın patch'i ingest olmadı. Odaklı kapsam (Eray onayı: planning + resolver).

- [x] ~~**Konsolidasyon çökmesi → naming**~~ ✅ — `output-resolver.ts` TIMESTAMP_PATTERN her ayraç varyasyonunu (`-`/`_`/`:`/`T`/boşluk) + SLUG_PATTERN uppercase project-id'yi kabul eder. Test: antigravity'nin tam çökme formu `status-reports_notlarim_20260608_174649.md` + kanonik `status-reports_NOT_2026-06-08_17-46-49.md` eşleşir, çöp reddedilir.
- [x] ~~**Tek adlandırma deseni**~~ ✅ — `report-type_project-id_<ts>`, tek ts `YYYY-MM-DD_HH-MM-SS`. `markdown-sync.formatReportTimestamp` + `REPORT_FILENAME_PATTERN` (yeni ts + UPPERCASE id; eski ts back-compat). planning-pipeline.md konsolidasyon adımı bu deseni dayatıyor. **Odaklı:** diğer workflow'ların statik adları (test-reports.md vb.) dokunulmadı — ayrı follow-up.
- [x] ~~**`planning-reports` türünü kaldır**~~ ✅ — `planning-pipeline.md` artık `status-reports_<slug>_<ts>.md` yazar; kodda planning-reports referansı yok (gate `approver:` ile sürülüyor, ad değil).
- [x] ~~**`assignee` → `owner` alias**~~ ✅ — #4'te eklenmişti; UAT #5 regresyon testiyle doğrulandı (antigravity patch şekli: parent_epic+version+assignee+model+blocks tek `items:` patch'inde → `updated>0` + owner persist). Canlı `updated:0` konsolidasyon çökmesinin sonucuydu, alias eksikliği değil.
- [x] ~~**Sessiz başarısızlık görünürlüğü**~~ ✅ — `backlog.patch.dropped` audit olayı artık `updated:0 && (parse_error VEYA hepsi-skipped)` durumunda da ateşlenir (önceden yalnız parse_error). Eyleme dönük mesaj.
- [x] ~~**🔴 İKİNCİ KÖK NEDEN — gerçek-LLM koşusunun açığa çıkardığı (FK cascade)**~~ ✅ — Antigravity koşusunda **step-1 hiç epic üretmedi (0 epic)**; ajan epic tanımlarını sonraki enrichment patch'inde yazdı. `patchBacklogItems` yalnız güncellediği için epic'ler "not found" → skip, sonra task'ların `parent_epic: NOT-E01` güncellemesi **`FOREIGN KEY constraint failed`** verdi → o adımın TÜM enrichment'i (owner/version/parent_id) düştü (4 adım `0 updated, 10 skipped`). **Fix:** `patchBacklogItems`'a ön-geçiş — patch'in tam tanımladığı eksik `type: epic` container'ları **önce yaratır** (FK hedefi var olur), sonra task güncellemeleri bağlanır. Bu, unit-test'in (epic'leri önceden yaratıyordu) yakalayamadığı, **yalnız gerçek-LLM koşusunun gösterdiği** bulgu. +1 test.
- [x] ~~**Regresyon kanıtı (gerçek-LLM)**~~ ✅ — antigravity (#6) + codex (#8) koşuları: 1. naming koşusu planning'i `succeeded` yaptı ama FK bug'ı owner/version'ı düşürdü → FK fix → 2. koşu owner/epic/version/model **8/8 dolu + succeeded**. Codex de aynı (8/8). Detay HANDOVER #6/#8.

---

## 🤖 Çok-modelli executor — onboarding seçimi = operation-manager modeli (2026-06-08, UAT/Eray vizyonu)

> Şu an executor **proje genelinde tek** (`project.json.executor`) — her persona/adım aynı CLI'yi kullanıyor. Eray'ın istediği model: onboarding'de seçilen executor **sadece operation-manager (orkestratör) içindir**; sonrasında **birden çok model eşzamanlı** çalışabilmeli (persona/görev bazında farklı executor — örn. analiz adımları agy, kritik kodlama claude, vb.).

- [ ] **Onboarding semantiği:** "AI Executor" alanını "operation-manager modeli" olarak çerçevele (etiket + yardım metni). Bu seçim orkestratörün modeli olur.
- [x] ~~**Persona→executor yönlendirmesi (motor)**~~ ✅ (2026-06-08, merge `cbe45b8`) — persona markdown'ında opsiyonel `- model: <kind>` → `personas.model_default` (DB) → `createRoutedExecutor` drive anında base executor'ı `PersonaRoutedExecutor` ile sarıyor (örn. +architect→claude, +reviewer→gemini). Worktree branch'i main'e merge edildi (1065→1093 test). **Kalan:** onboarding semantiği + Settings UI (aşağıda).
- [ ] **Settings/Agents:** her persona için model/executor override edilebilir alan (v3.2 yazma kapsamıyla uyumlu).

---

## 🚀 v3.1 release + CLI follow-up (2026-06-06)

> v3.1 CLI per-project-daemon **tamam** (11 görev, 835 test, paketlenmiş smoke test geçti). Kalanlar:

- [ ] **PUBLISH:** Eray "push" → `git push origin main`, ardından `npm publish` (kasıtlı manuel adım). Yayın sonrası mevcut global `/opt/homebrew/bin/kortext` eski → `kortext update` veya yeniden global install.
- [x] ~~**Paralel-`start` yarış kilidi**~~ ✅ (2026-06-07). `server/registry/lock.ts` — sync O_EXCL + Atomics.wait + stale-reclaim; allocate+write kilit içinde, taze re-read.
- [x] ~~**`allocatePort` tükenme mesajı**~~ ✅ (2026-06-07). Hata artık `kortext remove`/`list` ipucu içeriyor.
- [x] ~~**new-path spawn-fail persist**~~ ✅ (2026-06-07). Kayıt spawn'dan önce persist ediliyor.

---

## 🔧 Faz-3 + Motor dilimleri follow-up (2026-06-06)

> Faz-3 boşlukları + motor dilimleri + içerik kalibrasyonu **tamam** ([plan](../docs/superpowers/plans/2026-06-06-phase3-engine-content.md), 874 test). Kalan kuyruk:

- [x] ~~**Staging-onay tüketicisi**~~ ✅ (2026-06-07). `staging-approval-consumer.ts` + route: onay→raporlar approved + epic `staging_approved` + version-tamamlama→`preprod-approval` sorusu; red→bug. (await edilir, idempotent.)
- [x] ~~**Staging `reports_index` gerçek dosya**~~ ✅ (2026-06-07). `writeReport` ile gerçek `.kortext/reports/gate-staging_*_*.md` dosyaları.
- [x] ~~**Blocker-clear (Slice 2)**~~ ✅ (2026-06-07). Migration GEREKMEDİ — frontmatter tabanlı: ingest oto-block + closure oto-unblock (`to_do`). Eray kararı: otomatik 'blocked' (dürüst board).
- [x] ~~**Bağımlılık üretimi — canlı koşu doğrulaması**~~ ✅ (2026-06-07). Gerçek claude ajanı (DevVault) 39 item + `DV-E0N` epic + mantıksal bağımlılıklar üretti. **Bulgu:** ajan `depends_on` kullandı → ingester'a `blocked_by` alias'ı eklendi. Gerçek veride 38/39 auto-block + doğru çoklu-blocker auto-unblock doğrulandı.
- [x] ~~**Preprod DEPLOY substratı + preprod-onay tüketicisi**~~ ✅ (2026-06-07). `deployPreprod`/`deployProd` (mock-first) + `consumePreprodApproval` (onay→released+deployProd, red→bug) + route. Zincir preprod-onayında biter (§5.11).
- [x] ~~**Gerçek git main-merge/tag**~~ ✅ (2026-06-07 #2). `deployProd` gerçek `development→main` merge + annotated version tag yapıyor (idempotent, ilk-release, çakışma→bug, sunucu orijinal branch'e döner). **Kalan:** prod push (CI) — gerçek prod hedefi yok.
- [ ] **Prod push (CI) substratı:** `git push origin main`/CI tetikleme; gerçek prod altyapısı gelince.
- [ ] **Full planning pipeline canlı dayanıklılık:** `dev:run planning-pipeline --executor=claude` step-1'i ürtti ama bir sonraki zenginleştirme adımında askıda kaldı (~70dk, kill). Adım-zaman aşımı / hung-claude tespiti + full 9-adım uçtan uca canlı koşu (auto-approve poller ile) ayrı teyit.
- [x] ~~**Tam sayfalama**~~ ✅ (2026-06-07 #2). `GET /api/backlog/aggregate` (roll-up + facet + per-version açık-iş sunucu-tarafı) + "Daha fazla yükle" kart sayfalaması. **Kalan ufak:** EpicDrawer çocuk LİSTESİ yüklü sayfadan (ilerleme sayısı doğru).

---

## 🔍 UAT bulguları — canlı koşu UI incelemesi (2026-06-06, TaskFlow sandbox)

> Eray `kortext-live-uat-v2` verisini gerçek UI'da gezdi. Her madde **gördüğü + doğrulanmış gerçek durum + dosya**. Çoğu "veri doğru, UI bağlı değil". (Project + Kortext settings ekranları bu turda incelenmedi — ertelendi.)

**A. Board (`src/routes/board.tsx`)**
- [x] ~~**Epic kolonu boş**~~ ✅ (2026-06-06, faz-1). Board+Dashboard artık `/api/backlog?limit=500` çekiyor (board kolonları + epic roll-up tüm seti gerektirir; varsayılan 100 en eski olan epic'leri kesiyordu). Canlı: Board epic-rail 18 epic gösteriyor, Dashboard epic-progress 18 satır. **Gerçek sayfalama** ayrı follow-up (aşağıda).
- [x] ~~**Versiyon filtresi yok**~~ ✅ (2026-06-06, faz-1). Board page-h'a `VersionSelect` (pill+native select) eklendi; `defaultActiveVersion` = en küçük bitmemiş versiyon varsayılan-aktif (canlı: v0.1, 9 item), "All versions" → 109 item. Saf helper'lar `compareVersions`/`sortedVersions`/`defaultActiveVersion` (semver-doğru sıralama, v0.10 > v0.2) — 13 unit-test.
- [x] ~~**Assignee görünmüyor**~~ ✅ (2026-06-06, faz-1). `assigneeOf(item)` = `owner` → `frontmatter.assignee` fallback. Kart avatar + drawer Assignee/Owner satırı + Dashboard PrimeRow buna bağlandı. Canlı: kartlar `+engineering-manager`/`+frontend-developer` gösteriyor, drawer "frontend-developer".
- [ ] **Dependency gösterilmiyor** — drawer'da blocks/blocked_by yok. (Ayrıca bu koşuda ajan **hiç dependency üretmedi** — content gap, aşağıda D.)
- [x] ~~**Comment alanı yok**~~ ✅ (2026-06-06, faz-2). Item drawer'a yorum kutusu (input+Send) eklendi; `POST /api/backlog/:id/comment` yorumu `audit_log`'a (`item_comment`) yazıyor → drawer + Dashboard timeline aynı feed'de gösteriyor (ayrı store yok). Per-item activity feed de küratörlendi (gürültülü `backlog.patch` elenir) + `backlog.ingest` "added this item from planning" olarak okunur. Canlı doğrulandı.
- [x] ~~**Filtreler çalışmıyor**~~ ✅ (2026-06-06, faz-2). "Assignee" statik pill → `AssigneeSelect` dropdown (`assigneesOf` helper, owner/frontmatter çözer); versiyon+epik+assignee filtreleri birleşiyor, page-sub temizlenebilir chip gösteriyor. Canlı: backend-developer → 37 item hepsi doğru. **"Group: Epic" pill kaldırıldı** — epic-rail zaten epik gruplama/filtre işlevini görüyor, pill gereksizdi (Eray gerçek "group by" kontrolü isterse ayrı iş — soruldu).
- [x] ~~**"New" (yeni görev) çalışmıyor**~~ ✅ (2026-06-06, faz-2). `window.prompt` (önizleme/bazı tarayıcılarda bloklu) → gerçek in-app form (Drawer içinde): type pill'leri + title + epic select + version select (board filtresinden seed). `POST /api/backlog` artık `version` kabul ediyor. Canlı: form → kart board'da. +route testleri.
- [ ] **item-id'ler slug** — `init-nextjs-project`, `write-component-tests-task-form`. Proje-kodlu kısa id konvansiyonu (`TF-001`) yok → persona/workflow kalibrasyonu (D).

**B. Dashboard (`src/routes/dashboard.tsx`)**
- [x] ~~**Epic progress 0**~~ ✅ (2026-06-06, faz-1). Aynı limit fix (A) — Dashboard `?limit=500`; epic-progress 18 satır, hepsi gerçek child-tamamlanma yüzdesiyle.
- [x] ~~**Activity timeline boş**~~ ✅ (2026-06-06, faz-1). Yeni `GET /api/activity` (küratörlü audit feed — gürültülü per-item `backlog.patch` SQL'de elenir, `AuditLogRepository.listFeed`/`FEED_EXCLUDED_ACTIONS`). Timeline `buildActivityFeed(audit, handovers, decisions)` ile besleniyor; `describeAuditEvent` pipeline/gate/transition olaylarını okunur metne çeviriyor. Canlı: 40 olay ("advanced to planning-pipeline", "gate answered", "paused for your approval"…), `backlog.patch` gürültüsü 0.
- [ ] **Active work / For review boş** — koşu bittiği için boş (beklenen). Netleştir: bitmiş koşu geçmişi gösterilmeli mi, yoksa "boş = doğru" mu.

**C. Doküman görünümü (`FileBrowser`/`AnnotatableDoc`)**
- [x] ~~**Scroll olmuyor**~~ ✅ (2026-06-06, faz-2). `.fb-view` grid-hücresinde `min-height: 0` eksikti → içindeki `.fb-md`'nin `overflow-y:auto`'su devreye giremiyordu. Tek satır CSS. Canlı: API.md (34k px) scroll'lanıyor.

**D. İçerik / persona kalibrasyonu** (faz-3, canlı koşu `kortext-live-uat-v3` ile doğrulandı — 102 item, 86 task + 16 epic)
- [x] ~~**item-id konvansiyonu**~~ ✅ (2026-06-06, faz-3). planning-pipeline step-0 artık `.kortext/project.json`'dan `code` okuyup `<CODE>-NNN` üretiyor; "slug YASAK" sertleştirmesi tuttu — canlı koşuda **86 task hepsi `TF-001`…`TF-086`** (eskiden `init-nextjs-project` gibi slug'lardı).
- [x] ~~**Memory boş**~~ ✅ (2026-06-06, faz-3). analiz + planning konsolidasyonu `.kortext/memory/decisions.md` yazıyor (workflow declared output). Canlı: 15KB gerçek karar günlüğü — ADR'ler (ADR-001 Supabase Auth: karar+gerekçe+reddedilenler), `/api/docs/memory` serve ediyor, Memory ekranında görünür.
- [x] ~~**Dependency — UI tarafı**~~ ✅ (2026-06-06, faz-3). `dependenciesOf(item)` frontmatter'daki `blocks`/`blocked_by`'ı okuyor (ingester oraya yazıyor; eskiden UI yalnız body parse ediyordu → üretilse bile görünmezdi); drawer'a Dependencies bölümü + kart rozeti. Synthetic dep ile canlı kanıtlandı.
- [ ] **⚠️ Dependency üretimi (içerik) — KALAN BOŞLUK** — sertleştirilmiş talimata rağmen ajan faz-3 koşusunda **0 dependency** üretti (büyük step-1'de alt-madde gözden kaçtı). Şu an **yalnız görsel** boşluk: motor `blocked_on`'a göre iş sıralamıyor (şema'da yok — bkz "blocker-temizle KARŞILIKSIZ"), yani işlevsel etki yok. Daha güvenilir çözüm: planning'e **yalnız dependency atayan ayrı bir adım** (odaklı adım uyumu artırır). Eray kararı: şimdilik ertele.
- [ ] **⚠️ Epic-id konvansiyonu — KALAN BOŞLUK** — ajan task'lara `TF-NNN` uyguladı ama epic'lere `<CODE>-E01` uygulamadı; epic'ler hâlâ slug (`epic-seo-legal`). Okunur olduğu için düşük öncelik. Seçenek: ayrı adım/sertleştirme **veya** ingester'da deterministik normalize (`epic-x`→`TF-E0N`, parent_epic ref'leri de güncelle). Eray kararı: şimdilik ertele.

**E. Global / agents (`Footer` agents paneli, persona ikonları)**
- [x] ~~**Agents paneli**~~ ✅ (2026-06-06, faz-4). `/api/personas` (tüm persona'lar yeşil) → `deriveActiveAgents(items)` (saf helper, TDD): yalnız tamamlanmamış (done/cancelled/epic hariç) görevi olan ajanlar; her satır lead item + statü + kalan-sayı; tone renkli nokta (working=yeşil, blocked=kırmızı, queued=amber); açıklama metni kaldırıldı. Canlı: 5 ajan, hepsi queued (tüm item to_do), openCount'a göre sıralı.
- [x] ~~**Persona ikonları**~~ ✅ (2026-06-06, faz-4). Eray'ın belirlediği lucide seti `persona-colors.ts`'e uygulandı: operation-manager→Bot, product-manager→Rocket, engineering-manager→DraftingCompass, backend-developer→SquareChevronRight, frontend-developer→SquareCode, qa-engineer→FlaskConical, devops-engineer→GitMerge, copywriter→Pencil, growth-expert→Sprout (prime/Compass, delivery/Package, db/Database, security/Shield, designer/Palette, compliance/Scale değişmedi). Tüm yüzeyler (kart/drawer/dashboard/agents) ortak palette okuyor → tek yerde değişti. Canlı render doğrulandı.

**F. Açıklama (bug değil)**
- `planning-reports_<slug>_<ts>.md` **meşru** — planning-pipeline step-8 konsolidasyon raporu (workflow declared output). Başıboş dosya değil; istenirse scope-adı (`planning-reports`) gözden geçirilir.

---

## ⭐ Sırada

- [x] ~~**"Proje hazırlanıyor" ekranı — etkileşim bug'ları**~~ ✅ (2026-06-05, commit `575ca49`). Dört bug da çözüldü + tarayıcıda kanıtlandı: (1) hash deep-link normalizer (`main.tsx`) — çıplak `/initializing` artık `/#/initializing`'e yazılıp doğru ekrana iniyor; (2) satırdaki Onayla gerçek `<button>` + `stopPropagation` → drawer açmadan inline onaylıyor (DB'de `answered`/`approve` doğrulandı); (3) satırdaki Revize drawer'ı doğrudan revize modunda açıyor; (4) <560px sidebar ikon-moduna iniyor, satır butonları kırpılmıyor, drawer tam-genişlik.
- [x] ~~**Kapı Faz 2 — "revize tek başına döner"**~~ ✅ (2026-06-05, commit `7e56755`, DECISIONS Bölüm 14.2). `reject` artık run'ı abort ETMİYOR — sadece reddedilen adımı yerinde yeniden üretiyor (`done`'dan düşür + fire-marker temizle → scheduler yeniden başlatır), onaylanan kardeşler durur, run yaşar. `reviseFeedback` revize nedenini re-execution'a taşır (claude prompt'una girer). `retryRun` artık yalnız crash-recovery (`orphaned:`) için. Yeni paralel test LEGAL∥GROWTH'ta GROWTH revize→onay'ı kanıtlıyor. **745 test yeşil.**
- [x] ~~**Canlı koşu — kapı revize semantiği (§14.2)**~~ ✅ (2026-06-05). Gerçek Claude ile sandbox `kortext-live-uat`'ta tam zincir koştu: onboarding (TaskFlow BRD) → analysis (12 adım, +prime kapıları) → planning-pipeline → Board. **§14.2 canlı kanıtlandı:** LEGAL ∥ GROWTH iki kapı aynı anda açıldı; LEGAL onaylandı (durdu), GROWTH revize edildi → **tek başına yeniden üretildi** (251→184 satır), Claude revize geri-bildirimini prompt'tan aldı (frontmatter'a `revision_note: …ASO and paid channels removed; KPIs limited to 3` yazdı — birebir benim feedback'im), `gate.rejected → regenerate_step: product-analysis.2`, run `running` kaldı (abort YOK). Board'a 100 item ingest edildi.
- [x] ~~**⚠️ Canlı koşu BULGUSU — backlog enrichment + step-8 raporu**~~ ✅ (2026-06-05, DECISIONS §14.7). İki bulgu da giderildi (Eray: "ikisi birden" + "var olanı güncelle"). **(A) epic/version/model:** (1) ingester artık **upsert** — var olan id'yi atlamak yerine planning kolonlarını günceller (`updatePlanningFields`, status/owner'a dokunmaz), `updated[]` döner → her enrichment adımı backlog.yaml'i baştan yazınca katkılar birikiyor; (2) `deriveSyntheticEpics` — düz `epic:` etiketinden gerçek `type: epic` türetir (kemer+askı); (3) `workflows/planning-pipeline.md` yeniden yazıldı — ölü `update_backlog_item` MCP atıfları temizlendi, her adım "oku→uygula→bütün dosyayı yeniden yaz", her adım backlog.yaml'i **ek output** olarak verir (token zinciri sıralamayı sürdürür, DAG döngüsüz — `buildGraph` lineer 1→9 doğrular), step-0 `type: epic`+`parent_epic` zorunlu. **(B) step-8:** `output-resolver` `<ts>` pattern'i gevşetildi (compact `20260605` / date-only `2026-06-05` / `20260605-1959` eşler, çöp reddedilir). **+6 test, 751 yeşil.** Uçtan uca kanıt (in-memory): skeleton→enriched ingest → Board 1 epic/2 child/3 version/3 model (eskiden 0/0/0).
- [ ] **Concurrency knob'ları (opsiyonel)** — workflow-içi `concurrency=3` (`worker-pool`/`commands.ts`) ve `maxConcurrentWorktrees=10` ayarlanabilir tavanlar. Eray "daha fazla paralel" isterse yükselt; gerçek ajanlarda kaynak/maliyet ödünleşimi var. Ayrıca `run-item.ts` dev-cycle adımları caller concurrency'sini almıyor (default 3) — istenirse thread'le.
- [x] ~~**Backlog köprüsü — zenginleştirme**~~ ✅ (2026-06-05, DECISIONS §14.7). Çözüldü: "id'ye göre güncelle" köprüsü = **upsert** (`updatePlanningFields`) eklendi + her enrichment adımı backlog.yaml'i baştan yazıp ek-output verir → qa/security/designer/version/model katkıları artık DB'ye iniyor. Açık soru (step-1 güçlendir mi / update köprüsü mü) **ikisi birden** ile yanıtlandı.
- [ ] **Standalone CLI'a ingester bağla** — `kortext start` (commands.ts) `safetyGuards` almıyor → ingester sadece backend (onboarding/drive) yolunda ateşleniyor. CLI yolunu da besle.
- [x] ~~**Performans — delta (patch) köprüsü**~~ ✅ (2026-06-05, DECISIONS §14.9). Canlı koşu planning'in **patolojik yavaş** olduğunu gösterdi (her enrichment adımı 100 item'lı 80KB backlog.yaml'i yeniden yazıyor → ~22 dk/adım, ~3 saat). Çözüm (Eray: delta köprüsü): patch parse modu + `patchBacklogItems` (alan-birleştirme, gate union) + `backlog.patch.yaml` köprüsü + DB→yaml serializer (motor her patch'ten sonra dosyayı tazeler → personalar güncel okur). Workflow: step 1 tam yazar, adım 2-9 patch yazar. **+8 test, 767 yeşil.**
- [x] ~~**Tek-seferlik kesintisiz canlı koşu**~~ ✅ (2026-06-06, DECISIONS §14.9 canlı kanıt). `kortext-live-uat-v2`'de onboarding → analiz (30dk) → planning (56dk) → Board **kesintisiz tamamlandı**. İki run `succeeded`; 5/5 sütun dolu (epics=18, parent=109, version=127, model=127, gates=97 / 127 item); §14.9 hız 3-7×; serializer + synthetic epic + step-8 hepsi canlı doğrulandı.
- [ ] **`/api/backlog` gerçek sayfalama** (faz-1 sonrası kalan) — faz-1'de Board+Dashboard `?limit=500` ile **band-aid** yapıldı (127 item rahat sığar, epic kesilmesi giderildi). Gerçek sayfalama/sonsuz-kaydırma >500 item'lı projeler için açık kalır (kanban'da kolon-bazlı lazy-load anlamlı). Şimdilik blocker değil.
- [ ] **Transient retry — codex/gemini executor** — `spawnCliWithRetry` paylaşımlı helper hazır; codex/gemini executor'ları hâlâ `spawnCli`'ı doğrudan çağırıyor. Kullanılan executor claude (sarılı); diğerlerini de geçir.
- [x] ~~**⚠️ Dayanıklılık — adım-seviyesi transient retry**~~ ✅ (2026-06-05, DECISIONS §14.8). `cli-spawn.ts`'e `isTransientCliFailure` (dar marker seti: socket closed / API Error / ECONNRESET / overload / rate-limit / 5xx-429) + `spawnCliWithRetry` (exponential backoff) eklendi; `claude-cli-executor` varsayılan `maxAttempts: 3` ile sarmalandı. Deterministik hatalar (bad-model / ENOENT / declared-output-missing) + `aborted` retry edilmez. **+8 test, 759 yeşil.** **Kalan (opsiyonel):** codex/gemini executor'ları da `spawnCliWithRetry`'a geçir (şu an yalnız claude sarılı; kullanılan executor o).
- [ ] **Manuel UAT (paketlenmiş)** — clean klasör + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` ile **paketlenmiş** akışın doğrulaması (bu oturum kaynak-modda UAT yaptı; tgz akışı ayrı).
- [ ] **v3.1.0 release flow** — `package.json` 3.0.0→3.1.0, CHANGELOG `[Unreleased]`→`[3.1.0]` + yeni `[Unreleased]`, `git tag v3.1.0`, npm publish. Sıralama: paketlenmiş UAT pass + CLI redesign kuyruğu + v3.0.1 EADDRINUSE fix sonrası.

---

## Motor — ertelenen backend dilimleri

> Motor/şema epic §5.9 ana iş **bitti + main'de** (lifecycle + capstone + son montaj + driver + `POST /api/drive` + scheduler). Tarihçe [DECISIONS §5](./DECISIONS.md). Aşağısı = dilim-içi ertelenen, numaralı maddeye girmeyen alt-işler.

- [ ] **`gate_runs` uat verdict** — uat red sebebi şu an `audit_log`'da; `gate_runs` satırına yazmak için `attempt` tuzağı çözülmeli (0-test-gate + tekrarlı-bounce'ta `UNIQUE(item_id, attempt, gate='uat')` çakışır → `attempt`'i item alanı yap veya test-cycle marker üretsin).
- [ ] **Handover-on-close** — kapanış başarılıysa (merge ok) `HandoverEngine.record()` ile kapanış handover'ı (developer→prime, completed/next).
- [ ] **blocker-temizle (§5.9 #6)** — KARŞILIKSIZ: item bağımlılık modeli (`blocked_on`/`blocks`) şemada yok. Bağımlılık modeli tasarlanırsa kapanışta downstream item'ları unblock et. (Eray: şimdilik ertele.)
- [ ] **Gate-persona staging raporları (§5.11)** — epic'te gate koşmuş personalar (qa/security/designer/EM/devops) tek-dosya rapor yazar (paralel), motor toplar.
- [ ] **Prime staging onayı (§5.11)** — staging deploy sonrası motor prime'a "staging onayı" sorar; onay→version ilerler, red→bug açılır.
- [ ] **Epic-status-flip** — epic bittiğinde epic item'ını board'da `done` göster (epic'ler review→done yolundan geçmiyor → container-completion için ayrı geçiş/türetilmiş done).
- [ ] **Board "sıra kimde" rozetini bağla (src/)** — `whoseTurn(item)` türetimi hazır (`server/orchestrator/whose-turn.ts`) ama tüketen UI yok. Kart üstüne dönen persona rozetleri (test→paralel, review→+prime, in_progress→owner).
- [ ] **Preview wiring + persistence** — item `test`'e girince `previewManager.startFor`; closure'da `stopFor`. "Çalıştırılabilir/UI görev mi?" koşulu (§5.7, flag ile gate'le). Preview URL'i gate'ler + prime UAT'a sun (`runtime_artifacts`'a `preview` kind'ı veya item-merkezli sakla).

---

## UI — açık parçalar

- [ ] **#9 global arama** — header ⌘K paleti var ama gerçek arama backend'ine bağlı değil ("SOON").
- [ ] **#10 terminal = komut girişi** — şu an salt-okunur run-history timeline; gerçek komut girişi.
- [ ] **Canlı gate pass/fail** — `gate_runs` panelde (şu an gate'ler body `## Review Gates`'ten statik).
- [ ] **Global parçaları gerçek veriye bağla** — v6'da ⌘K/bildirim/terminal kabuk-seviyesinde çalışıyor, gerçek veri akışına tam bağlanması.
- [ ] **Version selector semantiği** — proje sürümü / snapshot / release? netleştir.

---

## v3.1.x follow-up (release sonrası, blocker değil)

| Madde | Yer | Durum |
|---|---|---|
| Reports SQL UI revamp | `src/routes/reports.tsx` | `/api/docs/reports` (fs) → `/api/reports` (SQL `reports_index`); filter/tags/status |
| Memory archive dropdown | `src/routes/memory.tsx` | Decisions/Learned TOC; Handovers eski `handover-<ts>.md` dropdown |
| `POST /api/backlog` integration test | `tests/` | route-level test eksik |
| Footer canlı stats wiring | `src/components/Footer.tsx` | `tkn/s`, `$today`, branch chip'leri partial hardcoded |
| Inline markdown save endpoint | `server/routes/docs.ts` | PUT `/api/docs/:scope/:file` — Rules/Workflows/References "Save" |
| Decisions cards author+quote | Schema + UI | Decision schema'da `author`/`quote` yok |
| TimelinePanel.tsx cleanup | `src/components/TimelinePanel.tsx` | orphan — sil veya yeniden bağla |
| Eski `/api/docs/reports` kaldır | `server/routes/docs.ts` | UI `/api/reports`'a çevrildikten sonra |

---

## v3.0.1 borç

- [ ] **`app.listen()` error handler** — EADDRINUSE'da Express sessizce listening callback'i atlayıp exit ediyor; kullanıcı "Cannot GET /" görüyor. UAT'ta zombie process yanılttı.

---

## CLI/Onboarding redesign — implementation kuyruğu

> **⚠️ Büyük ölçüde AŞILDI** — argv parser / global registry / postinstall / native picker / daemon lifecycle / purge-confirm / update / migration kararı **v3.1 ile** (DECISIONS §7.1), onboarding-driven directory + `kortext start`→sihirbaz + multi-project port **2026-06-08 ile** (DECISIONS §7.11) indi. Aşağısı tarihsel referans; gerçekten kalan tek şey sihirbaz self-shutdown (en üstte).

Yön [DECISIONS Bölüm 0](./DECISIONS.md)'da onaylı. Sıralı adımlar (çoğu ✅):

- [ ] **`bin/kortext.ts` argv parser** — 9 komut: `start [proje]`/`stop`/`pause [proje]`/`list`/`remove [proje]`/`purge [proje]`/`update`/`doctor`/`help`. `init`+`serve` → `start` içine konsolide.
- [ ] **Global registry servisi** — `~/.kortext/projects.json` oku/yaz + lock; `server/registry/`.
- [ ] **Postinstall script** — `scripts/postinstall.mjs`; `detached:true`+`stdio:'ignore'`+`unref()` daemon spawn + tarayıcı. Fallback: "Kortext kuruldu — `kortext start` yaz."
- [ ] **Native folder picker endpoint** — `POST /api/system/pick-folder`; macOS `osascript`, Windows PowerShell, Linux `zenity`/`kdialog`. (Not: onboarding'de `pick-directory` zaten var — bununla birleştir/genişlet.)
- [ ] **Onboard + proje listesi route** — registry doluysa proje listesi + "Yeni proje başlat".
- [ ] **Multi-project routing** — engine `projectId`-aware (her proje kendi `.kortext/data/kortext.db`); `/[proje]/dashboard` vb.
- [ ] **Daemon lifecycle** — `stop` clean shutdown, `pause [proje]` worker pool sinyali.
- [ ] **`purge` confirmation** — interactive `[y/N]` + `.kortext/` rm.
- [ ] **`kortext update`** — `npm update -g kortext` + daemon restart.
- [ ] **Migration kararı** — v3.1 clean break (DECISIONS Bölüm 2.9), migration tooling yok.

---

## İçerik review turu (Faz 13 kalibrasyon)

`development/` cleanup bitince çekirdek akış dosyalarının içeriği gözden geçirilecek:

- [ ] `templates/AGENTS.md` (AI bootstrap) · `agents/*.md` (14 persona) · `rules/*.md` (6 rule) · `workflows/*.md` (10 workflow) · `templates/{foundation,references,reports,memory,backlogs}/*.md` (iskelet).
- [ ] Bilinen risk: `existing-project-analysis.md` (hızlı yazıldı, kalibre), `spike-pipeline.md` (dinamik persona oversimplification).
- [x] ~~**Persona/workflow tutarlılık — backlog araç atıfları**~~ ✅ (2026-06-05, §14.7). Tüm `add_backlog_item` / `update_backlog_item` / `kortext-backlog-add.py` / `kortext-bulk-plan.py` atıfları dosya köprüsüne (`backlog.yaml` → `type:` + `parent_epic:`) çevrildi: `planning-pipeline.md`, `deployment-cycle.md`, `hotfix-pipeline.md`, `rollback-pipeline.md`, `operation-manager.md`, `qa-engineer.md`, `engineering-manager.md`, `rules/commands.md`, `rules/behavior.md`. (planning-pipeline'da kalan tek atıf kasıtlı "MCP YOKTUR" notu.)
- [ ] **Stale `.py` komut katmanı (geniş Faz 13)** — backlog-dışı v2 script atıfları hâlâ var: `kortext-session-start.py`, `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-handover.py`, `kortext-lock.py`, `kortext-consistency-check.py`, `kortext-context-check.py`, `kortext-item-check.py`, `kortext-backlog-{done,health,sync}.py` (rules/commands.md "Çağrılan Script" sütunu + agents/workflows/templates). v3 TS runtime'da bu script'ler yok → komut katmanını gerçek mekanizmaya (engine/UI tetikleme) göre baştan kalibre et.

---

## v3.2.0 — bilinçli ertelenmiş

**Tasarım/UI:** mobile responsive (şu an 1280px+) · a11y (focus var, aria yok) · i18n (Settings seçimi statik; gerçek tr/en) · LocalStorage persistence.

**Engine + workflow:** reviewer-as-step runtime (Faz 13'te kaldırıldı; "agent code review pattern") · Settings/Agents YAZMA editor (şu an readonly; paket immutability) · `+prime` synthetic persona (`agents/prime.md` mi registry'de mi).

**Refactor:** `scripts/` rename (tek dosya `copy-migrations.mjs` → `tools/`/`build/`?) · workflow gate hint syntax (`parallel_with_json` parser doldurmuyor) · `learned.md` topical split (50KB+ olunca).

**Dosya:** `UAT-GUIDE.md` içerik güncelleme (foundation/ + ALL-CAPS + güncel test sayısı).

---

## Açık sorular (Eray ile)

- `scripts/` rename tutalım mı (yanıltıcı ad ama tek dosya, marjinal fayda).
- v3.0.1 borç (app.listen) — v3.1 release öncesi şart, sıraya ne zaman.
- ~~Backlog köprüsü zenginleştirme — step-1 güçlendir mi / "id'ye göre güncelle" köprüsü mü~~ → **yanıtlandı** (2026-06-05): ikisi birden, upsert eklendi (DECISIONS §14.7).
