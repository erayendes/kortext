# Kortext — Handover

> Yeni Claude Code oturumu için bootstrap pusulası. Açar açmaz şu prompt'u yaz:
> **"HANDOVER.md'yi oku, devam edelim."**

---

## 1. Şu an (2026-05-31)

**Branch:** `main` (`feat/uat-review-cycle` 6-slice batch merge edildi, [PR #7](https://github.com/erayendes/kortext/pull/7)). Motor/şema epic §5.9 **TÜM FEATURE DİLİMLERİ TAMAM** — geriye **Madde 10 (capstone)** + **Madde 11 (bağımsız docs)** kaldı. **Capstone BAŞLADI (2026-05-31 #2):** sıralı plan çıkarıldı + Eray onayı "sırayla hepsini yap"; **W1 tam tasarlandı + kritik FK bulgusu** (`runs.item_id` → `backlog_items` FK'lı → per-item run için item DB'de var olmalı; B1'in keystone olduğunun kanıtı). Kod **commit EDİLMEDİ** — oturum boyunca tool sonuçları ağır gecikmeyle döndü, iteratif TDD pratik olmadı; çalışma ağacı temiz (W1 RED testleri revert edildi, 465/465 baseline korundu). W1 birebir spec aşağıdaki prompt'ta.

**Bu oturumda inen (6 slice, hepsi TDD + mock-first, ayrı commit):** `uat review-cycle` (review→done/bounce, prime onayı) · `whose-turn` (board "sıra kimde" türetimi) · `closure` (review→merge→done/bounce iskelet) · `epic-completion` (item done→epic bitti→staging tetik) · `block` (block→run cancel, `RunRegistry`) · `local test-URL` (`PreviewManager`). Detay [DECISIONS §5.13](./DECISIONS.md). **Beş mock-first arayüz** (`gate-executor`/`review-approver`/`merger`/`deployer`/`preview-server`) + `RunRegistry` + `PreviewManager` hazır; tümü Madde 10'da gerçeğe bağlanır. Üretim blast-radius **sıfır** (yalnız testler sürüyor — lifecycle henüz orchestrator'dan sürülmüyor).

| Test | Lint | Typecheck | Build |
|---|---|---|---|
| 465/465 ✅ | 0 hata · 4 pre-existing warning | 0 hata | temiz |

**npm registry:** `kortext@3.0.0` broken (EADDRINUSE silent fail bug). v3.1.0 release (devasa sürüm: Faz 11-13 + CLI redesign) lokal tgz UAT geçtikten sonra yapılacak.

## ▶ Sonraki oturum — kopyala-yapıştır prompt

> Yeni oturumda şunu yaz (motor epic capstone'una geç):

```
DECISIONS §5.9 + §5.13'ü oku, capstone'u (Madde 10) W1'den SÜRDÜR (Eray onayı: "sırayla hepsini yap").

Durum: §5.9'un TÜM feature dilimleri main'de (PR #7) — 1-9 + uat + whose-turn + local-preview.
Tek-item yaşam döngüsü (test→review→merge→done/bounce) + epic→staging + block→cancel +
local-URL mekanikleri ÇALIŞIYOR, hepsi mock-first. 465/465 test + typecheck + lint + build yeşil.

KALAN sadece iki madde:
- Madde 10 (CAPSTONE): beş mock-first arayüzü + RunRegistry'yi GERÇEĞE bağla + per-item
  run/worktree kur + tüm dikişler:
  · worker-pool → RunRegistry register/unregister (block gerçek çalışan ajanı durdursun)
  · closure done → epic-completion (item done → epic bitti mi → staging)
  · review-cycle/closure → preview startFor/stopFor (test-girişinde URL, teardown'da kapat)
  Gerçek impl'ler: AI-agent GateExecutor · git Merger (WorktreeManager→development) ·
  Deployer (staging deploy) · PreviewServer (worktree'den dev-server spawn). TODO §5.9'da
  "ertelenenler" başlıkları altında HEPSİ listeli — capstone'un iş listesi orası.
- Madde 11 (bağımsız docs): AGENTS.md/behavior.md karar→write_decision, öğrenim→write_learned.

SIRA (Eray onayı — plan tekrar SORMA, uygula): W1 → W2 → B1 → C1-C5 → D1. Her biri ayrı
TDD (RED→GREEN, gerçek sebeple kırılan test ÖNCE) + ayrı commit.

W1 (BURADAN BAŞLA — hazır spec, dakikalar içinde iner):
- run-registry.ts: cancelForItem'dan sonra ekle:
    unregister(runId: number): boolean { return this.entries.delete(runId); }  // abort ETMEZ
- worker-pool.ts: RunWorkflowOptions'a `registry?: RunRegistry`; `const aborter` (≈227) sonrası
  `options.registry?.register(run.id, options.itemId ?? null, aborter)`; gate-no-controller
  throw'undan (≈356) ÖNCE ve son return'den (≈453) ÖNCE `options.registry?.unregister(run.id)`.
- Testler: tests/run-registry.test.ts (unregister: abort'suz siler + unknown→false) + yeni
  tests/worker-pool-registry.test.ts.
  ⚠️ FK BULGUSU: `runs.item_id` → `backlog_items` FK'lı (runs.ts:113). Testte item'ı ÖNCE
  `repos.backlog.create(...)` ile seed et (closure.test.ts'deki şablonu kopyala). register
  kanıtı = yavaş step + mid-run `cancelForItem`→len 1 + run 'failed'; unregister kanıtı =
  normal biten run sonrası `cancelForItem`→[].

W2: closure `done` → `runEpicCompletion` dikişi (deployer dep'i thread'le).
B1 (keystone): §5.9 #10 per-item run + worktree — FK + worktree impedance burada kapanır.
  ⚠️ mimari karar → AskUserQuestion (item-cycle run'ı nasıl doğurur, worktree base=development).
C1-C5: 5 mock'u gerçeğe bağla (PreviewServer/Merger+handover-on-close/ReviewApprover/Deployer/
  GateExecutor) — hepsi B1'e dayanır. D1: Madde 11 docs.
ÖNCE PLAN demeye gerek yok — plan onaylı; doğrudan W1 RED testiyle başla.

Sabit kurallar (bu epic'te öğrenildi):
- MİMARİ PRENSİP (§5.13): koşullu mantık ORCHESTRATOR katmanında (DB durumu üzerinde düz TS
  fold), DAG (dag.ts/worker-pool.ts) saf AND-join kalır. Gate'ler gate_runs satırı, DAG
  fan-in DEĞİL — §5.12 deadlock böyle önlenir. "engine-owns-mechanics ancak engine DESTEKLİYORSA."
- MOCK-FIRST deseni (bu oturumun ana dersi): her dış bağımlılık bir arayüz + Mock(test);
  gerçek impl ayrı/sonra. Beş arayüz kuruldu (GateExecutor/ReviewApprover/Merger/Deployer/
  PreviewServer) + RunRegistry/PreviewManager. Capstone = bu mock'ları gerçeğe çevirmek.
- run/item IMPEDANCE (capstone'un göbeği): ApprovalQueue + WorktreeManager + runtime_artifacts
  hepsi run_id ile çalışıyor; item-cycle'lar itemId ile + henüz run/worktree YARATMIYOR.
  Madde 10 per-item run + worktree kurup bu köprüyü kapatır (RunRegistry deseni: itemId etiketli).
- TDD zorunlu: önce başarısız test (RED, doğru sebeple), sonra minimal kod (GREEN). Gerçek
  fonksiyonları çalıştır, paralel kopya yazma.
- "tamam" demeden önce npm test + npm run typecheck YEŞİL olmalı — iddia etme, ölç.
- Büyük mimari kararları AskUserQuestion ile sor. main'e SORMADAN push/merge YOK. Her dilim
  ayrı commit; push/merge'i Eray söyleyince.
- Eray non-coder, Türkçe iletişim, kod/commit İngilizce. Somut artefakt göster (dosya yolu, test sonucu).
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
| Motor/şema epic (§5.9) | 🚧 **TÜM feature dilimleri ✅** (1-9 + uat + 5 + 7) — tek-item lifecycle (test→review→merge→done/bounce) + epic→staging + block→cancel + local-preview, hepsi mock-first, 465/465 yeşil. **KALAN: Madde 10 (capstone — 5 mock-first arayüzü + `RunRegistry`'yi gerçeğe bağla + per-item run/worktree + tüm dikişler) · Madde 11 (bağımsız docs).** Detay §5.13. |

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
