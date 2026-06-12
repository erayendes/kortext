# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**
>
> Bu dosya = **pusula** (son 2-3 devir + açık işler + linkler). Tüm tarihçe [DECISIONS.md](./DECISIONS.md)'de, açık iş listesi [TODO.md](./TODO.md)'de.

---

## ⭐ Şu an (2026-06-12 #10M kod) — Üretilen kod artık development'a MERGE OLUYOR: motor worktree'yi commit ediyor (boş-merge bug'ı kapandı)

Yalnızca kod oturumu. UAT #10M'in dört kod maddesi TDD ile çözüldü. **1288 test yeşil** (1275→+13), typecheck + build + `npm pack` temiz. **PUSH EDİLMEDİ / commit edilmedi** — #10j/#10k/#10L ile aynı çalışma ağacında, Eray "push" diyene dek local.

- **Kök neden (commit/merge impedansı):** ajan worktree'ye dosya YAZIYOR ama `git commit` ETMİYOR → üç görünüm uyuşmuyor: (1) ajan dosyayı **untracked** bırakır; (2) gate'ler **çalışma ağacını** okur (dosyayı görür → pass); (3) `WorktreeManager.release(merge:true)` **branch HEAD**'i merge eder (commit yok → boş). Sonuç: `development` boş merge alır → sahte "done".
- **1. Motor commit (`commitWorktreeChanges`, `worktree.ts`):** `git add -A` + (staged varsa) commit; inline `user.name/email` + `--no-verify` + `commit.gpgsign=false` ile kimliksiz/hook'lu checkout'ta da çalışır, best-effort (hata=false, asla throw). `runItem` başarı dalında **no-op guard'dan önce** `commitWorktree(lease)` çağırır (`run-item.ts` yeni opsiyonel dep); composition wire eder, driver geçirir.
- **2. No-op guard COMMIT'e bağlandı (`worktreeHasMeaningfulCommit`, `worktree.ts`):** yalnız `base...HEAD` commit'li tarihçeye bakar (kirli ağaca değil — merge commit taşır). Composition `worktreeChanged`'i `worktreeHasMeaningfulChanges`→`worktreeHasMeaningfulCommit`'e geçti: commit'li app dosyası yoksa bounce. (Eski `worktreeHasMeaningfulChanges` + #10L testleri duruyor.)
- **3. Gate ↔ merge tutarlılığı:** motor commit `test`'e geçişten önce (faz 1) çalıştığı için gate'in okuduğu ağaç = merger'ın taşıdığı commit'li ağaç. Commit üç görünümü eşitler.
- **4. Regresyon (executor-bağımsız, deterministik):** `driver-e2e.test.ts` `WritesButNeverCommitsExecutor` (gerçek `index.html`+`src/main.js` yazar, **commit etmez** = canlı codex deseni) → drive sonrası `development`'ta dosyalar **gerçekten var**, item done. Fix'siz RED: yalnız `README.md` (boş merge kanıtlandı). + boş ajan koşusu bounce + noop audit, boş merge yok.

