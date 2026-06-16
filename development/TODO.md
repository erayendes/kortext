# Kortext — TODO

Açık iş listesi. **Bitmiş işler buradan çıkarılır** → tarihçe [DECISIONS.md](./DECISIONS.md)'de, son durum [HANDOVER.md](./HANDOVER.md)'de.

---

## 🔴 KRİTİK UAT #10M (2026-06-09, codex primary) — Üretilen kod merge'e GİRMİYOR: dev-cycle worktree'yi commit ETMEDEN merge ediyor → sahte "done", development boş

> **Sorun KORTEXT'te (codex'te değil).** Codex implementation'da **gerçek kod yazdı** (run-3 worktree: `index.html`, `src/{theme.js,main.js,styles.css}`, tema toggle + localStorage — gerçek), gate'ler bu kodu **okuyup haklı geçti** (gate_runs findings gerçek inceleme). AMA `development` branch'inde **yalnız `kortext scaffold` commit'i** var — T08 kodu yok. Item **done**, gate'ler **pass**, transition **"merged to development"** diyor ama **entegrasyon dalı BOŞ.**

**Kök neden:** Dev-cycle worktree'deki dosyaları **commit ETMİYOR** → `git status --short` = `?? index.html ?? src/` (untracked). Workflow ajana "commit et" diyor ama codex `git add`+`commit` yapmadı. Kortext merge ederken worktree'nin **commit'li** halini alıyor → commit yok → **boş merge** → kod kaybolur. Üstelik:
- **Gate'ler worktree'nin COMMIT'SİZ dosyalarını okuyor** (kodu görüp pass veriyor), ama merge **commit'li** halini alıyor → uyumsuzluk: gate "kod var, pass" derken merge "kod yok" → **sahte done**.
- Ajanın commit'ine güvenmek kırılgan (codex commit etmedi) → tüm üretilen kod sessizce kayboluyor.

