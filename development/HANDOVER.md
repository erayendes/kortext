# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-05-31)

**Branch:** `main`. Motor/şema epic §5.9 **MADDE 10+11 CAPSTONE + SON MONTAJ TAMAM.** Önce 9 TDD dilimi (adapter'lar+keystone, `39953ad`→`c692223`, 465→499 test), sonra **4 kompozisyon dilimi — "son montaj" (2026-05-31 #4):** `1 ResolutionRegistry+runItem→gerçek-worktree → 2 composition-root → 3 preview-dikişi → 4 driver+e2e`, her biri ayrı RED→GREEN + ayrı commit (**4 commit, `8cbd5e1`→`86ddaeb`**). **499→521 test**, typecheck + lint temiz, her commit'te yeşil. **SONUÇ: sistem ilk kez bir işi `to_do → done`'a kadar insan-döngüsü olmadan, GERÇEK git ile yürütüyor** — uçtan-uca test (`driver-e2e.test.ts`) gerçek worktree + development'a gerçek merge commit + gate + epic→staging deploy zincirini kanıtlıyor. `driveReadyItems` = "başlat düğmesi" (tek-tur, 3 orchestrator-katmanı faz; **mimari karar: Eray sade-dille "ayrı, temiz, yeni parça" seçti** = B1 çizgisi). Detay [DECISIONS §5.15](./DECISIONS.md). Üretim blast-radius hâlâ **sıfır** — driver henüz hiçbir loop/HTTP girişinden sürülmüyor (`server/index.ts` montajı + zamanlayıcı bilinçle sonraya bırakıldı). ⚠️ **Bu oturumun 5 commit'i LOKAL** (`8cbd5e1`→`4d38bdf` = 4 montaj dilimi + bu docs) — `origin/main`'den 5 önde, push EDİLMEDİ, Eray onayı bekliyor. (Önceki 9 capstone commit'i `39953ad`→`c692223` zaten origin/main'de.)

> **Süreç dersi (kayıtlı):** son montaj 4. diliminde, worktree'ye yazan bir test executor'ının guard'ı (`worktreePath !== repoRoot`) deployment adımında host repo'ya düşüp 2 stray commit + 1 çöp dosya yarattı. `--mixed reset` (reflog ile sıfır kayıp) + guard'ı pozitif/dar yaptım (`workflowId==='development-cycle' && path.startsWith(...)`). Ders: worktree-mutasyonlu test executor'ı asla `process.cwd()`'e düşebilecek negatif guard kullanmamalı.

**Bu oturumda inen (6 slice, hepsi TDD + mock-first, ayrı commit):** `uat review-cycle` (review→done/bounce, prime onayı) · `whose-turn` (board "sıra kimde" türetimi) · `closure` (review→merge→done/bounce iskelet) · `epic-completion` (item done→epic bitti→staging tetik) · `block` (block→run cancel, `RunRegistry`) · `local test-URL` (`PreviewManager`). Detay [DECISIONS §5.13](./DECISIONS.md). **Beş mock-first arayüz** (`gate-executor`/`review-approver`/`merger`/`deployer`/`preview-server`) + `RunRegistry` + `PreviewManager` hazır; tümü Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır** (yalnız testler sürüyor — lifecycle henüz orchestrator'dan sürülmüyor).

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 521/521 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## 🟢 Son montaj BİTTİ — sade anlatım (Eray için)

**Benzetme:** Arabanın tüm parçalarını tek tek yapıp ayrı ayrı test etmiştim (motor, fren, direksiyon). Bu oturumda parçaları **arabaya monte edip anahtarı çevirdim** — araba ilk kez baştan sona, kendi kendine yürüdü. 4 adımın **dördü de bitti:**

1. ✅ **Her işe gerçek çalışma alanı verildi** — sistem artık her işi gerçek (git) bir çalışma alanında yürütüyor + "hangi iş nerede" defterini tutuyor.
2. ✅ **Gerçek parçalar taklitlerin yerine takıldı** — 5 gerçek parça (git birleştirme · AI denetçi · insan onayı · önizleme · deploy) tek yerde (`composition`) kuruldu.
3. ✅ **Önizleme otomatik açılıp kapanıyor** — iş test aşamasına gelince URL açılıyor, iş bitince/geri dönünce kapanıyor.
4. ✅ **Ana düğme eklendi + tam test** — "başlat" (`driveReadyItems`) bir işi yapılacak → test → onay → **bitti**'ye kadar yürütüyor; uçtan-uca test **gerçek git ile** kanıtlıyor (gerçek birleştirme commit'i dahil). **Mimari karar:** sana sade dille sordum, "ayrı, temiz, yeni parça"yı seçtin — öyle yapıldı.

> **Önemli:** Üretim etkisi hâlâ **sıfır** — "başlat" düğmesi henüz hiçbir otomatik yerden (uygulama açılışı / zamanlayıcı) çağrılmıyor; elle çağrılıyor. Onu uygulamaya bağlamak + (istersen) periyodik otomatik çalıştırmak **ayrı, sonraki bir iş** (sen "otomatik zamanlayıcı"yı henüz seçmedin).

**Şu an mümkün olan:** Bir iş listesi verildiğinde sistem o işi **ilk kez baştan sona, insan müdahalesi olmadan** yürütebiliyor (testte kanıtlandı). Sıradaki: bunu uygulamadan tetikleyip canlı dashboard'da göstermek.

---

## ▶ Sonraki oturum — kopyala-yapıştır prompt

> Yeni oturumda şunu yaz (driver'ı bir girişe bağla + ertelenenler):

```
DECISIONS §5.15'i oku. Capstone motoru + SON MONTAJ BİTTİ: sistem bir işi
to_do→done'a kadar GERÇEK git'le, insan-döngüsü olmadan yürütüyor (driveReadyItems
= "başlat düğmesi", driver-e2e.test.ts kanıtlıyor). 521 test + typecheck + lint yeşil.
Driver standalone fonksiyon (Eray "ayrı, temiz, yeni parça" seçti). Üretim blast-radius
hâlâ SIFIR — driver hiçbir girişten sürülmüyor.

ÖNCE: Bu oturumun 5 commit'i LOKAL (8cbd5e1→4d38bdf, origin/main'den 5 önde),
push EDİLMEDİ. Eray'a "bu 5 commit'i push edeyim mi?" diye SOR — onaysız push YOK.

SONRA KALAN (öncelik sırası, her biri ayrı TDD + ayrı commit):
1. DRIVER'I BİR GİRİŞE BAĞLA (blast-radius'u sıfırdan çıkaran ilk dilim → DİKKAT + Eray
   onayı): server/index.ts composition'ı (createComposition) kurup driveReadyItems'i
   çağırsın — önce HTTP tetiği (örn. POST /api/drive) veya manuel komut. Periyodik
   otomatik zamanlayıcı AYRI iş (Eray henüz seçmedi → sorma-bekle).
2. Ertelenenler (§5.14/§5.15, sıra Eray'a sorulabilir): handover-on-close (C2 — gerçek
   merge'le HandoverEngine.record), gate_runs'a uat verdict (attempt tuzağı çöz),
   board whose-turn rozeti (src/ UI), staging raporları/onayı (§5.11), epic-status-flip,
   blocker-temizle (bağımlılık modeli gerekir).

Sabit kurallar: koşullu mantık ORCHESTRATOR'da, DAG saf AND-join (§5.13). Mock→gerçek
deseni (composition root enjekte eder). TDD zorunlu (RED→GREEN, gerçek sebep). "tamam"
demeden npm test + typecheck YEŞİL. main'e SORMADAN push YOK. Eray non-coder/Türkçe,
kod+commit İngilizce, somut artefakt göster. ⚠️ TEST EXECUTOR'LARI worktree'ye yazarken
host repo'ya düşebilecek negatif guard KULLANMA (§5.15 dersi — 2 stray commit yaşandı).
```

## 2. Geçmiş özet

Faz 13 tamamlandı: engine output-resolver, callout → approver-based gate, `.kortext/foundation/` kategorisi, 13 reference ALL-CAPS rename, 12 workflow rewrite (AI-odaklı imperative ton), `docs/ → development/` konsolidasyon. Detaylar [DECISIONS.md Bölüm 1](./DECISIONS.md).

## 3. Aktif iş — Development + Test lifecycle redesign

Spec: [DECISIONS.md Bölüm 5](./DECISIONS.md) (design level, Eray onayladı). Süreç §5.10: **önce tüm workflow dizini, sonra motor** — markdown ucuz, motor kodu tasarım donunca yazılır. Bitmiş workflow dizini + Bölüm 5 = motorun donmuş spec'i.

**Karar özeti:** kolonlar `to_do → in_progress → test → review → done` (`merge` kolonu YOK). 5 planning-seçimli gate; `test`'tekiler PARALEL, join motorun. Sahip (assignee=developer) sabit, "sıra kimde" kolon+bayraktan türetilir. Deployment = ortam merdiveni (item→dev, epic→staging, version→preprod, onay→prod). spike otonom+her-zaman-gate. maintenance silindi. rollback + hotfix AYRI düz akışlar (§5.12 deadlock dersi).

**Workflow turu TAMAMLANDI + adversarial doğrulandı (2026-05-30)** — 10 workflow (rakamsız), 382/382 test + typecheck yeşil. 15-ajan adversarial doğrulama 2 gerçek kırık buldu, ikisi de düzeltildi: (1) zincir-dikiş — 4 workflow'un "Sonraki akış" satırı parser'a uymuyordu → dürüst `**Sonraki:**` biçimine çevrildi; (2) incident deadlock — birleşik incident-pipeline'da koşullu-dal motorca ifade edilemiyordu → `rollback-pipeline` + `hotfix-pipeline` olarak AYRILDI.

| Workflow | Durum |
|---|---|
| `development-cycle` | ✅ implement → `test`'e taşı, orada biter |
| `test-cycle` | ✅ 5 gate paralel + UAT fan-in; gate-run kaydı (rapor yazmaz); code-review SECURITY okumaz |
| `planning-pipeline` | ✅ gate seçimi (`code_review`+`uat`, `security_check→security_control`) |
| `deployment-cycle` | ✅ ortam merdiveni (epic→staging 5 paralel rapor, version→preprod, onay→main+prod); red→bug |
| `rollback-pipeline` | ✅ AYRI düz akış (triaj→kod+migration rollback→kapanış); fan-in yok |
| `hotfix-pipeline` | ✅ AYRI düz akış (triaj→minimal fix+test→kapanış); fan-in yok |
| `spike-pipeline` | ✅ otonom tetik + her-zaman prime gate + sade rapor |
| `environment-setup` | ✅ ACCESS "Ortamlar" bölümü (§5.6/§5.11) |
| `new/existing-project-analysis` | ✅ tutarlı (foundation üretici, dokunulmadı) |
| ~~`incident-pipeline`~~ | ✅ AYRILDI → rollback + hotfix (§5.12 — deadlock) |
| ~~`maintenance-cycle`~~ | ✅ SİLİNDİ (§5.12 — çıktısı planning/backlog'a eriyor) |
| Motor/şema epic (§5.9) | 🚧 **TÜM feature dilimleri + Madde 10/11 capstone ✅** (1-11) — tek-item lifecycle + epic→staging + block→cancel + local-preview + **9 capstone TDD dilimi** (5 mock arayüzün gerçek adapter'ları + keystone `runItem`/`runReadyItems` + W1/W2 dikiş + Madde 11 docs), 499/499 yeşil. **KALAN: yalnız uçtan-uca KOMPOZİSYON** (composition root + resolution registry'ler + preview dikişi + driver). Detay §5.14. |

**Disipline:** workflow markdown'ları ev-stilinde (normal cümle, `## Faz`+`1. **+persona:**`), parser'a dokunma; `inputs:` tam path (`.kortext/references/X.md`), prose'da çıplak rozet (`STACK`); foundation OKUMA (analiz hariç).

**Motor disiplini (§5.13, sabit):** koşullu mantık **orchestrator katmanında** (DB durumu üzerinde düz TS), DAG (`dag.ts`/`worker-pool.ts`) **saf AND-join** kalır — §5.12 deadlock'unun çözümü. Gate'ler `gate_runs` satırı (DAG fan-in DEĞİL); join = satırlar üzerinde TS fold. Doğrulama: gerçek `transition()`/`readyKeys()` çalıştır, paralel kopya yazma; `npm test`+`typecheck` yeşil olmadan "tamam" deme.

## 4. Bekleyen — content review turu

`development/` cleanup'ı bitince Kortext'in **çekirdek akış dosyalarının** içeriği gözden geçirilecek (Faz 13'te baştan yazıldı ama kalibrasyon lazım):

1. `templates/AGENTS.md` — kullanıcının ilk gördüğü AI bootstrap
2. `agents/*.md` — 14 persona
3. `rules/*.md` — 6 rule (behavior, branching, commands, emergency, mcp, models)
4. `workflows/*.md` — 10 workflow (rakamsız)
5. `templates/{foundation,references,reports,memory,backlogs}/*.md` — kullanıcı projesine kopyalanan iskelet
6. **`agents/` ve `workflows/` artık `_codebase` tarafında düzenlenir** (eski `_docbase` sync mekanizması kaldırıldı; tek kaynak burası).

Bilinen risk noktaları (Faz 13 hızlı yazımdan):
- `existing-project-analysis.md` — pattern apply (~30 sn yazıldı), kalibre gerek
- `02b-spike-workflow.md` — dinamik persona oversimplification
- `development-cycle.md` + `test-cycle.md` — lifecycle redesign aktif turu, bkz. §3 (DECISIONS Bölüm 5 spec). Motor/şema desteği §5.9'da listeli, en sona bırakıldı
- ~~`07-rollback-pipeline.md` / `09-maintenance-cycle.md`~~ — çözüldü (§5.12: rollback ayrı düz akış; maintenance silindi)

## 5. Bekleyen — v3.1 CLI/onboarding redesign (devasa sürüm parçası)

[DECISIONS.md Bölüm 0](./DECISIONS.md)'da yön belirlendi: multi-project daemon, postinstall otomatik onboard, native folder picker, 9 komutluk yeni CLI (`start/stop/pause/list/remove/purge/update/doctor/help`), `remove` ve `purge` ayrı komut. Implementation [TODO.md](./TODO.md)'deki sıralı 11 adımlı kuyrukta. v3.0 `init/serve` modeli implementation tamamlanana kadar mevcut kalacak; v3.1.0 release ile tek atışta clean break.

## 6. Açık konular

Detaylı liste [TODO.md](./TODO.md)'de. Kritik üçü:
- Manuel UAT (Eray makinesinde clean `kortext-uat/` üzerinde tgz + init + serve + analysis çalıştır)
- v3.0.1 borç: `app.listen()` EADDRINUSE silent-fail handler
- v3.1 CLI redesign implementation (DECISIONS Bölüm 0, TODO sıralı kuyruk)

## 7. Linkler

- Mimari: [ARCHITECTURE.md](./ARCHITECTURE.md) (gotcha'lar §16'da)
- Kararlar: [DECISIONS.md](./DECISIONS.md) (Bölüm 0 = CLI redesign, Bölüm 1 = Faz 13, Bölüm 2 = v3.1 refactor, Bölüm 5 = Development + Test Lifecycle redesign, Bölüm 6 = Faz 0-12 özeti, Bölüm 7 = tasarım, Bölüm 8 = tarihçe, Bölüm 9 = reddedilenler)
- Tasarım: [DESIGN.md](./DESIGN.md)
- UAT rehberi: [UAT-GUIDE.md](./UAT-GUIDE.md)
- Açık iş listesi: [TODO.md](./TODO.md)
- Claude için davranış: [../CLAUDE.md](../CLAUDE.md) (dosya haritası dahil)