**SIRADAKİ (Eray, tam-zincir UAT):** rebuild + temiz UAT → build'i sonuna kadar koştur: codex/antigravity ile `development`'ta app dosyaları (`index.html`, `src/`) gerçekten görünsün, item done sahte olmasın. Kalan açık TODO'lar: model→`--model` bağlama, build-start görünürlüğü.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm install -g ./kortext-3.1.0.tgz
kortext stop not; kortext purge not --yes
```
(`.tgz` bu oturumda yeniden üretildi.)

---

## ⭐ Önceki (2026-06-09 UAT #10M, codex primary) — Çok fix CANLI tuttu ✅ ama üretilen KOD MERGE'E GİRMİYOR (yeni KRİTİK)

Eray temiz UAT koştu (codex→antigravity→claude, :3201), planning'i sonuna kadar onayladı + Auto. **Bu turda CANLI kanıtlananlar:**
- ✅ **#10k epic erken** (`default_epic`, 9 task bağlı, planning devam ederken).
- ✅ **version-collapse floor:** `backlog.structure.version_collapsed` → codex 10 versiyona bölmüştü, floor **tek v0.1'e topladı**.
- ✅ **bağımlılık floor:** blocked_by 8 → sıralı build.
- ✅ **#10L codex KOD YAZIYOR:** run-3 worktree'de `index.html` + `src/{theme.js,main.js,styles.css}` (gerçek tema kodu). Gate'ler bu kodu **okuyup haklı geçti** (gate_runs findings gerçek).

**🔴 KRİTİK YENİ (TODO "UAT #10M"):** Üretilen kod **`development`'a merge OLMUYOR.** T08 done + 3 gate pass + "merged to development" diyor ama development'ta **yalnız `kortext scaffold` commit'i** var, kod yok. Kök: **dev-cycle worktree'yi commit ETMİYOR** (`git status` = `?? index.html ?? src/` untracked); ajan (codex) commit yapmadı, Kortext merge ederken commit'li hali aldığı için **boş merge** → kod kaybolur. Gate worktree'nin commit'siz dosyalarını okuyup pass veriyor ama merge boş → **sahte done.** Sorun KORTEXT integrasyon katmanında (codex'te değil — codex kodu yazdı). Eray durdurdu.

**SIRADAKİ (yeni fix oturumu):** (1) merge öncesi MOTOR `git add -A && commit` (ajan commit etmese bile); (2) no-op guard'ı commit'li diff'e bağla (boş merge done sayılmasın); (3) gate↔merge aynı ağaç durumunu görsün; codex+antigravity ile development'ta app dosyaları gerçekten görünsün. Detay [TODO.md](./TODO.md). **UAT ortamı:** `not` :3201 durduruldu → `kortext purge not --yes`.

---

## ⭐ Önceki (2026-06-11 #10L kod) — Codex implementation artık KOD YAZIYOR (canlı kanıtlı) + anlamlı-kod guard'ı + version-floor v0.1

Yalnızca kod oturumu. UAT #10L'nin üç maddesi TDD ile çözüldü. **1275 test yeşil** (1258→+17), typecheck + build + `npm pack` temiz. **PUSH EDİLMEDİ / commit edilmedi** — #10j/#10k ile aynı çalışma ağacında, Eray "push" diyene dek local.

- **1. Kök neden = PROMPT (sandbox/cwd DEĞİL** — `--sandbox workspace-write` + cwd=worktree zaten doğruydu**):**
  - **(a) Item hiç prompt'a girmiyordu:** dev-cycle adımı "sana atanan item'ı uygula" diyor ama HANGİ item olduğunu hiçbir executor'a söylemiyordu. Fix: `ExecutorContext.itemContext` — `runItem` item'ı (id/başlık/açıklama/acceptance criteria) `buildItemContext` (`run-item.ts`) ile render edip `runWorkflow`'a geçirir; 4 CLI executor da prompt'a basar ("Work Item (implement THIS)").
  - **(b) Codex prompt'unda emir yoktu:** çıplak metadata ile bitiyordu (antigravity'nin "Now perform the Task… invoke your write tool" emri vardı → kod yazıyordu; saf executor varyansı). Fix: codex (+aynı zafiyetteki gemini) prompt'una CWD satırı + `--- Mandate ---` ("create/modify real files; reading alone is NOT acceptable — no file changes = failed and retried") + revize-geri-bildirim bloğu (gate bulguları artık codex re-code'una da ulaşıyor; eskiden yalnız claude'a gidiyordu).
- **2. No-op guard sıkılaştı (#10i → #10L):** `worktreeHasMeaningfulChanges` (`worktree.ts`) — değişen dosyalar (uncommitted + committed, rename-aware) içinde **en az 1 app/kod uzantısı** (.html/.css/.js/.ts/.py/… ~30 uzantı) yoksa dev-cycle succeeded SAYILMAZ → recoverable-fail + retry. Canlı codex deseni (yalnız `.env.example`+`.gitignore`+`AGENTS.md`) artık yakalanıyor; .md/.json/.yml/dotfile TEK BAŞINA yetmez; git cevaplayamazsa fail-open (#10i kuralı). Composition wiring bu fonksiyona geçti; noop audit mesajı güncellendi.
- **3. Version-floor:** `ensureBacklogStructure` — hiçbir item'da version yoksa (hepsi None; canlı koşuda codex'in version patch'i parse-error'la düşmüştü) tüm item'lara **varsayılan v0.1** (`versionDefaulted` sonucu + `backlog.structure.version_defaulted` audit). Kısmî-versiyonlu backlog'a dokunmaz.
- **CANLI KANIT (executor-katmanı, bu oturumda koşuldu):** gerçek dev-cycle adım metni + örnek item ("not alma app'i") ile gerçek CLI'lar: **codex 0.139.0 → 58 sn'de index.html + style.css + app.js + test.js** (önceden: 0 dosya, okuyup exit 0); **antigravity (agy) → 18 sn'de aynı set** (regresyon yok). İkisinde de `worktreeHasMeaningfulChanges` = true. Doğrulama scripti scratch'ti (commit edilmedi).

**SIRADAKİ (Eray, tam-zincir UAT):** rebuild + temiz UAT → build'i sonuna kadar koştur: implementation kod üretsin, **gate'ler geçsin**, item done'a varsın. Fix codex içindi → ilk koşuda primary=codex denenebilir. Kalan açık TODO'lar: model→`--model` bağlama, build-start görünürlüğü.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm install -g ./kortext-3.1.0.tgz
kortext stop not; kortext purge not --yes
```
(`.tgz` bu oturumda yeniden üretildi.)

---

## ⭐ Önceki (2026-06-09 UAT #10L, codex primary) — #10k epic CANLI KANITLANDI ✅ ama codex IMPLEMENTATION kod yazmıyor → build churn (yeni KRİTİK)

Eray temiz UAT koştu (zincir codex→antigravity→claude, :3200), planning'i sonuna kadar onayladı, Auto açtı. **Kanıtlananlar:**
- ✅ **#10k epic ERKEN canlı tuttu:** backlog-tanm.1 biter bitmez (planning daha devam ederken) `backlog.structure.default_epic {"parented":8,"reason":"agent produced no epic"}` → epic 1 + 8 task bağlı. Eray'ın "epic olmuyor" şikâyeti **çözüldü.**
- ✅ **Bağımlılık floor:** planning bitince `backlog.structure.derived_deps` → blocked_by 7 → sıralı build.
- ✅ owner 8, model 9, epic-link 8, FK yok.

