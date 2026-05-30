# Workflow Simülasyonu — NoteFlow (uçtan uca)

> **Amaç:** AGENTS.md boot'undan production'a kadar Kortext'in tüm yaşam
> döngüsünü adım adım canlandırmak. Örnek proje: **NoteFlow** — küçük bir not
> SaaS'ı (auth + not CRUD). İçinde bir **spike** (auth kararı), bir **test-cycle
> bounce** (security fail) ve bir **Bug** item var. Bu dosya tasarımın okunabilir
> bir testidir; DECISIONS Bölüm 5'in workflow'larına karşı koşturulmuştur.
>
> Gösterim: 🤖 motor (mekanik) · 👤 +prime (insan onayı) · 🎭 persona (AI ajan) ·
> 🟦 kolon geçişi · 📄 üretilen dosya · 🚪 gate.

---

## 0. Boot

```
👤 prime: onboarding wizard'da NoteFlow için BRD doldurur, "yeni proje" der.
🤖 motor: .kortext/ iskeletini kurar, BRD onayı → new-project-analysis başlatır.
🎭 +operation-manager: AGENTS.md okur → "boot persona benim, koordinatörüm".
   Backlog boş, aktif context yok → analiz fazını organize eder.
```

---

## 1. new-project-analysis — foundation + references üret