**Düzeltilecekler (yeni oturum):**
- [x] ~~**Merge öncesi worktree'yi MOTOR commit etsin**~~ ✅ **(2026-06-12 #10M kod):** `commitWorktreeChanges` (`worktree.ts`) — `git add -A` + (staged varsa) `commit`; inline identity + `--no-verify` + `commit.gpgsign=false` ile kimliksiz/hook'lu checkout'ta da çalışır, best-effort (hata=false, asla throw). `runItem` başarı dalında **no-op guard'dan ÖNCE** `commitWorktree(lease)` çağırıyor (`run-item.ts`); composition `commitWorktreeChanges`'e bağladı, driver `runReadyItems`'a geçiriyor. Ajan commit etmese bile iş artık dalda.
- [x] ~~**No-op guard'ı COMMIT'e bağla**~~ ✅ — `worktreeHasMeaningfulCommit` (`worktree.ts`) **yalnız commit'li tarihçeye** (`base...HEAD`) bakar (kirli ağaca değil — merge commit taşır, uncommitted iş merge'e girmez). Composition'ın `worktreeChanged`'i `worktreeHasMeaningfulChanges`→`worktreeHasMeaningfulCommit`'e geçti: commit'li app/kod dosyası yoksa → recoverable-fail/bounce. Boş merge "done" sayılmaz.
- [x] ~~**Gate ↔ merge tutarlılığı**~~ ✅ — motor commit `test`'e geçişten önce çalıştığı için (faz 1), gate'lerin okuduğu çalışma ağacı = merger'ın taşıdığı commit'li ağaç. Commit, üç görünümü (ajan-yazımı / gate-okuması / merge-taşıması) tek noktada eşitler.
- [x] ~~**Regresyon (executor-bağımsız)**~~ ✅ — `driver-e2e.test.ts`'e `WritesButNeverCommitsExecutor` (gerçek `index.html`+`src/main.js` yazar, **commit ETMEZ** = canlı codex deseni) eklendi: drive sonrası `development`'ta `index.html`+`src/main.js` **gerçekten var**, item done. Fix'siz: yalnız `README.md` (boş merge — RED kanıtlandı). Ek: boş ajan koşusu → in_progress'e bounce + `backlog.implementation.noop`, boş merge yok. (Bug Kortext git-katmanında, executor-bağımsız → deterministik e2e canlı CLI'dan güçlü kanıt.)
- [ ] **(operasyonel, Eray) Tam-zincir UAT:** temiz UAT'ta codex/antigravity ile build'i sonuna kadar koştur — `development`'ta app dosyaları (`index.html`, `src/`) gerçekten görünsün, item done sahte değil.

> **NOT:** Bu, UAT #10L'in ("codex kod yazıyor + no-op guard") devamı — codex artık kod YAZIYOR (✅ kanıtlı) ama Kortext o kodu **commit+merge etmiyor**. Asıl boşluk integrasyon katmanında.

---

## 🔴 KRİTİK UAT #10L (2026-06-09, codex primary) — Codex IMPLEMENTATION adımında KOD YAZMIYOR + #10i no-op tespiti codex'i kapsamıyor

> **Belirti (CANLI):** codex-primary build'de **hiçbir worktree'de uygulama kodu yok** (run-3: 0, run-4: 0 app dosyası; `development`: 0 HTML/CSS/JS). İlk item: implementation `exit 0` → test'e geçti → **3 gate de fail** (`gate fail: design_review, quality_control, security_control` — "denetlenecek kod yok") → bounce → re-implement (yine boş) → sonsuz churn. Yapısal fixler (epic #10k ✅, bağımlılık ✅) tuttu ama **asıl kod üretimi olmuyor.**

**Kök neden (iki katman):**
1. **Codex `exec` implementation adımında dosya YAZMIYOR** — mevcut dosyaları okuyup (rg/sed) `exit 0` dönüyor; yeni HTML/CSS/JS üretmiyor. (Fallover bulgusundaki davranışın aynısı; codex **primary** olunca her item'da.) Daha önce **antigravity** implementation'da kod yazıyordu → executor-bağımlı, codex kırık.
2. **#10i no-op tespiti codex'i KAPSAMIYOR:** "worktree'de değişiklik yoksa succeeded sayma" guard'ı tetiklenmedi — codex muhtemelen ufak/ilgisiz bir dosyaya dokunduğu (veya guard yalnız tam-boş çıktıya baktığı) için "boş" sayılmadı → item test'e ilerledi → gate'ler haklı fail.

**Düzeltilecekler (yeni oturum):**
- [x] ~~**Codex `exec` implementation prompt/komutunu düzelt**~~ ✅ **(2026-06-11 #10L kod — kök=PROMPT, sandbox/cwd zaten doğruydu):** (a) hiçbir executor'a HANGİ item'ın uygulanacağı söylenmiyordu → `ExecutorContext.itemContext`: runItem item'ı (id/başlık/açıklama/AC) `buildItemContext` ile her adımın prompt'una taşır (4 CLI executor da basar); (b) codex prompt'u çıplak metadata ile bitiyordu (antigravity'de "Now perform the Task…" emri vardı → kod yazıyordu) → codex (+gemini) prompt'una CWD + `--- Mandate ---` (dosya ÜRET; salt-okuma=fail+retry) + revize-bloğu eklendi. Eski madde: codex'in görevi "keşif" değil "kod yaz" olarak alması; `codex exec` argümanları (cwd=worktree, yazma izni, `--full-auto`/sandbox `workspace-write`) implementation için gerçekten dosya ürettirsin. Codex'in neden okuyup-yazmadığının kökünü bul (prompt mu, sandbox mı, görev çerçevesi mi).
- [x] ~~**No-op tespitini sıkılaştır**~~ ✅ — `worktreeHasMeaningfulChanges` (`worktree.ts`): değişen dosyalar (uncommitted+committed) içinde en az 1 app/kod uzantısı (.html/.css/.js/.ts/.py/…) yoksa no-op → recoverable-fail; canlı codex deseni (`.env.example`+`.gitignore`+`AGENTS.md`) artık başarı sayılmıyor; git cevaplayamazsa fail-open. Composition wiring güncellendi. Eski madde: "succeeded" için **anlamlı kod değişikliği** ara — yalnız tam-boş değil, **beklenen output/uygulama dosyası (item.outputs veya .html/.css/.js) üretilmediyse** recoverable-fail → fallover/retry. Config-only/okuma-only commit'i başarı sayma.
- [x] ~~**Executor-bağımsız doğrula**~~ ✅ **CANLI (executor-katmanı):** gerçek dev-cycle adım metni + örnek item ile gerçek CLI'lar koşuldu — **codex 0.139.0: 58sn'de index.html+style.css+app.js+test.js yazdı** (önceden 0 dosya), **antigravity: 18sn'de aynı set** (regresyon yok); ikisinde de yeni guard meaningful=true. Tam zincir (gate'ler dahil) Eray'ın UAT'ında. Eski madde: implementation'ın gerçek kod ürettiğini **codex** ve **antigravity** ile ayrı ayrı kanıtla (codex'te kırık, antigravity'de çalışıyordu).
- [ ] **(operasyonel, Eray) Tam-zincir UAT:** temiz UAT'ta build'i sonuna kadar koştur — implementation kod üretsin, gate'ler GEÇSİN, item done'a varsın. Fix doğrudan codex için olduğundan ilk koşuda primary=codex denenebilir; sorun çıkarsa antigravity'e dön.
- [x] ~~**(yan bulgu) Version-floor**~~ ✅ **(2026-06-11 #10L kod)** — `ensureBacklogStructure`: hiçbir item'da version yoksa (hepsi None — codex'in version patch'i parse-error'la düşmüştü) tüm item'lara **varsayılan v0.1** atanır (`backlog.structure.version_defaulted` audit); kısmî-versiyonlu backlog'a dokunulmaz.

---

## 🔴 KRİTİK UAT #10k (2026-06-09, Eray ısrarı) — EPIC oluşmuyor: garanti yalnız planning-COMPLETION hook'unda, erken/görünür değil

> **Belirti (Eray):** Birden fazla codex koşusunda **Board'da epic 0**. #10j'de `ensureBacklogStructure` eklendi AMA yalnız **planning-completion hook'unda** (`status==='succeeded'`) çalışıyor. Sonuç: (1) planning boyunca kullanıcı **epic 0** görüyor, (2) planning bitmeden durdurulursa epic **hiç** oluşmuyor, (3) codex epic'i kendisi üretmediği için tek umut bu görünmez son-adım. Eray'ın net talebi: **EPIC GERÇEKTEN OLUŞSUN ve görünür olsun.**

**Kök neden:** Epic-garanti yanlış zamanda. `ensureBacklogStructure` planning'in en sonuna (succeeded) bağlı; backlog üretilir üretilmez değil. Ajan (codex) `type:epic`/`parent_epic` hiç yazmıyor → enrichment boyunca epic yok → ancak (varsa) son hook'ta sentezleniyor.

**Düzeltilecekler (yeni oturum — EPIC ODAKLI):**
- [x] ~~**Epic'i ERKEN sentezle**~~ ✅ **(2026-06-11 #10k kod)** — epic-garanti `ensureEpicFloor` olarak ayrıldı (`backlog-ingest.ts`) ve **`ingestBacklogFile`'ın sonunda** çalışıyor: backlog-tanm.1'in backlog.yaml'ı DB'ye düştüğü AN ≥1 epic + tüm köksüz task'lar bağlı. Board ilk andan epic gösterir; planning succeeded beklenmez.
- [x] ~~**Her ingest'te idempotent koru**~~ ✅ — `ingestBacklogPatchFile` da her enrichment patch'i sonrası tabanı yeniden garanti eder (epic varsa no-op → çift epic imkânsız); ajan sonradan gerçek epic + `parent_epic` üretirse task'lar ona taşınır, taban kavga etmez. Completion-hook'taki `ensureBacklogStructure` çağrısı duruyor (artık normalde no-op, son savunma hattı).
- [ ] **Görünür + doğrulanır (CANLI, Eray koşar):** planning DEVAM EDERKEN epics>0 — gerçek codex koşusuyla doğrula: backlog üretilir üretilmez Board'da epic var, tüm task'lar bağlı. (Kod hazır + 1258 test yeşil; canlı teyit bekliyor.)
- [x] ~~**(ikincil) Ajan tarafı**~~ ✅ — `planning-pipeline.md` step-1'e "tek bir `type: epic` satırı bile olmayan backlog GEÇERSİZ çıktıdır" sertleştirmesi eklendi.

---

## 🟠 UAT #10 (2026-06-09) — Model seçimi gerçekte `--model`'e BAĞLI DEĞİL (item.model kozmetik) + onboarding'de model seçimi yok

> **Keşif:** Eray "en küçük/hızlı modelleri kullanalım" dedi → Kortext'te böyle bir kaldıraç YOK. `rules/models.md` profilleri (high-reasoning/standard/fast-reasoning) ve item'ın `model` alanı **yalnız bilgi amaçlı**: `backlog-ingest.ts` `item.model`'i DB'ye yazıyor ama hiçbir executor onu `--model` argümanına çevirmiyor (`extraArgs` normal akışta boş). Her CLI **kendi varsayılan modelini** kullanıyor (agy → Gemini 3.5 Flash, codex → varsayılan, claude → varsayılan). Onboarding'de model seçim alanı da yok.

**Sonuç:** "fast-reasoning rutin işe, high-reasoning kritik işe" vaadi **gerçekleşmiyor** — maliyet/hız profili kâğıt üstünde. Token/kota tüketimi de bundan etkileniyor (rutin adımlar pahalı modelde koşabilir).

**Düzeltilecekler (yeni oturum):**
- [ ] **`item.model` profilini gerçek `--model`'e bağla:** profil → executor'a özgü model-id eşlemesi (`high-reasoning`/`standard`/`fast-reasoning` × {claude, codex, gemini/agy}) → step'in executor'ına `extraArgs: ['--model', <id>]` geç. Eşleme `rules/models.md` "Sağlayıcı Seçimi" tablosundan beslenebilir (resmi model-id'leri eklenecek).
- [ ] **Onboarding'de model/hız tercihi:** en azından genel bir "hız/maliyet profili" (ekonomik=hep fast/küçük · dengeli · güçlü) seçeneği; veya operation-manager modeli + persona override (çok-modelli executor TODO'su ile birleşir).
- [ ] **Global "ekonomik mod" anahtarı:** bir UAT/demo için tüm adımları en küçük/hızlı modele zorlayan tek bayrak (`KORTEXT_MODEL_PROFILE=fast` veya onboarding toggle) — hızlı/ucuz deneme için.
- [ ] **Görünürlük:** drawer'da hangi item'ın hangi gerçek model-id ile koştuğunu göster (şu an yalnız profil etiketi var, gerçek model değil).

---

## 🔴 KRİTİK UAT #10 (2026-06-09, codex primary) — Planning epic VE dependency ÜRETMİYOR + aşırı versiyon parçalama → build başlatılamaz

> **Belirti:** codex-primary koşusunda planning succeeded ama backlog yapısız: **18 item, epic 0, epic-link 0, blocked_by 0**, üstelik **~10 ayrı versiyona** dağıtılmış (BRD "tek versiyon v0.1, tek epic" diyordu). owner/version/model 18/18 dolu ama **epic ve bağımlılık hiç yok**. Eray build'i **başlatmadı** — epic+dependency olmadan 18 item paralel = yapısız board + merge conflict riski (UAT #9).

**Kök neden:** Planning enrichment kalitesi **executor-bağımlı**. Workflow (`planning-pipeline.md`) epic container + `parent_epic` + `blocked_by` üretmeyi ZORUNLU kılıyor ama **codex bunları atladı** (yalnız owner/version/model yazdı). Motor-tarafı epic auto-create (#10h) yalnız ajan bir `parent_epic` referansı verirse devreye girer; codex hiç vermediği için **sentezlenecek epic yok** → epic 0. Bağımlılık için motor-tarafı türetme yok → `blocked_by` boş → tüm item'lar `to_do` → sıralama yok. (antigravity koşularında epic+dependency üretiliyordu — saf executor varyasyonu.) Versiyon: BRD'nin "tek versiyon" kısıtı dikkate alınmamış, 10'a bölünmüş.

> **Bağlantı:** UAT #6 "D. İçerik/persona kalibrasyonu" zaten "dependency üretimi KALAN BOŞLUK" + "epic-id konvansiyonu KALAN BOŞLUK" diye işaretliydi (ertelenmişti). Bu UAT o boşluğun **build'i tıkayan kritik** olduğunu gösterdi — artık ertelenemez.

**Düzeltilecekler:**
- [x] ~~**Epic üretimini garanti altına al (motor-tarafı)**~~ ✅ **(2026-06-09 #10j)** — `ensureBacklogStructure`: hiç epic yoksa 1 varsayılan epic (`<CODE>-E01`) sentezler + tüm köksüz task'ları bağlar. Board asla epic'siz kalmaz.
- [x] ~~**Bağımlılık üretimini güçlendir**~~ ✅ **(2026-06-09 #10j)** — hiç `blocked_by` yoksa motor id-sırasına göre lineer zincir türetir (setup→…→son); 18 paralel-aynı-tabandan değil.
- [x] ~~**Versiyon kısıtına uy**~~ ✅ **(2026-06-09 #10j)** — versiyonlar item-sayısının yarısından fazla parçalanmışsa (≈<2 item/versiyon) en erken versiyona toplar. (Motor-tarafı sezgi; BRD-parse gerektirmez.)
- [x] ~~**Executor-bağımsız doğrulama**~~ ✅ — deterministik harness codex-bozuk çıktıyı (18 item/0 epic/0 dep/10 versiyon) birebir üretip floor'u kanıtladı: 1 epic + 17 zincir + tek versiyon + `selectBuildableItems` 1 head. Motor garantisi executor-bağımsız (ingest sonrası DB'de çalışır) → gerçek-codex gereksiz.
- [ ] **(A2 ikincil, kalan) talimat sertleştirme:** `planning-pipeline.md` step-1 item-tavanı + "tek versiyon" + epic/dependency üretimini daha net zorlasın (motor floor güvence ama talimat da iyileşsin).
- [ ] **CANLI epic-doğrulama (UAT #10k):** Gerçek codex koşusunda **versiyon (tek v0.1) + bağımlılık (blocked_by 11/12) CANLI tuttu** ✅; ama **epic-garanti CANLI görülmedi** çünkü hook planning-completion'da çalışıyor ve koşu konsolidasyon onayında durduruldu (planning succeeded olmadı). Sıradaki UAT'ta planning'i sonuna kadar onayla → `ensureBacklogStructure` tetiklenince epics>0 olduğunu canlı teyit et.

**Wiring:** `index.ts` planning-completion hook'unda (`triggerAnalysis` `.then`, `status==='succeeded'`) çağrılır + `backlog.yaml` DB'den yeniden serialize edilir.

> **NOT (ayrı bulgu, aşağıdaki "Planning çıktısı yapısal BOZUK + build başlamıyor"):** (B) build-start — planning sonrası development-cycle otomatik tetiklenmiyor / kullanıcının net "Başlat" yolu yok. Bu fix planning'in YAPISINI düzeltir; build'i BAŞLATMA ayrı iş.

---

## 🔴 KRİTİK UAT #10 (2026-06-09, codex primary) — Planning çıktısı yapısal olarak BOZUK + kullanıcı build'i başlatamıyor

> **Belirti:** codex-primary koşusunda planning "succeeded" ama backlog yapısı küçük MVP için tamamen yanlış. BRD'deki her kısıt yok sayıldı:

| BRD kısıtı | Codex üretti |
|---|---|
| ≤8 item | **18 item** |
| Tek epic yeterli | **0 epic** |
| Bağımlılıklar olsun | **0 dependency** (hiç `blocked_by`) |
| Tek versiyon (v0.1) | **10 ayrı versiyon** (v0.1→v1.0, ~2 item/sürüm) |

**Sonuç:** 18 item 10 sürüme yayılmış, epic yok, bağımlılık yok → build anlamlı ilerleyemez (sürüm-kapısı her sürümde 2 item koşturup 10 sürüm sürünür) ve **Eray build'i başlatamadı** (planning sonrası development-cycle hiç tetiklenmedi; çökme yok ama build başlamıyor).

**İki ayrı sorun:**
- [ ] **(A) Planning kalitesi executor-bağımlı, codex BRD'yi yok sayıyor:** epic-üretimi + bağımlılık + versiyon-dağılımı + item-tavanı talimatları codex'te tutmuyor (antigravity koşularında çoğu tutuyordu). Motor-tarafı zorlama gerek: (a) BRD'de "tek versiyon" denmişse planning **tek versiyon** kullanmalı (sürümleri uydurup yaymasın); (b) epic **zorunlu** (yoksa motor sentezlesin — #10h auto-create var ama codex hiç `parent_epic` yazmadığı için tetiklenmedi → "epic yoksa tüm task'ları tek default epic'e bağla" son-çaresi); (c) item-tavanı + bağımlılık üretimi sertleştir/doğrula. Talimat + motor-fallback birlikte.
- [ ] **(B) Build başlamıyor / kullanıcı başlatamıyor:** planning succeeded + 18 item to_do + version dolu olmasına rağmen development-cycle otomatik tetiklenmedi; kullanıcının net "başlat" yolu yok (Auto belirsiz/çalışmadı). Drive planning sonrası build'i otomatik tetiklemeli VEYA Board'da net çalışan bir "Başlat/Auto" kontrolü olmalı. (Önceki antigravity turlarında otomatik akıyordu — codex/bu koşuda akmadı; drive-arm + build-trigger zincirini incele.)

---

## ✅ ÇÖZÜLDÜ (KRİTİK UAT #10, 2026-06-09 #10i, Claude) — Fallover sonrası implementation kod yazmıyordu → no-op tespiti

> **Belirti:** Build'de neredeyse her item her gate'i fail etti; gate raporları net: *"worktree yalnız `.env.example/.gitignore/AGENTS.md` içeriyor; uygulama kodu YOK → FAIL."* **Kök neden:** agy kotası doldu (429) → implementation codex/claude fallover'a düştü → fallover koşuları dosyaları OKUYUP `exit 0` dönüyor ama kod YAZMIYOR → worktree boş ama "succeeded" → item `test`'e geçiyor → gate boş worktree'yi haklı reddediyor → sonsuz churn.

**Yapıldı (TDD, 1246 test yeşil, typecheck + build temiz — push EDİLMEDİ):**
- ✅ **No-op tespiti (asıl fix):** `runItem`, `exit 0` dönen dev-cycle'ı worktree base'e göre byte-aynıysa başarı SAYMIYOR → recoverable fail (item `in_progress` KALIR → driver retry; worktree karantina; `backlog.implementation.noop` audit). Boş worktree gate'lere ulaşmaz. Enjekte `worktreeChanged` (test git-siz); composition gerçek check'i wire eder.
- ✅ **`worktreeHasChanges(path, baseBranch)` (`worktree.ts`):** uncommitted (`status --porcelain`) VEYA base'in önünde commit (`rev-list base..HEAD`) → değişti. Git cevaplayamazsa fail-open (gerçek build asla yanlış atılmaz).
- ✅ **#2 (config doğru):** codex executor zaten `--sandbox workspace-write` + `cwd: worktreePath` — yazma izni + doğru cwd var. "Oku ama yazma" davranışsal; no-op guard sebepten bağımsız yakalar.
- ✅ **#3 (tasarım gereği):** worktree güncel `development`'tan branch'lenir; aynı-pass paralel item'lar birbirinin merge'ini görmez (izolasyon). Defect yok.
- ✅ **Kanıt:** uçtan-uca harness (gerçek composition + git worktree) — Pass 1 no-op executor → item `in_progress` kalır + gate_runs 0 + noop audit; Pass 2 kod yazan executor → item `done`. Canlı hatayı birebir üretip fix'i kanıtlar.

---

## 🟠 UAT #10 (2026-06-09) — Çelişkili durum: item hem "Review/done" hem "🔒 Locked · waiting on …" + gate "pending" ama token harcanmış

> **Belirti (canlı, T08 "Birim ve Entegrasyon Testleri"):** Drawer'da **Status: Review · 🔒 Locked · "waiting on T03, T04"**, **Quality control: pending** gösteriyor — AMA aynı item'da quality_control **deneme-1'de 42.7K token** harcanmış (gate gerçekte koşmuş) ve **DB'de status = done**. Blocker'lar: T03 done, **T04 in_progress** (bitmemiş).

**Kök neden (kilit bayrağı geçmiş-aşama item'a yanlış uygulanıyor):** T08, blocker'ları (T03+T04) bittiğinde unlock olup koştu → gate geçti → done. Sonra **T04 gate-fail ile `in_progress`'e geri bounce etti** → kilit bayrağı **anlık blocker durumundan** türetildiği için T08 yeniden "locked · waiting on T04" görünüyor — oysa T08 zaten **done**. Sonuç: aynı kartta **done/review** + **locked/pending** çelişkisi; drawer'daki gate "pending" gerçeği yansıtmıyor (gate koştu, token harcandı).

**Düzeltilecekler (yeni oturum):**
- [ ] **Kilit bayrağı yalnız "henüz başlamamış" item'a uygulansın:** item `done`/`review`/`test` (yani çalışmış/ilerlemiş) ise blocker sonradan regrese olsa bile **"locked · waiting" gösterme** — geçmiş aşamayı geri-kilitleme. (Eray'ın modeli: kilit = To Do'daki başlamamış işin rozeti; başlamış/bitmiş item geri kilitlenmez.)
- [ ] **Gate rozeti gerçek durumu yansıtsın:** drawer'da gate "pending" derken aynı gate'te token harcanmış/`gate_runs`'ta pass/fail varsa → "pending" YANLIŞ. Gate badge `gate_runs` son durumundan (pass/fail/running/pending) türetilsin; harcanan token "pending" ile çelişmesin.
- [ ] (bağlantılı) Blocker regrese olunca (T04 bounce) zaten-done bağımlı item'ın ne olacağını netleştir: done kalsın mı (büyük ihtimalle evet, kodu merge'lendi) yoksa yeniden mi doğrulansın — ama "done + locked-waiting" çelişkili görüntüsü olmasın.

---

## 🟠 UAT #10 (2026-06-09) — Yetim (orphan) daemon temizliği: purge/stop canlı süreci de öldürmeli

> **Belirti:** Her UAT turunda :3200'de kayıtsız bir "uninitialized" daemon kalıyor → yeni proje :3201'e düşüyor. **Kök:** `kortext purge`/`stop` yalnız registry'ye kayıtlı projeleri yönetir; daemon'lar detached+unref'li doğduğu için önceki turlarda purge registry kaydını sildi ama OS sürecini öldürmedi → süreç portta asılı yetim kaldı. Sadece `lsof -ti:<port> | xargs kill` ulaşıyor. Eray: yetim kalmamalılar.

- [ ] **purge/stop canlı süreci de öldürsün (atomik):** kayıt silinirken kayıtlı PID/port'tan süreç de sonlandırılsın.
- [ ] **Orphan-sweep komutu:** registry'de olmayan ama kortext portlarında (3199–32xx) yaşayan daemon'ları bul+kapat (`kortext doctor` / `kortext stop --all --orphans`).
- [ ] **Daemon self-check (bellboy genişletme):** gerçek daemon periyodik "registry'de kayıtlı mıyım?" baksın; değilse kendini kapatsın (şu an yalnız :3199 sihirbazı self-shutdown yapıyor).

---

## ✅ ÇÖZÜLDÜ (KRİTİK UAT #10, 2026-06-09 #10h, Claude) — Epic auto-create BASE full-mode ingest'i kapsamıyordu → backlog BOŞ

> **Belirti:** Temiz UAT (antigravity→codex→claude). Backlog DB **tamamen boş (total 0)** — `backlog.ingest.summary` full-mode: `created 0, skipped 8`, 8 task da `FOREIGN KEY constraint failed`. **Kök neden:** ajan 8 task'ı çıplak `parent_epic: <id>` + `type:epic` container OLMADAN yazdı; BASE full-mode ingest eksik epic'i önce yaratmıyordu → her insert FK ihlali → backlog boş. #10 epic-auto-create yalnız `patchBacklogItems`'taydı, full-mode'u kapsamıyordu.

**Yapıldı (TDD, 1241 test yeşil, typecheck + build temiz — push EDİLMEDİ):**
- ✅ **Tek ortak helper `synthesizeMissingEpics(repos, parsed)`:** items içinde `type:epic` container'ı OLMAYAN + DB'de de bulunmayan her çıplak `parent_id` için placeholder epic'i (id=title) ÖNCE yaratır. **Hem base full-mode `ingestBacklogItems` HEM patch-mode `patchBacklogItems` bunu kullanıyor** (tek kaynak). Audit `backlog.epic_synthesized`.
- ✅ **FK-dayanıklı base insert:** full-mode insert loop'unda `parent_id` çözülemiyorsa (epic yazılamadı/dangling) item düşmez — link null'lanır + `backlog.ingest.dangling_parent` uyarısı, item + enrichment'i (version/owner/model) yine yazılır. Backlog ASLA boş kalmaz.
- ✅ **Sentez sırası:** `deriveSyntheticEpics` (epic: label) + `enforceSymmetricDeps` SONRA `synthesizeMissingEpics` (bare parent_epic id) → insert loop'tan ÖNCE → FK hedefi hep var.
- ✅ **Kanıt:** uçtan-uca harness (gerçek `ingestBacklogFile` full path) İKİ ajan varyasyonuyla — (A) çıplak parent_epic, epic container yok (kırık UAT şekli) + (B) epic'i type:epic item yazan: ikisinde de total>0, epic auto-created, her task linked + version/owner/model dolu, FK skip yok.
- ✅ **(ikincil) Workflow:** `planning-pipeline.md` step-1 zaten epic'i `type:epic` item üretmeye zorluyor (#10b) + motor son-çare fallback'i belirtiyor — fix bu vaadi base full-mode için de gerçek yaptı.

---

## 🤖 Çok-modelli executor — onboarding seçimi = operation-manager modeli (2026-06-08, UAT/Eray vizyonu)

> Şu an executor **proje genelinde tek** (`project.json.executor`) — her persona/adım aynı CLI'yi kullanıyor. Eray'ın istediği model: onboarding'de seçilen executor **sadece operation-manager (orkestratör) içindir**; sonrasında **birden çok model eşzamanlı** çalışabilmeli (persona/görev bazında farklı executor — örn. analiz adımları agy, kritik kodlama claude, vb.).

- [ ] **Onboarding semantiği:** "AI Executor" alanını "operation-manager modeli" olarak çerçevele (etiket + yardım metni). Bu seçim orkestratörün modeli olur.
- [ ] **Settings/Agents:** her persona için model/executor override edilebilir alan (v3.2 yazma kapsamıyla uyumlu).

---

## 🚀 v3.1 release + CLI follow-up (2026-06-06)

> v3.1 CLI per-project-daemon **tamam** (11 görev, 835 test, paketlenmiş smoke test geçti). Kalan:

- [ ] **PUBLISH:** Eray "push" → `git push origin main`, ardından `npm publish` (kasıtlı manuel adım). Yayın sonrası mevcut global `/opt/homebrew/bin/kortext` eski → `kortext update` veya yeniden global install.

---

## 🔧 Faz-3 + Motor dilimleri follow-up (2026-06-06)

> Motor/şema epic §5.9 ana iş **bitti + main'de**. Kalan:

- [ ] **Prod push (CI) substratı:** `git push origin main`/CI tetikleme; gerçek prod altyapısı gelince.
- [ ] **Full planning pipeline canlı dayanıklılık:** `dev:run planning-pipeline --executor=claude` step-1'i ürtti ama bir sonraki zenginleştirme adımında askıda kaldı (~70dk, kill). Adım-zaman aşımı / hung-claude tespiti + full 9-adım uçtan uca canlı koşu (auto-approve poller ile) ayrı teyit.

---

## 🔍 UAT bulguları — canlı koşu UI incelemesi (2026-06-06, TaskFlow sandbox)

> Eray `kortext-live-uat-v2` verisini gerçek UI'da gezdi. Aşağısı kalan boşluklar.

**A. Board (`src/routes/board.tsx`)**
- [ ] **Dependency gösterilmiyor** — drawer'da blocks/blocked_by yok.
- [ ] **item-id'ler slug** — `init-nextjs-project` gibi slug'lar var; proje-kodlu kısa id konvansiyonu (`TF-001`) yok → persona/workflow kalibrasyonu (D) gerek.

**B. Dashboard (`src/routes/dashboard.tsx`)**
- [ ] **Active work / For review boş** — koşu bittiği için boş (beklenen). Netleştir: bitmiş koşu geçmişi gösterilmeli mi, yoksa "boş = doğru" mu.

**D. İçerik / persona kalibrasyonu**
- [ ] **⚠️ Dependency üretimi (içerik) — KALAN BOŞLUK** — sertleştirilmiş talimata rağmen ajan faz-3 koşusunda **0 dependency** üretti (büyük step-1'de alt-madde gözden kaçtı). Şu an **yalnız görsel** boşluk: motor `blocked_on`'a göre iş sıralamıyor. Daha güvenilir çözüm: planning'e **yalnız dependency atayan ayrı bir adım**. Eray kararı: şimdilik ertele.
- [ ] **⚠️ Epic-id konvansiyonu — KALAN BOŞLUK** — ajan task'lara `TF-NNN` uyguladı ama epic'lere `<CODE>-E01` uygulamadı; epic'ler hâlâ slug (`epic-seo-legal`). Eray kararı: şimdilik ertele.

---

## ⭐ Sırada

- [ ] **Onboarding sidebar — zengin proje kartı verisi (2026-06-15, Eray onayı):** Yeni sidebar'lı onboarding tasarımındaki "Recent projects" kartları kod (NOT), platform chip (Web/iOS), versiyon + ilerleme çubuğu (v0.3 · 64%) gösteriyor. `/api/projects` (ExistingProject) şu an sadece slug/name/path/port/status/url döndürüyor → kartlar şimdilik isim + durumla çiziliyor. Gerekli: projects route'unu her projenin `blueprint.json` meta'sından **kod + platform + versiyon** ile zenginleştir; ilerleme % backlog aggregate gerektirir (proje daemon'ı sorgulanmalı) — ayrı/ertelenebilir.
- [ ] **Onboarding "Setup" sekmesi — canlı akışa bağla (UI tamam, veri temsilî) (2026-06-16, Eray onayı):** Setup sekmesi tasarımdaki iki-panelli "Project initializing…" görünümünü kuruyor — sol faz rayı (Analysis/Planning/Environment + durum pill'leri) + sağ activity stream. Ancak `SETUP_PHASES`/`SETUP_ACTIVITY` **kodda sabit** (`OnboardingScreen.tsx`); başlıkta "preview" rozeti var. Gerekli: Initialize → submit sonrası gerçek blueprint-faz durumu (`GROWTH.md`/`LEGAL.md`… lifecycle) + canlı activity (`/api/runs` / activity) ile besle; "Review" düğmeleri ilgili dosyayı reader drawer'da açsın; "Open dashboard" tüm fazlar bitince route etsin.
- [ ] **Hooks — motora bağla (UI hazır, tetikleme yok) (2026-06-15, Eray onayı):** `GET/PUT /api/hooks` toggle'ları `settings/hooks.json`'a kaydediyor ama **motorda tüketicisi yok** (grep: consumer 0). "PreToolUse blocks dangerous patterns", "PostToolUse audit logger" vb. açıklamalar var ama toggle gerçek davranışı kontrol etmiyor (secret-scanner/audit bağımsız çalışıyor). Gerekli: orchestrator lifecycle event'lerinde `hooks.json`'ı okuyup enabled hook'ları (ve `command`'ı) uygulasın. UI'da "saved · not wired yet" rozeti eklendi. Riskli motor işi — yanlış hook tüm koşuları bozar.
- [ ] **Scripts — runner + registry (tamamen statik) (2026-06-15, Eray onayı):** `scripts.tsx` "no backend yet" — modeller kodda sabit (`INITIAL`), Run düğmesinin `onClick`'i yok, toggle'lar reload'da kaybolur. Gerekli: script-registry (proje `package.json` script'leri ya da tanımlı komutlar) + `POST /api/scripts/:id/run` runner endpoint'i. **Güvenlik:** rastgele komut çalıştırma riski — sadece allow-list'lenmiş/tanımlı script'ler. UI'da "preview · no runner yet" rozeti eklendi.
- [ ] **Integrations operasyonel bağlama (GUI tamam, backend açık) (2026-06-15, Eray onayı):** Integrations *saklama* katmanı çalışıyor (token maskeli `secrets.env`, GitHub config `settings/integrations.json`, testler yeşil) ama **hiçbir ajan/git akışı bunları okumuyor.** Gerekli: (1) `INTEGRATION_GITHUB_TOKEN`'ı gerçek `git push`/PR akışında kullan (`server/engine/git-commit.ts` şu an sadece local commit, "No git push — documented follow-up"); (2) GitHub config `autoCommit` → orchestrator commit davranışına bağla; (3) `prApproval` → merge öncesi onay kapısı. Şu an UI'da "Connected ✓" + 2 toggle çalışır görünüyor ama etkisiz (store-only A5 kararının sonucu, bug değil). Environments turundan sonra ayrı epic.
- [ ] **İçerik kalibrasyonu (ölçüldü, ayrı karar):** `rules/behavior.md` 16 KB (~4K token, her adımda — ama claude'da cache'li, codex/gemini'de stable prefix'te) · en büyük persona `engineering-manager.md` 13.8 KB. Kırpma davranış riski taşır (hangi kural hangi UAT fix'ine bağlı) → Eray onayıyla ayrı tur.
- [ ] **Concurrency knob'ları (opsiyonel)** — workflow-içi `concurrency=3` (`worker-pool`/`commands.ts`) ve `maxConcurrentWorktrees=10` ayarlanabilir tavanlar. Eray "daha fazla paralel" isterse yükselt; gerçek ajanlarda kaynak/maliyet ödünleşimi var.
- [ ] **Standalone CLI'a ingester bağla** — `kortext start` (commands.ts) `safetyGuards` almıyor → ingester sadece backend (onboarding/drive) yolunda ateşleniyor. CLI yolunu da besle.
- [ ] **`/api/backlog` gerçek sayfalama** — faz-1'de Board+Dashboard `?limit=500` ile band-aid yapıldı. Gerçek sayfalama/sonsuz-kaydırma >500 item'lı projeler için açık kalır.
- [ ] **Transient retry — codex/gemini executor** — `spawnCliWithRetry` paylaşımlı helper hazır; codex/gemini executor'ları hâlâ `spawnCli`'ı doğrudan çağırıyor.
- [ ] **Manuel UAT (paketlenmiş)** — clean klasör + `npm pack` + `npm install -g ./kortext-3.X.X.tgz` + `kortext init` + `kortext serve` ile **paketlenmiş** akışın doğrulaması (bu oturum kaynak-modda UAT yaptı; tgz akışı ayrı).
- [ ] **v3.1.0 release flow** — `package.json` 3.0.0→3.1.0, CHANGELOG `[Unreleased]`→`[3.1.0]` + yeni `[Unreleased]`, `git tag v3.1.0`, npm publish. Sıralama: paketlenmiş UAT pass + CLI redesign kuyruğu + v3.0.1 EADDRINUSE fix sonrası.

---

## Motor — ertelenen backend dilimleri

> Motor/şema epic §5.9 ana iş **bitti + main'de** (lifecycle + capstone + son montaj + driver + `POST /api/drive` + scheduler). Tarihçe [DECISIONS §5](./DECISIONS.md). Aşağısı = dilim-içi ertelenen alt-işler.

- [ ] **blocker-temizle (§5.9 #6)** — closure'da `clearBlockedDependents` var ama `blocked` status-flip modeli ayrı; UAT #9 #1 fix'i bağımlılığı scheduler'da (`selectBuildableItems`) çözüyor. (Eray: şema-tabanlı blocked modeli ertelendi.)
- [ ] **Board "sıra kimde" rozetini bağla (src/)** — `whoseTurn(item)` türetimi hazır (`server/orchestrator/whose-turn.ts`) ama tüketen UI yok. Kart üstüne dönen persona rozetleri (test→paralel, review→+prime, in_progress→owner).

---

## UI — açık parçalar

- [ ] **#9 global arama** — header ⌘K paleti var ama gerçek arama backend'ine bağlı değil ("SOON").
- [ ] **#10 terminal = komut girişi** — şu an salt-okunur run-history timeline; gerçek komut girişi.
- [ ] **Canlı gate pass/fail** — `gate_runs` panelde (şu an gate'ler `itemGates` ile statik; UI gate_runs'ı tüketmiyor — `board-drawer.ts:433` notu). **Artık gerçek verdict verisi var** (UAT #9 #4 → gate_runs gerçek pass/fail + findings) → API'de expose + drawer'da göster bekliyor.
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

## İçerik review turu (Faz 13 kalibrasyon)

`development/` cleanup bitince çekirdek akış dosyalarının içeriği gözden geçirilecek:

- [ ] `templates/AGENTS.md` (AI bootstrap) · `agents/*.md` (14 persona) · `rules/*.md` (6 rule) · `workflows/*.md` (10 workflow) · `templates/{foundation,references,reports,memory,backlogs}/*.md` (iskelet).
- [ ] Bilinen risk: `existing-project-analysis.md` (hızlı yazıldı, kalibre), `spike-pipeline.md` (dinamik persona oversimplification).
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