**🔴 KRİTİK YENİ (TODO "UAT #10L"):** Build'de codex **implementation kod YAZMIYOR** — hiçbir worktree'de app dosyası yok (run-3/run-4: 0 .html/.css/.js), development boş. İlk item: impl `exit 0` → test → **3 gate de fail** ("denetlenecek kod yok") → bounce → re-impl (yine boş) → churn. (a) Codex `exec` implementation'da dosya üretmiyor (okuyup exit 0); antigravity yazıyordu → executor-bağımlı. (b) #10i no-op tespiti codex'i kapsamadı (boş worktree'yi succeeded saydı). Eray durdurdu.

**🟠 Yan bulgular:** version hâlâ `None` (codex version patch'i **parse-error** ile dropped + floor None'ları toplayamıyor → **floor hiç version yoksa varsayılan v0.1 ATAMALI**). Model→`--model` bağlanmıyor (item.model kozmetik, ayrı TODO).

**SIRADAKİ (yeni fix oturumu):** (1) codex `exec` implementation gerçekten kod yazsın (cwd/sandbox/prompt-çerçeve) + (2) no-op tespitini sıkılaştır (beklenen output/app dosyası yoksa recoverable-fail) + (3) version-floor varsayılan v0.1. **codex VE antigravity ile** doğrula. Operasyonel: doğrulanana kadar UAT primary=antigravity. **UAT ortamı:** `not` :3200 durduruldu → `kortext purge not --yes`.

---

## ⭐ Önceki (2026-06-11 #10k kod) — Epic-garanti İNGEST ANINA taşındı: Board planning'in ilk saniyesinden epic gösterir

Yalnızca kod oturumu (UAT değil). UAT #10k'nın kök nedeni (epic-garanti yalnız planning-COMPLETION hook'unda → planning boyunca "epic 0", erken durdurulan koşuda epic HİÇ yok) TDD ile çözüldü. **1258 test yeşil** (1253→+5), typecheck + build + `npm pack` temiz. **PUSH EDİLMEDİ / commit edilmedi** — #10j ile aynı çalışma ağacında, Eray "push" diyene dek local.

- **`ensureEpicFloor(repos, opts)` (`backlog-ingest.ts`):** #10j'deki epic-garanti `ensureBacklogStructure`'dan ayrıldı (davranış aynı: hiç epic yoksa `<CODE>-E01` sentezle + köksüz task'ları bağla; idempotent, çift epic imkânsız).
- **İngest-anı tetik (asıl fix):** `ingestBacklogFile` (backlog-tanm.1'in backlog.yaml'ı) VE `ingestBacklogPatchFile` (her enrichment patch'i) sonunda taban çalışır → backlog DB'ye düştüğü an epics≥1, Board ilk andan epic gösterir, planning succeeded BEKLENMEZ. `index.ts` ingest opts'a `defaultEpicTitle` (proje adı) eklendi; epic taban console-log + `backlog.structure.default_epic` audit ile görünür.
- **Muhafazakâr:** ajan sonradan gerçek epic + `parent_epic` üretirse task'lar ona taşınır (test kilitliyor); completion-hook'taki `ensureBacklogStructure` duruyor (artık normalde no-op, son savunma hattı; deps + versiyon garantileri hâlâ yalnız orada).
- **(ikincil)** `planning-pipeline.md` step-1: "sıfır `type: epic` = geçersiz çıktı" sertleştirmesi.

**SIRADAKİ (Eray, CANLI doğrulama):** rebuild + temiz UAT başlat; backlog-tanm.1 biter bitmez (planning daha SÜRERKEN) Board'da epic≥1 + task'lar bağlı görünmeli — succeeded beklemeye gerek yok. Planning'i sonuna kadar onaylarsan #10i implementation'ın gerçek kod üretimi de canlı test edilir (hâlâ bekleyen madde).

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm install -g ./kortext-3.1.0.tgz
kortext stop not; kortext purge not --yes
```
(`.tgz` bu oturumda üretildi — `npm run build && npm pack` tekrar gerekmiyor.)

---

## ⭐ Önceki (2026-06-09 UAT #10k, codex primary) — Canlı: versiyon + bağımlılık DÜZELDİ; epic-garanti DOĞRULANAMADI (planning erken durduruldu)

Eray temiz UAT koştu (zincir codex→antigravity→claude, :3200). **Planning sırasında (konsolidasyon onay kapısında) gözlendi** — sonra Eray stop etti, build'e gelinmedi. Canlı bulgular:
- ✅ **Versiyon düzeldi:** 12 item **tek `v0.1`** (önceki codex turu 10 versiyona bölmüştü). #10j versiyon-toplama tutuyor gibi.
- ✅ **Bağımlılık düzeldi:** **blocked_by 11/12** (önceki codex turu 0'dı) → sıralı build çalışacak. (Bu enrichment patch'lerden geldi; auto-block aktif.)
- ✅ owner/model 12/12, FK/dropped yok.
- ⚠️ **Epic 0 — ama REGRESYON DEĞİL:** `ensureBacklogStructure` epic-garanti hook'u **planning-completion'da** (`status==='succeeded'`) çalışıyor; bu koşu konsolidasyon onayında **durdurulduğu için planning succeeded OLMADI** → hook hiç tetiklenmedi → epic 0 beklenen. **Epic auto-create'in CANLI tetiklendiği henüz görülmedi** (harness'te kanıtlı, gerçek-LLM tamamlanmış planning'de doğrulanmalı).

**SIRADAKİ:** Temiz UAT'ı planning'i **sonuna kadar onaylayarak** koştur (durdurma) → planning succeeded olunca: (a) epic auto-create CANLI tetikleniyor mu (epics>0), (b) build başlıyor mu, (c) **#10i implementation gerçek kod üretiyor mu** (hâlâ canlı test edilmedi — build'e hiç gelinmedi). Açık TODO'lar: model→`--model` bağlama (kozmetik), epic-CANLI doğrulama. **UAT ortamı:** `not` :3200 (durduruldu) → temiz başlatmadan önce `kortext purge not --yes`.

---

## ⭐ Önceki (2026-06-09 #10j) — Motor-tarafı yapısal zemin: epic + bağımlılık + versiyon GARANTİ (executor-bağımsız)

Yalnızca kod oturumu (UAT değil). UAT #10j'in 🔴 KRİTİK bulgusunun **(A) yapı kısmı** (codex BRD'yi yok saydı: 18 item, 0 epic, 0 dependency, ~10 versiyon → yapısız backlog → build başlatılamaz) TDD ile çözüldü. **1253 test yeşil** (1246→+7), typecheck + build temiz. **PUSH EDİLMEDİ** — Eray "push" diyene dek local.

- **Tek motor garantisi `ensureBacklogStructure(repos, opts)` (`backlog-ingest.ts`)** — planning bittiğinde çalışır, **hangi executor koştuğundan bağımsız**, idempotent + muhafazakâr (sağlam çıktıya dokunmaz):
  - **1. Epic garantisi:** hiç epic yoksa + köksüz task varsa → **1 varsayılan epic** sentezler (`<CODE>-E01`, başlık=proje adı) + tüm köksüz task'ları ona bağlar. Board asla epic'siz kalmaz.
  - **2. Bağımlılık:** hiç `blocked_by` yoksa → id sırasına göre **lineer zincir** türetir (T-2→T-1, T-3→T-2…) → 18 paralel-aynı-tabandan yerine sıralı build (UAT #9 stall'ı önlenir).
  - **3. Versiyon aklı:** versiyonlar item-sayısının yarısından fazlaya parçalanmışsa (≈<2 item/versiyon — codex'in 18 item/10 versiyonu) → en erken versiyona toplar.
- **Wiring:** `index.ts` planning-completion hook'unda (`triggerAnalysis` `.then`, chain `planning-pipeline`'a ulaştıktan sonra `status==='succeeded'`) çağrılır; sonra `backlog.yaml` DB'den yeniden serialize edilir (Board + sonraki tüketici normalize yapıyı görür). Best-effort (hata planning'i bozmaz).

**KANIT (deterministik harness — codex-bozuk çıktıyı birebir üretir):** 18 task, 0 epic, 0 dep, 10 versiyon → `ensureBacklogStructure` → **1 epic** (hepsi bağlı), **17/17 bağımlılık zinciri**, **versiyon 10→1 (v0.1)**, ve `selectBuildableItems` artık **18 paralel yerine TEK build head** (NOT-001) görüyor. Motor garantisi executor-bağımsız olduğu için gerçek-codex koşusu gereksiz (fix ingest sonrası DB durumunda çalışır). Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. **Kalanlar (bu turda DEĞİL):** (A2) talimat sertleştirme (planning-pipeline.md item-tavanı + tek-versiyon) ikincil; **(B) build-start** — planning sonrası build otomatik tetiklenmiyor / kullanıcının net "Başlat" yolu yok (ayrı bulgu, TODO'da). Rebuild + temiz UAT: planning sonrası Board'da 1 epic + sıralı + tek versiyon görünmeli.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10i) — No-op implementation tespiti: kod yazmayan dev-cycle artık başarı sayılmıyor → sonsuz gate churn bitti

Yalnızca kod oturumu (UAT değil). UAT #10i'in 🔴 KRİTİK bulgusu (fallover implementation dosya okuyup `exit 0` dönüyor ama kod YAZMIYOR → worktree boş → tüm gate'ler haklı fail → churn) TDD ile çözüldü. **1246 test yeşil** (1241→+5), typecheck + build temiz. **PUSH EDİLDİ** (`6e8e7c5..53d88b5`, tek commit) — `main == origin/main`.

- **No-op tespiti (asıl fix, #1):** `runItem` artık `exit 0` dönen dev-cycle'ı **worktree'de dosya değişmediyse** (base'e göre byte-aynı) başarı SAYMIYOR → recoverable fail (`outcome:'failed'`, item `in_progress` KALIR, worktree karantina, `backlog.implementation.noop` audit). Item bir sonraki driver pass'inde tekrar denenir; boş worktree gate'lere HİÇ ulaşmaz. ("Boş çıktı=recoverable" sinyal mantığının dosya-üretim karşılığı.)
- **`worktreeHasChanges(path, baseBranch)` (`worktree.ts`):** uncommitted (`git status --porcelain`) VEYA base'in önünde commit (`rev-list base..HEAD`) → değişti. Git cevaplayamazsa **fail-open** (true) — gerçek build asla yanlışlıkla atılmaz, yalnız KANITLANMIŞ boş worktree bloklanır. composition `worktreeChanged`'i bununla wire eder (handle varsa); mock lease (handle yok) → true (eski testler aynı).
- **#2 fallover executor kalitesi — config DOĞRU:** codex executor zaten `--sandbox workspace-write` + `cwd: ctx.worktreePath` kullanıyor (yazma izni + doğru cwd var). "Oku ama yazma" davranışsal (prompt/ajan kararı), config bug'ı değil → no-op guard hangi sebep olursa olsun yakalar (doğru katman).
- **#3 worktree base — tasarım gereği:** her worktree güncel `development`'tan branch'lenir (`WorktreeManager.acquire(-B branch path development)`). Aynı pass'te paralel item'lar birbirinin merge'ini görmez (izolasyon, doğru); sonraki pass güncel development'tan fork'lar. Defect yok.

**KANIT (deterministik uçtan-uca harness — gerçek composition + gerçek git worktree):** Pass 1 no-op executor (okur, exit 0, yazmaz) → item `in_progress` KALIR, **gate churn YOK** (`gate_runs` 0), `backlog.implementation.noop` audit. Pass 2 kod yazan executor → item `done`'a ilerler. Canlı hatayı birebir üretir + fix'i kanıtlar; gerçek-LLM gereksiz (fix saf orkestrasyon mekaniği). Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. Sonra rebuild + temiz UAT: agy kota-dolu olsa bile boş worktree gate'lere ulaşmamalı, item retry'lanmalı; kod yazılınca ilerlemeli.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10h) — Epic auto-create BASE full-mode ingest'e de uygulandı → backlog artık BOŞ kalmıyor

Yalnızca kod oturumu (UAT değil). UAT #10h'in 🔴 KRİTİK bulgusu (çıplak `parent_epic` + `type:epic` container yok → base full-mode ingest FK → backlog total 0) TDD ile çözüldü. **1241 test yeşil**, typecheck + build temiz. **PUSH EDİLDİ** (`ebfdb8b..cc3c72c`, tek commit) — `main == origin/main`.

- **Tek ortak helper `synthesizeMissingEpics(repos, parsed)`** (`backlog-ingest.ts`): `type:epic` container'ı OLMAYAN + DB'de bulunmayan her çıplak `parent_id` için placeholder epic'i (id=title) ÖNCE yaratır. **Hem base full-mode `ingestBacklogItems` HEM patch-mode `patchBacklogItems` aynı helper'ı çağırıyor** (tek kaynak; eski patch-içi Pre-pass 2 bununla değişti). Audit `backlog.epic_synthesized`.
- **FK-dayanıklı base insert:** full-mode insert loop'unda `parent_id` çözülemiyorsa item DÜŞMEZ — link null'lanır + `backlog.ingest.dangling_parent` uyarısı, item + enrichment (version/owner/model) yine yazılır. Backlog ASLA boş kalmaz (Eray şartı).
- **Sıra:** `deriveSyntheticEpics` (epic: label) → `enforceSymmetricDeps` → `synthesizeMissingEpics` (bare parent_epic id) → insert loop. FK hedefi hep var.
- **(ikincil) Workflow** `planning-pipeline.md` step-1 zaten epic'i `type:epic` item üretmeye zorluyordu (#10b); fix motorun "son çare fallback" vaadini base full-mode için de gerçek yaptı.

**KANIT (uçtan-uca harness — gerçek `ingestBacklogFile` full path, İKİ ajan varyasyonu):** (A) çıplak `parent_epic`, epic container YOK (kırık UAT şekli) → 3 created, **FK skip 0**, total 3 (1 epic + 2 task), her task linked + version/owner/model dolu. (B) epic'i `type:epic` item yazan → aynı sonuç, placeholder değil gerçek epic. **İki saf-executor çıktı varyasyonu da kapsanıyor.** Harness commit edilmedi.

**SIRADAKİ:** Eray "push" derse commit + push. Sonra rebuild + temiz UAT baştan: planning sonrası backlog DOLU olmalı (total>0), epic'ler + owner/version/model dolu, FK/dropped yok.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10f+#10g) — Token/maliyet: ÖLÇ (görünürlük) + KIS (akıllı retry) + executor-bazlı usage

Yalnızca kod oturumu (UAT değil). UAT #10 bulgusu — kotalar çok hızlı bitti (codex logları: **25M input / 0.3M output**; design_review 8× bounce, her retry tam bağlamı yeniden yolladı) — iki fazda çözüldü. Eray kararı (AskUserQuestion): **"önce ölç, sonra kıs"**. TDD ile. **1235 test yeşil** (1184→+51), typecheck + build temiz. **PUSH EDİLDİ** (`d149c92..35d070b`: feat `0156412` + docs `35d070b`) — `main == origin/main`.

- **Görünürlük (Faz 1):** üç CLI da artık usage verir — claude `--output-format json` (`parseClaudeUsage`; **gerçek CLI ile doğrulandı**, probe'da `cache_read 11908 tok` = prompt-cache zaten çalışıyor), codex `--json` (`parseCodexUsage`; **canlı probe ile doğrulandı**; codex `input_tokens` cached'i içerir → normalize edilir), gemini `--output-format json` (`parseGeminiUsage`; format resmi doc+kaynaktan, ⚠ canlı teyit binary kurulunca — toleranslı, adımı asla fail ettirmez). **Migration 012:** `run_steps.usage_metadata` + `gate_runs.usage_metadata` (nullable JSON). Yeni `GET /api/backlog/:id/usage` (kodlama + gate-başına kırılım + toplam); item drawer'da **"Token / maliyet"** bölümü ($ + token + cache tasarrufu).
- **Akıllı retry (Faz 2):** gate-fail bounce artık fail eden gate'lerin BULGULARINI `frontmatter.revision_directive`'e yazar (tek-atış); `runItem` okur → `reviseFeedback` → prompt'ta "⚠ REVISION REQUESTED" bloğu → ajan kör tekrar yerine bulguyu düzeltir. Yazılan-ama-okunmayan `revision_directive` (+prime escalation-revise yolu dahil) canlandı.
- **agy kota-uyarısı:** `FallbackExecutor.onFallover` + `falloverAuditSink` → recoverable fallover (agy 429 → claude) `executor.fallover` audit olayı olur; Activity feed'de "⚠ antigravity hit a quota/rate limit — fell over to claude" okunur (3 composition noktası bağlı).
- **Input kırpma (yapısal):** `filterInjectedRuleInputs` (4 executor) — system prompt'a zaten enjekte edilen `rules/*.md` Inputs listesinden düşer (ajan aynı içeriği İKİ kez okuyordu); kontrat 3. kural "Read each Input file" → "relevant to the Task".
- **Cache bayrağı bulgusu:** öyle bir bayrak YOK — cache otomatik ve zaten çalışıyor (codex oturum logu: **537K/619K cached**, %87). Asıl kaldıraç prefix-stable prompt sırasıydı (Faz 12.7'de yapılmıştı); yakalanan `cache_read_input_tokens` artık cache verimini drawer'da görünür kılar.

**KANIT:** gerçek claude + codex probe'ları usage+cost verdi (parser'lar gerçek çıktıyla test edildi); canlı API doğrulaması (seed item: toplam $0.71, gate kırılımı, 256K cache-read drawer rollup'ında); deterministik harness (gate fail → directive kaydı → re-code prompt'unda bulgular → tüketince temizlik); 2× bağımsız kod review — 3 hardening fix uygulandı (bilimsel-notasyon maliyet regex'i, bozuk-JSON toleranslı kolon parse'ı, enjeksiyon-parite input filtresi).

**SIRADAKİ:** rebuild + UAT — gerçek koşudan sonra item drawer'da token/maliyet dolmalı; bir gate fail'inde 2. denemenin bulgularla yönlendiğini gözle; agy 429 düşerse Activity'de ⚠ satırı görünmeli. Gemini kurulursa ilk koşuda format teyidi. **İçerik kalibrasyonu ayrı tur:** `behavior.md` 16 KB (~4K tok/adım, cache'li) + en büyük persona 13.8 KB — kırpma davranış riski taşır, Eray onayı ister.

**Rebuild (Eray çalıştırır):**
```bash
cd /Users/erayendes/Documents/_codebase/kortext
npm run build && npm pack && npm install -g ./kortext-3.1.0.tgz
kortext stop not && kortext purge not --yes
```

---

## ⭐ Önceki (2026-06-09 #10e) — Çıplak `kortext start` artık HER ZAMAN sihirbazı açar + mevcut projeleri listeler (GUI-first)

Yalnızca kod oturumu (UAT değil). Mevcut proje varken çıplak `kortext start` terminalde metin liste basıyordu (GUI-first değil). Artık her durumda **sihirbazı açar**; sihirbaz mevcut projeleri listeler. TDD ile yapıldı. **1184 test yeşil** (1178→+6), typecheck + build temiz. **PUSH EDİLDİ** (`e56a70a..5d92868`, tek commit) — `main == origin/main`.

- **bin dispatch (`bin/kortext.ts`):** bare `start` + proje var (`action==='list'`) → terminal listesi yerine `launchWizardAndOpen()`. Terminal listesi `--no-open`/headless (CI) **fallback**'i olarak kaldı.
- **Yeni route (`server/routes/projects.ts`):** `GET /api/projects` → kayıtlı projeler (slug/name/path/port/status/url, `serializeProjects` saf+testli); `POST /api/projects/:slug/start` → `startProject(slug)` → `{handoffUrl}` + `onHandoff` (wizard self-exit). 404 bilinmeyen slug, 502 start fail. index.ts'te bootstrap wiring ile mount.
- **Wizard UI (`OnboardingScreen`):** kartın başında "Open an existing project" — `/api/projects`'ten çeker, satıra tıkla → `POST .../start` → `window.location = handoffUrl`. Altında "or create a new project" ayracı + mevcut yeni-proje formu. `ExistingProject` tipi api-types'ta.

**KANIT:** route testleri (GET list / POST start / 404 / 502) + uçtan-uca harness (gerçek `projectsRouter` + örnek registry): 2 proje listelenir, "Acme"ye tıkla → daemon başlar (`startProject` çağrıldı) + `handoffUrl` döner + wizard kapanmayı planlar (onHandoff:1); bilinmeyen slug → 404.

---

## ⭐ Önceki (2026-06-09 #10d) — Gate-fail SONSUZ bounce döngüsü → 3. fail'de +prime'a (gerekçeyle) tırmandırma

Yalnızca kod oturumu (UAT değil). UAT-build'de çıkan 🔴 KRİTİK bulgu (design_review 8× fail → sonsuz churn, escalation yok) TDD ile çözüldü. **1178 test yeşil** (1162→+16), typecheck + build temiz. **PUSH EDİLDİ** (`13b131f..2338327`, tek commit) — `main == origin/main`.

- **Sayaç (yeni altyapı YOK):** `gateFailCount(repos, itemId, gate)` — `gate_runs`'taki `fail` satırlarını item+gate başına sayar, **son reset baseline'ından** sonrakileri (monotonik `gate_runs.id` üzerinden — ms çakışması yok). Eşik `MAX_GATE_FAILS = 3` (2 retry).
- **Escalation (`server/orchestrator/gate-escalation.ts`):** 3. fail'de `runTestCycle` artık **bounce ETMİYOR** → item `test`'te DURAKLAR + +prime'a Inbox sorusu (`pending_questions`, phase `gate-escalation`). Açık escalation varken `runTestCycle` gate'leri **yeniden koşmuyor** (`paused` — churn yok).
- **GEREKÇE zorunlu:** soru gövdesi gate'in **somut bulgularını** (verdict findings: "contrast 2.1:1, focus ring yok") + **karşılanmamış AC'leri** taşır. Kuru "fail" değil.
- **+prime cevabı (`consumeGateEscalation`, approvals route'ta dispatch):** `approve` → override-pass → `review`'e ilerle · `revise: <talimat>` → talimatı item'a yaz (`frontmatter.revision_directive` + comment) + **sayacı SIFIRLA** + `in_progress`'e yönlü bounce · `drop` → `cancelled` (epic'i tıkamaz).
- **UI (Inbox):** `gate-escalation` sorusu için 3 buton (Approve / Revise / Drop) + Revise talimat metin kutusu (`buildEscalationAnswer` saf yardımcı, testli).

**KANIT (deterministik uçtan-uca harness):** design_review 1.→bounce, 2.→bounce, **3.→escalated** (item `test`'te duraklar, Inbox'ta TEK soru, gerçek findings + unmet AC içerir, 3 seçenek). 4. pass `paused` (gate yeniden koşmaz). +prime'ın 3 cevabı: approve→`review`, revise→`in_progress`+sayaç 0+directive yazılı, drop→`cancelled`.

---

## ⭐ Önceki (2026-06-09 UAT-build) — Build fazı CANLI: 3 fix kanıtlandı + 1 yeni KRİTİK bulgu (bounce döngüsü)

Eray temiz UAT koştu (antigravity, executors chain `[antigravity, codex]`). Build fazı uçtan uca izlendi. **3 fix canlı kanıtlandı:**
- ✅ **#10 FK/epic enrichment:** epic auto-create çalıştı — epic 1, owner 11/11, version 11/11, model 10/10, parent_id 10/10, **FK/dropped YOK**.
- ✅ **#9c sıralı build:** T01 (blocker'sız) tek başına başladı; done olunca bağımlıları (T02/T03/T04/T09) açıldı — "hepsi aynı anda → merge conflict" stall'ı YOK. T01 gerçek git merge → done.
- ✅ **#4 gerçek gate + #2 bounce-retry:** T01 `quality_control` **fail → re-implement → pass (attempt 2) → merged → done**; AC kutucukları gate'çe işaretlendi; preview_url `localhost:5173` geldi.
- ✅ **#10 fallback:** agy kotası ortada **yine doldu (429, boş çıktı)** → motor recoverable algılayıp **codex'e fallback** etti (daemon log kanıtlı) → pipeline durmadı.

**🔴 YENİ KRİTİK BULGU:** T03/T04 `design_review`'i **8 kez fail** etti → sonsuz bounce churn (17 koşu, 15+ dk ilerleme yok). Gate-fail bounce'ında **max-retry/escalation yok**. **Eray kararı:** 3. fail'de item'ı duraklat → **+prime'a Inbox'tan tırmandır** (→ #10d ile çözüldü).

---

## ⭐ Önceki (2026-06-09 #10c) — `blocked` ayrı status/sütun OLMAKTAN TAMAMEN ÇIKARILDI → türetilen KİLİT bayrağı

Yalnızca kod oturumu (UAT değil). Eray'ın modeli kuruldu: `blocked` bir lane/status değil — bağımlılıktan **türetilen** bir kilit bayrağı, item'ın asıl status'ünün (genelde `to_do`) ÜSTÜNE biner. **AskUserQuestion kararı: `blocked` durumunu + manuel "Mark blocked" özelliğini TAMAMEN KALDIR.** TDD ile yapıldı, **1162 test yeşil** (1168→−6), typecheck + build temiz. **PUSH EDİLDİ** (`ecc5553..29f5519`, tek commit) — `main == origin/main`.

- **Türetilen kilit:** yeni `isBlocked(item, byId)` (`server/orchestrator/build-order.ts`) — `blocked_by` dolu + blocker terminal (done/cancelled) değilse kilitli; dangling = çözülmüş. UI aynası `isLocked`/`lockedBlockers` (`src/lib/board-drawer.ts`).
- **Auto-block SİLİNDİ:** `backlog-ingest.ts` A5 artık status'e dokunmuyor → kilitli item `to_do`'da KALIR. `backlog.auto_blocked` audit'i gitti.
- **`blocked` enum'dan + DB'den silindi:** Zod `BacklogStatusSchema` + `api-types.ts` + DB CHECK (**migration 011** tablo rebuild, mevcut `blocked`→`to_do` dönüşümü, `blocked_by` korunur).
- **Lifecycle:** `block`/`unblock` transition'ları + `cancel.from`'daki `blocked` kaldırıldı. Route `TRANSITION_ACTIONS`'tan da çıktı.
- **Manuel block özelliği komple silindi:** `server/orchestrator/block.ts` + `blocker-clear.ts` + `closure` çağrısı + testleri. Dependents türev olarak kendiliğinden açılır (yazma yok).
- **Board:** ayrı "Blocked" sütunu YOK → 5 sütun. Kilitli item kendi status sütununda **🔒 rozet + soluk (opacity 0.6)**; drawer'da "🔒 Locked · waiting on T01" banner.

**KANIT (deterministik uçtan-uca harness):** T01→T02→T03 `blocked_by` zinciri: ingest sonrası **3'ü de `to_do`**, T02/T03 **🔒 türev-kilitli**, `selectBuildableItems`=[T01]. T01 `done` → T02 **hâlâ `to_do`** ama kilit AÇILDI (yazma yok), buildable=[T02]. T02 `done` → T03 açıldı. Zincir sırayla aktı.

---

## ⭐ Önceki (2026-06-09 #10b) — UAT #10'un 3 BULGUSU DA ÇÖZÜLDÜ: çıplak parent_epic FK + Board blocked sütunu + çok-executor fallback

Yalnızca kod oturumu. **1168 test yeşil** (1124→+44), typecheck + build temiz. **PUSH EDİLDİ** (`03196ca..c44d514`, tek commit) — `main == origin/main`.

- **Kök neden:** Claude step-1'de hiç `type:epic` item üretmedi, sonra 14 task'a **çıplak `parent_epic: E01`** yazdı; E01 container hiç yok → FK fail → atomik → owner/version/model 0. #6 auto-create yalnız patch'te `type:epic` item olarak bildirilen epic'i kapsıyordu, çıplak referansı değil.
- **Fix 1 (motor — çıplak ref auto-create):** `patchBacklogItems` 2. ön-geçişi — parse edilen item'ların `parent_id`'lerinden karşılığı olmayan her id için **eksik `type:epic` container'ı önce yaratır** (`backlog.patch.epic_synthesized` audit). FK hedefi hep var.
- **Fix 2 (alan-bazlı dayanıklılık):** update-pass `parent_id`'yi güvenli çözer — çözülemezse linki atlar ama version/owner/model'i yazar (`backlog.patch.dangling_parent`); tek geçersiz FK tüm enrichment'i atomik düşürmez.
- **Fix 3 (workflow):** `planning-pipeline.md` step-1: "her `parent_epic: X` için `id: X, type: epic` satırı OLMALI" sertleştirmesi.
- **Board blocked sütunu:** `board-drawer.ts`'e ayrı `🔒 Blocked` sütunu; `columnKeyForStatus('blocked')` → `'blocked'` (in_progress DEĞİL). Kilitli işler "In Progress" gibi görünmüyor. *(Bu sütun #10c'de türetilen-kilit modeline dönüştürüldü.)*
- **Çok-executor fallback + 429:** `project.json.executors[]` öncelik zinciri + `FallbackExecutor` (recoverable/429/boş-çıktı → sıradakine düş); `cli-spawn` 429/quota/empty-exit-0 tanır; `buildMissingOutputResult` net mesaj verir. Onboarding'de primary+fallback seçimi.

**GERÇEK-LLM KANITI (Claude):** planning **succeeded**, 11 item (8 task + 3 epic), **owner/parent_id/version/model 8/8 dolu** — önceki 0/0/0 regresyonu gitti.

---

## ⭐ Önceki (2026-06-09 #10) — UAT (Claude): enrichment YİNE düştü (çıplak parent_epic → FK) + 3 ek bulgu

Eray temiz UAT koştu (Claude executor — agy **kota doldu**, 429). **Bu turda kod düzeltmesi YOK** (sadece TODO/HANDOVER); #10b oturumunda fixlendi.

- **🔴 KRİTİK:** Planning epic-link + version patch'leri **0 updated, 14 skipped → DROPPED**; `skipped_detail` = 14× `FOREIGN KEY constraint failed`. Kök neden: Claude step-1'de **hiç `type:epic` item üretmedi**, çıplak `parent_epic: E01` referansı yazdı. → epic/parent_id/version/model **0**.
- **🟠 Ek:** Çok-executor fallback (onboarding'de executor zinciri), Board `blocked` "IN PROGRESS"'te görünüyor, ≤8 kapsam tavanı executor-bağımsız tutmuyor.
- **Pozitif:** auto-block çalıştı (13 blocked/1 to_do); analiz Claude'la temiz; gate-marking uygulandı.

---

## ⭐ Önceki (2026-06-09 #9c) — UAT #9'un 8 BULGUSU DA ÇÖZÜLDÜ ✅ (gate verdict + deploy + build sıralama)

Yalnızca kod oturumu. UAT #9'un 8 build-fazı bulgusu TDD ile çözüldü; **gerçek antigravity BUILD koşusuyla canlı doğrulandı.** **1124 test yeşil**, typecheck + build temiz. **PUSH EDİLDİ** (`651f0d3..ee3da45`, tek commit) — `main == origin/main`.

- **#1 🔴 Build sıralaması (stall kökü):** yeni `server/orchestrator/build-order.ts` `selectBuildableItems` — en erken version → dependency-ready item'lar. **#2 🔴 bounced retry:** `in_progress` item'lar da aday. (+7 test)
- **#3 🟠 UI sebep:** `describeActivity` artık bounce sebebini gösteriyor.
- **#4 🔴 Gate-verdict (KATI):** `AgentGateExecutor` gate adımını AC + "verdict raporu yaz" ile zenginleştirir; ajan `verdict: pass|fail` + `ac_results` yazar; yeni `gate-verdict.ts` parse eder; rapor/verdict yok → strict fail; `test-cycle` AC kutucuklarını işaretler.
- **#5 🔴 design:** `designer.md` gerçek tasarım-review + kalite kriterleri (WCAG AA, hiyerarşi, …) → kötü UI FAIL.
- **#6 🟠 +prime gate:** `planning-pipeline.md` insan-döngü (uat gate + +prime item) talimatı.
- **#7 🟠 temp dosya:** `sweepSignalMarkers` bare-token sinyal dosyalarını `.kortext/temp/`'e taşır (4 executor).
- **#8 ⚠️ deploy zinciri:** preview URL `/api/backlog`'ta + drawer'da "Canlı önizleme" linki; staging→preprod→prod (gerçek git merge+tag) build stall gidince ulaşılır.

**⭐ GERÇEK-LLM BUILD KANITI (antigravity, epic + NOT-001→NOT-002 blocked_by zinciri + quality_control gate):**
- **Serial build:** NOT-001 done@pass-1, NOT-002 started@pass-2 → **SERIAL OK**. NOT-002 blocker bitene kadar **başlamadı**.
- **Strict gate:** NOT-001 quality_control `status: pass`, findings = **gerçek qa raporu**. AC'lerin **ikisi de `done: true`**.
- **Gerçek git merge:** `Merge kortext/run-1 into development` + gerçek kod commit'leri, **conflict YOK**.
- **TAM DEPLOY ZİNCİRİ:** epic done → staging → staging onayı → preprod deploy → preprod onayı → **prod release**. `git tag v0.1`; main log `Release v0.1: merge development into main`.

**SIRADAKİ:** Rebuild + Eray temiz build UAT (sıralı yürütme, gate'ler gerçekten yargılıyor mu + AC kutucukları, preview linki, kötü tasarım bounce, staging→...→release zinciri).

---

## Sabitler (her oturum)

- **Eray:** non-coder, Türkçe konuşur, kod+commit+yorum İngilizce, GUI-first, somut artefakt ister (screenshot/dosya yolu/çalışan önizleme).
- **Mimari/UX kararları:** `AskUserQuestion` ile **sade dille** (jargon değil, öneri başa). Büyük kararları Eray onaylar.
- **Push kuralı:** `origin/main`'e Eray **açıkça "push"/"merge" demeden** push YOK. Lokal commit serbest.
- **Önizleme tuzakları (kayıtlı):** `tsx watch` server dosyası düzenlenince restart olur → düşerse `preview_start`. `preview_eval` reload/animasyonda flaky → reload AYRI çağrıda, kısa senkron eval tercih et. `preview_screenshot` 1-2 kare geride olabilir → ölçü/durum için `getComputedStyle`/DOM teyidi (screenshot ikincil).

## Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) · Kararlar: [DECISIONS.md](./DECISIONS.md) · Tasarım: [DESIGN.md](./DESIGN.md) · Açık iş: [TODO.md](./TODO.md) · UAT: [UAT-GUIDE.md](./UAT-GUIDE.md) · Davranış+dosya haritası: [../CLAUDE.md](../CLAUDE.md)