> Analiz fazı foundation'ı (BRD→PRD→TRD→PFD) ve reference'ları **yazar**.
> (Downstream'in aksine analiz foundation üreticisidir — §5.5 istisnası.)
> DAG: rounds=9, gates=7. `approver: +prime` olanlar 🚪.

| # | 🎭 Persona | Okur | 📄 Üretir | 🚪 |
|---|---|---|---|---|
| 1 | +compliance-expert | BRD | `LEGAL.md` (KVKK/GDPR — not = kişisel veri) | 🚪 |
| 2 | +growth-expert | BRD | `GROWTH.md` | 🚪 |
| 3 | +product-manager | BRD+LEGAL+GROWTH | `PRD.md` | 🚪 |
| 4 | +copywriter | PRD+LEGAL+GROWTH | `CONTENT.md` | 🚪 |
| 5 | +engineering-manager | BRD+PRD | `STACK.md`+`GLOSSARY.md`+`STRUCTURE.md` | 🚪 |
| 6 | +security-engineer | STACK | `SECURITY.md` | — |
| 7 | +designer | PRD+CONTENT+STACK | `DESIGN.md` | 🚪 |
| 8 | +db-admin | PRD+SECURITY+GLOSSARY+STRUCTURE+STACK | `DATABASE.md` | — |
| 9 | +engineering-manager | …+DATABASE | `API.md` | — |
| 10 | +engineering-manager | …+API+DESIGN | `TRD.md` | — |
| 11 | +qa-engineer | PRD+TRD | `TEST.md` | — |
| 12 | +operation-manager | PRD+TRD+TEST | `PFD.md` | 🚪 |

```
🤖 motor: DAG'a göre çalıştırır — STACK üretilmeden SECURITY/DESIGN/DATABASE başlamaz
   (data dependency). Bağımsız olanlar paralel: LEGAL ∥ GROWTH round 1'de.
🚪 her gate'te prime'a pending_question düşer ("PRD hazır, onayla").
   👤 prime onaylar; reddederse o reference revize edilir.
✅ Çıktı: NoteFlow'un STACK'i = React + Node/Express + Postgres. 13 reference + 4 foundation hazır.
→ Sonraki: planning-pipeline
```

---

## 2. planning-pipeline — backlog + gate seçimi + atama

> Burada **gate seçimi** yapılır (§5.3): her item'a hangi doğrulama gate'lerinin
> koşacağı (`review_gates`) işlenir. DAG: rounds=9 (zincir).

```
🎭 +engineering-manager: PRD+TRD okur → atomik item'lar üretir (add_backlog_item),
   bağımlılıkları (blocks/blocked_by) işler:
   T01  Auth API (backend)                 gates: code_review, security_control, uat   blocked_by: —
   T02  Login/Signup UI (frontend)         gates: design_review, quality_control       blocked_by: T01
   T03  Notes CRUD API (backend)           gates: code_review, security_control        blocked_by: T01
   T04  Notes UI + liste/editor (frontend) gates: design_review, quality_control, uat   blocked_by: T03
   Bağımlılık gerekçesi: T02 ve T03 auth API'ye muhtaç → ikisi de T01'e bağlı; T04 notes
   API'sine muhtaç → T03'e bağlı. T01 bitince T02 ∥ T03 AYNI ANDA serbest kalır (paralel pencere).
   Gate gerekçesi: T01/T04 kullanıcıya dönük kritik → uat; T01/T03 veri/auth → security_control; UI → design_review.

🎭 +qa-engineer: her item'a davranışsal acceptance criteria yazar (update_backlog_item).
   Örn T03: "kullanıcı sadece kendi notlarını görür/düzenler" (sonra security'de kritik olacak).

🎭 +security-engineer: auth/veri taşıyan item'lara security_control teyit (T01, T03 zaten işaretli).
🎭 +designer: UI item'lara design_review teyit (T02, T04).

🎭 +engineering-manager: item'ları Epic'lere bağlar (parent_epic), owner atar:
   E01-auth  → T01, T02   (owner: +engineering-manager)
   E02-notes → T03, T04   (owner: +engineering-manager)

🎭 +engineering-manager: Epic'leri versiyona dağıtır → hepsi v0.1 (MVP).

🎭 +engineering-manager: assignee atar (FARKLI developer'lar → paralellik mümkün):
   T01,T03 → +backend-developer · T02,T04 → +frontend-developer

🎭 +operation-manager: model atar (rules/models.md):
   backend auth (kompleks) → deep-research (Opus) · frontend UI → fast-reasoning (4o-class)

🎭 +operation-manager: 📄 planning-reports.md (versiyon planı, epic dağılımı, riskler) 🚪
   ⚠️ Açık risk olarak işaretler: "T01 auth yöntemi belirsiz — JWT mi session mı? Spike gerekebilir."
   👤 prime planning'i onaylar.
→ Sonraki: environment-setup
```

🟦 **Board:** `to_do`: T01, T02, T03, T04. T01 hazır (blocker yok); T02/T03 → T01 bekler; T04 → T03 bekler.

---

## 3. environment-setup — projeyi çalışır hale getir

```
🎭 +devops-engineer: STACK+SECURITY+DATABASE okur → 📄 ACCESS.md + ENVIRONMENT.md 🚪
   ACCESS.md'ye "Ortamlar" bölümü (§5.6): staging=test verisi, preprod/prod=canlı veri (KVKK).
   👤 prime onaylar (gerekli API key'leri verir: Postgres URL, mail servisi).
🎭 +devops-engineer: secrets scanning kur (pre-commit + CI). → secrets-scanning-configured
🎭 +frontend-developer: React iskeleti. → frontend-scaffolded
🎭 +devops-engineer: repo init + branch protection (main'e direkt push yok) + CI/CD. → repo-initialized
🎭 +db-admin: Postgres şema + migration. → db-deployed
🎭 +backend-developer: Express bağımlılıkları + config. → backend-ready
🎭 +frontend-developer: build setup + DESIGN token'ları. → frontend-ready
🎭 +qa-engineer: smoke test (build/run/DB/health/UI açılışı). 📄 test-reports.md
→ Sonraki: development-cycle (ilk hazır item)
```

🤖 **Motor:** `development` branch hazır. Worker pool hazır item'ları çekmeye başlar.

---

## 4. SPIKE — "Auth: JWT mi, session mı?" (T01'in blocker'ı)

> Planning'de işaretlenen belirsizlik. **Otonom** açılır (prime "spike çalıştır"
> demez). T01 `blocked_by: SP01` ile bekler. spike her zaman prime gate'inden geçer (§5.12).

