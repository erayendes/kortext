# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-05-31)

**Branch:** `main`. Motor/şema epic §5.9 **MADDE 10 (CAPSTONE) + MADDE 11 TAMAM — 9 TDD dilimi indi (2026-05-31 #3):** `W1 → W2 → B1(keystone) → C2 → C5 → C3 → C1 → C4 → D1`, her biri ayrı RED→GREEN (gerçek sebeple kırılan test ÖNCE) + ayrı commit (**9 commit, `39953ad`→`c692223`**). **465→499 test (+34)**, typecheck + lint temiz, her commit'te yeşil. Teslim: 5 mock arayüzün **GERÇEK substrat adapter'ları** (git `GitMerger` · AI-ajan `AgentGateExecutor` · ApprovalQueue `QueueReviewApprover` · process-spawn `DevServerPreviewServer` · deployment-cycle `WorkflowDeployer`) + **keystone** `runItem`/`runReadyItems` (FK'yı GERÇEKTEN kapatır: item artık `item_id`'li gerçek run + kendi worktree'siyle doğar) + 2 dikiş (W1 block→cancel, W2 closure→epic) + Madde 11 kesişen karar/öğrenim kuralı. **Mimari karar (B1): Eray AskUserQuestion ile "yeni, küçük, temiz parça" (standalone fonksiyon) seçti.** Detay [DECISIONS §5.14](./DECISIONS.md). Üretim blast-radius hâlâ **sıfır** — adapter'lar izole/unit-test; **KALAN = uçtan-uca KOMPOZİSYON** (composition root + resolution registry'ler + preview dikişi + driver — §5.14 "ne kaldı"). ⚠️ Tüm commit'ler **LOKAL** — main'e push EDİLMEDİ, Eray onayı bekliyor.

**Bu oturumda inen (6 slice, hepsi TDD + mock-first, ayrı commit):** `uat review-cycle` (review→done/bounce, prime onayı) · `whose-turn` (board "sıra kimde" türetimi) · `closure` (review→merge→done/bounce iskelet) · `epic-completion` (item done→epic bitti→staging tetik) · `block` (block→run cancel, `RunRegistry`) · `local test-URL` (`PreviewManager`). Detay [DECISIONS §5.13](./DECISIONS.md). **Beş mock-first arayüz** (`gate-executor`/`review-approver`/`merger`/`deployer`/`preview-server`) + `RunRegistry` + `PreviewManager` hazır; tümü Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır** (yalnız testler sürüyor — lifecycle henüz orchestrator'dan sürülmüyor).

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 499/499 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## ▶ Sonraki oturum — kopyala-yapıştır prompt

> Yeni oturumda şunu yaz (capstone "son montaj" fazına geç):

```
DECISIONS §5.14'ü oku, capstone'un SON MONTAJINI yap (uçtan-uca kompozisyon).

Durum: Madde 10+11'in 9 TDD dilimi indi (W1→W2→B1→C2→C5→C3→C1→C4→D1; main'de LOKAL,
9 commit 39953ad→c692223, 499 test + typecheck + lint yeşil). 5 mock arayüzün GERÇEK
substrat adapter'ları (GitMerger/AgentGateExecutor/QueueReviewApprover/DevServerPreviewServer/
WorkflowDeployer) + keystone runItem/runReadyItems (FK kapatır) + W1/W2 dikişleri + Madde 11
docs HAZIR — ama hepsi izole/unit-test, orchestrator kompozisyonuna takılmadı. Blast-radius sıfır.

KALAN = son montaj (§5.14 "ne kaldı"):
1. RESOLUTION REGISTRY'LER + B1'i gerçek worktree'ye bağla: item→worktree handle (C2
   GitMerger.resolveHandle), item→run-context (C5), item→run-id (C3). runItem şu an
   acquireWorktree'yi ENJEKTE mock'la alıyor → gerçek WorktreeManager (base=development) +
   gerçek run ile bu kayıtları doldur. (run/item impedance'ın asıl gerçek kapanışı burada.)
2. COMPOSITION ROOT: gerçek adapter'ları kurup orchestrator fonksiyonlarının (runClosure/
   runTestCycle/runReviewCycle/runEpicCompletion) dep'lerinde mock'ların yerine koy.
3. PREVIEW DİKİŞİ: review-cycle/closure → PreviewManager.startFor (test-girişinde URL) /
   stopFor (teardown). C1 substratı hazır, dikiş kaldı (Madde 10 kalemi).
4. DRIVER + E2E: runReadyItems'i süren entry point (Orchestrator'a mı / ayrı loop mu →
   mimari karar, AskUserQuestion) + uçtan-uca test (item to_do → … → done/staging; gerçek
   git + mock agent).

SIRA: 1 (registry'ler + gerçek worktree) → 2 (composition root) → 3 (preview dikişi) →
4 (driver + e2e). Her biri ayrı TDD (RED→GREEN, gerçek sebeple kırılan test ÖNCE) + ayrı commit.

Sabit kurallar (epic boyunca öğrenildi):
- MİMARİ PRENSİP (§5.13): koşullu mantık ORCHESTRATOR katmanında (DB durumu üzerinde düz TS
  fold), DAG (dag.ts/worker-pool.ts) saf AND-join. Gate'ler gate_runs satırı, fan-in DEĞİL —
  §5.12 deadlock böyle önlenir.
- MOCK→GERÇEK deseni: her adapter enjekte bir alt-substrat alır (WorktreeManager/Executor/
  ApprovalQueue/child_process/workflow) — testte mock, prod'da gerçek. Composition root bu
  enjeksiyonu yapar; adapter'lar §5.14'te commit'li.
- TDD zorunlu: önce başarısız test (RED, doğru sebeple), sonra minimal kod (GREEN). Gerçek
  fonksiyonları çalıştır, paralel kopya yazma.
- "tamam" demeden önce npm test + npm run typecheck YEŞİL — iddia etme, ölç.
- Büyük mimari kararları AskUserQuestion ile sor (driver şekli = aday). main'e SORMADAN
  push/merge YOK; her dilim ayrı commit. Eray non-coder/Türkçe, kod+commit İngilizce, somut artefakt.
- ⚠️ Bilinçli ertelemeler (§5.14 kayıtlı): handover-on-close (C2 — içerik/konum spec'i lazım);
  write_decision/write_learned MCP tool'ları YOK (D1 dosya-tabanlı kullandı).
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