```
🤖 motor: T01'i çekmeye çalışır → blocked_by: SP01 dolu → T01 atlanır.
   SP01 (spike) hazır → worker pool çeker.
🎭 +engineering-manager (SP01): hipotez = "stateless JWT, NoteFlow'un yatay ölçeklenmesi
   için session'dan uygun". STACK + STRUCTURE okur (foundation OKUMAZ).
   Araştırır: JWT refresh-token rotasyonu, Postgres session tablosu alternatifi,
   küçük PoC (iki yaklaşımın login latency'si). Karar verecek kadar bilgi toplanınca durur.
   📄 write_decision → ADR-001:
      "JWT + refresh rotasyonu seçildi. Neden: stateless = yatay ölçek kolay,
       NoteFlow MVP'de tek instance ama büyüme planı var. Elenen: server-side
       session (Postgres yükü + sticky-session derdi). Maliyet: refresh token
       saklama + rotasyon mantığı ~yarım gün ek iş. Risk: token sızması →
       SECURITY.md'ye 'kısa TTL + rotasyon' notu eklendi."
🚪 🤖 motor ADR'yi prime'a sunar (sade dille). 
   👤 prime okur: "JWT'yi anladım, neden session değil de bunu seçtiğini gördüm,
      maliyeti kabul. Onayla." → ADR accepted.
🤖 motor: SP01 done. T01'in blocked_by referansı temizlenir → T01 artık hazır.
```

```
★ Tasarım testi: spike'ın değeri burada somut — prime (non-coder) "JWT mi session mı"
  kararını VEREMEZDİ. AI araştırdı, sade gerekçeyle sundu, prime sadece onayladı.
  Onay GELMEDEN T01 (auth kodu) başlamadı = "sessiz pahalı commitment" engellendi.
```

---

## 5. development + test — T01 Auth API (temiz akış)

### 5a. development-cycle (T01)

```
🤖 motor: T01 hazır (blocker temiz), assignee = +backend-developer → worker pool çeker.
🎭 +backend-developer: T01'i 🟦 to_do → in_progress çeker.
🤖 motor: `development`'tan izole worktree açar (kortext/run-<id>).
🎭 +backend-developer: okur — STACK+STRUCTURE+GLOSSARY+SECURITY+TEST; backend → +API+DATABASE.
   foundation OKUMAZ, ADR-001'i izler (JWT). Auth endpoint'leri kodlar (signup/login/refresh),
   unit test ekler, yerelde çalıştırır, commit (`feat: add JWT auth endpoints`).
🎭 +backend-developer: T01'i 🟦 in_progress → test çeker.
🤖 motor: PR açar; T01 çalıştırılabilir → local test URL ayağa kaldırır (test verisi).
   development-cycle BİTER.
```

### 5b. test-cycle (T01) — 3 gate paralel + UAT

> T01 review_gates = code_review + security_control + uat. quality_control/design_review
> seçili DEĞİL → motor onları no-op geçer. DAG: test gate'leri paralel → join → uat.

```
🤖 motor: T01 test'e girdi → seçili gate'leri PARALEL fan-out:
   🎭 +engineering-manager [code_review]: STACK+STRUCTURE+GLOSSARY okur. Mimari + ADR-001
      uyumu, acceptance'ın kodda karşılığı. → gate-run: PASS (rapor yazmaz, kayıt bırakır).
   🎭 +security-engineer [security_control]: SECURITY okur. JWT TTL, refresh rotasyonu,
      secret yönetimi, token sızma yüzeyi. → gate-run: PASS.
   (quality_control, design_review → no-op)
🤖 motor: JOIN — tüm test gate'leri PASS → T01 🟦 test → review.
🚪 🤖 motor: uat seçili → prime'a onay sorar (local test URL + acceptance).
   👤 prime: URL'de signup/login dener, çalışıyor → "onayla".
🤖 motor (mekanik kapanış): CI+conflict kontrol → worktree'yi `development`'a merge →
   handover üret → worktree+URL kapat → T01 🟦 done.
🤖 motor: T01 done → **T02 ve T03'ün blocked_by referansı temizlenir** → ikisi de hazır oldu.
```

🟦 **Board:** `done`: SP01, T01 · `to_do` (hazır): **T02 + T03** · `to_do` (bekler): T04 (→T03). Sahip hep ilk atanan.

---

## 6. PARALEL ÇALIŞMA — T02 ∥ T03 aynı anda (farklı assignee, farklı worktree)

> T01 done olunca T02 (frontend) **ve** T03 (backend) aynı anda serbest kaldı. Farklı
> assignee'leri var → worker pool ikisini EŞ ZAMANLI çeker. İki ayrı worktree, iki ayrı
> run, iki ayrı local URL. Bu, sistemin çekirdek paralelliği (§5.9 #10). T03'te bir
> test-cycle BOUNCE yaşanıyor; T02 ona aldırmadan kendi akışında ilerliyor.

```
🤖 motor (worker pool): aynı tick'te iki hazır item, iki farklı assignee → PARALEL başlatır:
   ┌─ T02 (+frontend-developer, worktree-A, Opus-değil/4o) ─┐   ┌─ T03 (+backend-developer, worktree-B, Opus) ─┐
   │ 🟦 to_do → in_progress                                │   │ 🟦 to_do → in_progress                         │
   │ okur STACK+STRUCTURE+GLOSSARY+SECURITY+TEST +DESIGN+API│   │ okur …+API+DATABASE                            │
   │ Login/signup formu, DESIGN token, T01 auth API'ye bağ │   │ Notes CRUD endpoint'leri                        │
   │ commit → 🟦 test (motor PR + URL-A)                    │   │ commit `feat: notes CRUD` → 🟦 test (PR + URL-B)│
   └───────────────────────────────────────────────────────┘   └─────────────────────────────────────────────┘
   (ikisi gerçek anlamda eş zamanlı — biri diğerini beklemez)

── T02 yolu (temiz) ──────────────────────────────────────────
🤖 test-cycle (T02): design_review ∥ quality_control:
   🎭 +designer: URL-A'da responsive + a11y + token → PASS.
   🎭 +qa-engineer: URL-A'da signup→login davranışı, form validasyonu → PASS.
🤖 JOIN PASS → review. uat seçili değil → mekanik kapanış: merge → development ·
   handover · worktree-A kapat · T02 🟦 done.

── T03 yolu (BOUNCE — test-cycle gate fail) ──────────────────
🤖 test-cycle (T03): code_review ∥ security_control:
   🎭 +engineering-manager [code_review]: PASS.
   🎭 +security-engineer [security_control]: SECURITY okur. ⚠️ BULGU:
      "GET /notes/:id sahiplik kontrolü yok — kullanıcı A, B'nin notunu ID'siyle çekebilir
       (IDOR). Acceptance'taki 'sadece kendi notları' İHLAL." → gate-run: FAIL + bulgu.
🤖 JOIN: ≥1 FAIL (security) → T03 🟦 test → in_progress, +backend-developer'a geri (worktree-B korunur).
   code_review PASS'ti ama tek fail tüm item'ı döndürür (developer tüm bulguları tek turda görür).
🎭 +backend-developer: bulguyu okur → her endpoint'e `where user_id = current_user` filtresi,
   unit test (başkasının notu → 403), commit `fix: enforce note ownership (IDOR)`. 🟦 → test (tekrar).
🤖 test-cycle (T03) TEKRAR: security_control → IDOR kapandı, 403 → PASS · code_review PASS.
🤖 JOIN PASS → review. uat seçili değil → mekanik kapanış: merge → development ·
   handover · worktree-B kapat · T03 🟦 done.
```

🟦 **Board:** `done`: SP01, T01, T02, T03. T04 (→T03) artık serbest. **E01-auth tamam (T01+T02).**

```
★ Tasarım testi (paralellik): worker pool eşzamanlılığı burada görünür — T02 ve T03
  ayrı worktree'lerde aynı anda koştu, T03 bounce edip iki tur dönerken T02 hiç beklemeden
  done oldu. İzolasyon worktree-per-run'dan (#17) geliyor: paralel item'lar birbirinin
  çalışma alanını görmez, sadece `development`'a sırayla merge olurlar (motor merge'ü
  serialize eder, conflict olursa devops-substratı yakalar). Farklı model ataması da
  paralel: T02 hızlı 4o-class, T03 Opus — aynı anda farklı LLM'ler.
```

---

## 7. EPIC CLOSE (E01) → staging deploy

> §5.11: epic done → motor `development`'ı staging'e deploy eder + epic'te gate
> koşmuş personalar tek-dosya rapor yazar (paralel) + prime staging onayı.

```
🤖 motor: E01'in son item'ı (T02) done → epic-completion tespit → deployment-cycle
   Staging fazını tetikler. `development`'ı STAGING'e deploy eder (test verisi).
   Staging URL üretir.
🤖 motor: E01 kapsamında koşan gate'lere göre rapor personalarını paralel çağırır:
   🎭 +qa-engineer:        📄 test-reports.md      (E01 davranışsal özet — staging'de)
   🎭 +security-engineer:  📄 security-reports.md  (auth güvenlik özeti)
   🎭 +engineering-manager:📄 status-reports.md    (E01 kapsam, tamamlanan item, risk)
   🎭 +devops-engineer:    📄 delivery-reports.md  (staging deploy durumu, migration)
   (+designer design_review koştu → o da raporlar)
   → hepsi "staging-reviewed" üretir (tek-dosya, üste eklenir).
🚪 🤖 motor: JOIN — raporlar hazır → prime'a STAGING onayı sorar (staging URL + raporlar).
   👤 prime: staging'de NoteFlow'u dener — login çalışıyor AMA... 
```

---

## 8. BUG — prime staging'de sorun buluyor (B01)

> §5.11: staging reddi → motor gerekçeyle **bug açar**, epic owner'a atar; bug
> çözülmeden epic kapanmaz (version'a geçmez).

```
   👤 prime: "Login oluyor ama 'şifremi unuttum' linki hiçbir şey yapmıyor.
      Bu MVP için şart. Reddediyorum." → staging REJECT.
🤖 motor: prime'ın gerekçesiyle BUG açar:
   B01  "Forgot-password akışı eksik"  type: bug  parent_epic: E01
        review_gates: code_review, security_control, uat   assignee: +backend-developer
   E01 owner'a (+engineering-manager) triaj bildirimi. E01 KAPANMADI — version'a geçemez.
   🟦 B01 to_do.
```

### B01 yaşam döngüsü (development → test → done)

```
🎭 +backend-developer: B01 🟦 to_do → in_progress. worktree. okur STACK+SECURITY+API+
   DATABASE. Forgot-password endpoint + mail token akışı (SECURITY'deki kısa-TTL kuralına uyar).
   unit test. commit (`fix: add forgot-password flow`). 🟦 in_progress → test. (PR + URL)
🤖 test-cycle (B01): code_review ∥ security_control paralel:
   🎭 +engineering-manager [code_review]: PASS.
   🎭 +security-engineer [security_control]: token tek-kullanımlık mı, TTL var mı → PASS.
🤖 JOIN PASS → review. 🚪 uat → 👤 prime: URL'de "şifremi unuttum" dener → mail gelir,
   sıfırlama çalışır → "onayla".
🤖 mekanik kapanış: merge → development · handover · worktree kapat · B01 🟦 done.
```

🟦 **Board:** `done`: SP01, T01, T02, B01. E01'in açık item'ı kalmadı (T01, T02, B01 hepsi done).

```
🤖 motor: E01 yeniden epic-complete → STAGING re-deploy → raporlar güncellenir →
🚪 👤 prime: staging'i tekrar dener — bu sefer forgot-password da çalışıyor → "onayla".
   → E01 staging-approved. ✅ E01 KAPANDI.
```

```
★ Tasarım testi: "arada bir bug" iki farklı yerden gelebiliyor ve ikisi de tutarlı:
  (a) test-cycle gate fail = bounce (item in_progress'e döner — §6 T03 IDOR).
  (b) prime staging'de UAT-sonrası kaçak bulur = yeni Bug item (B01).
  İkisi de aynı development→test→done döngüsünü kullanıyor. Ayrı "bug workflow"
  gerekmiyor — bug sadece bir item type'ı. DRY doğrulandı.
```

---

## 9. development + test — T04 Notes UI + E02 close

```
🎭 +frontend-developer: T04 🟦 to_do → in_progress. worktree. Notes liste + editor UI,
   T03'ün notes API'sine bağlanır. commit. 🟦 → test. (PR + URL)
🤖 test-cycle (T04): design_review ∥ quality_control paralel → ikisi PASS → review.
🚪 uat seçili (T04'te kritik UX) → 👤 prime: URL'de not oluştur/düzenle/sil dener → "onayla".
🤖 mekanik kapanış: merge · handover · worktree kapat · T04 🟦 done.
🤖 E02'nin son item'ı (T04) done → EPIC CLOSE (E02) → STAGING deploy + raporlar:
   🎭 qa/designer/EM/devops → staging raporları (E02 kapsamı, paralel).
🚪 👤 prime: staging'de notes akışını dener → temiz → "onayla". ✅ E02 staging-approved.
```

🟦 **Board:** `done`: SP01, T01, T02, T03, B01, T04. **v0.1'in tüm epic'leri (E01, E02) staging-approved!**

---

## 10. VERSION CLOSE (v0.1) → preprod → prod

> §5.11: version done (tüm epic'ler staging onaylı) → preprod (canlı veri) →
> prime onayı → main merge + prod.

```
🤖 motor: v0.1'in son epic'i (E02) staging-approved → VERSION complete tespit →
   deployment-cycle Preprod fazı. `development`'ı PREPROD'a deploy eder (CANLI VERİ — KVKK).
   Preprod URL üretir.
🎭 +devops-engineer: 📄 delivery-reports.md — preprod deploy doğrulama: migration
   ileri/geri yolu, smoke, canlı-veri uyumu (KVKK/GDPR), rollback planı, prod hazırlığı.
   → preprod-reviewed
🚪 🤖 motor: prime'a PREPROD onayı sorar (preprod URL + rapor).
   👤 prime: preprod'da (gerçek veriyle) NoteFlow'u dener → "her şey çalışıyor, prod'a çık". → ONAY
🤖 motor (preprod-approved): `development`'ı `main`'e MERGE eder → PROD deploy başlar.
🎭 +devops-engineer: prod artifact build, son kararlı artifact rollback referansı,
   migration prod'da uygula, traffic geçişi (Blue/Green). 📄 delivery-reports.md → prod-deployed
🎭 +qa-engineer: prod smoke (login, not CRUD, etkilenen endpoint'ler, 5xx oranı). → prod-verified
🎭 +devops-engineer: izleme EŞİKLERİ + alarm tanımlar (5xx +%5, p95 2x) — "15 dk uyumaz",
   🤖 motor deploy-sonrası gecikmeli kontrolü planlar. Eşik temiz → semantik tag `v0.1.0`
   oluştur + push. 📄 release-notes.md (yeni: auth, notes, forgot-password).
✅ NoteFlow v0.1.0 PRODUCTION'DA.
```

🟦 **Final board:** v0.1 = done · `main` = v0.1.0 tag'li · prod canlı.

```
★ Tasarım testi: ortam merdiveni temiz çalıştı — item→development, epic→staging(test verisi),
  version→preprod(canlı veri)→main+prod. main'e SADECE en sonda, preprod onayından sonra
  dokunuldu. "15 dk izle" insan-davranışı yok; ajan eşik tanımladı, motor zamanladı (§5.11).
```

---

## Kapsam matrisi (kullanıcının istediği her şey)

| İstenen | Nerede |
|---|---|
| AGENTS.md'den başla, persona görevlendir | §0 boot + her workflow'da persona devri |
| Arada bir bug | §6 (T03 test-cycle security bounce) **ve** §8 (prime staging'de bulur → B01) |
| Bir spike | §4 (auth JWT/session kararı → ADR → prime gate) |
| **Paralel çalışma (iki assignee aynı anda)** | §6 (T02 frontend ∥ T03 backend — ayrı worktree, ayrı LLM, eş zamanlı) |
| Task tamamla | T01 (§5), T02+T03 (§6), T04 (§9) |
| Bug tamamla | B01 (§8) |
| Epic tamamla | E01 (§7-8), E02 (§9) → her biri staging |
| Version (epic→version gibi) | v0.1 (§10) → preprod → prod |

## Tasarım tutarlılık bulguları

Simülasyon boyunca **tasarım tuttu** — kopuk akış çıkmadı. Dört doğrulanan nokta:
1. **Bug = item type, ayrı workflow değil** — hem bounce (§6 T03) hem yeni-bug (§8 B01) aynı
   development→test→done döngüsüne oturdu.
2. **Sahip sabit** — security fail'de bile item developer'a döndü, security-engineer'a değil.
3. **spike non-coder için kritik** — prime veremeyeceği teknik kararı AI verdi, prime onayladı.
4. **Paralellik gerçek** — T02 ∥ T03 ayrı worktree'lerde eş zamanlı koştu; T03 iki tur bounce
   ederken T02 beklemeden done oldu. İzolasyon worktree-per-run'dan; merge'ü motor serialize eder.

İki **motor gereksinimi** netleşti (zaten §5.9'da kayıtlı, simülasyon teyit etti):
- **epic/version-completion tespiti** (§5.9 #8) — "son item done → epic close → staging" zinciri.
- **gate-run + bounce** (§5.9 #3,#4) — paralel gate fail'inde item'ı tek turda bulgularla döndürme.
