# Kortext Integration Map — Glue Layer Single Source of Truth

Bu dosya, Kortext framework'ünün **bağlama katmanının (glue layer) tek-kaynak referansıdır**. Persona ↔ komut ↔ workflow ↔ script ↔ hook ilişkilerini tek tabloda gösterir, karar zinciri kurallarını netleştirir ve atomic operation disiplinini tanımlar.

**Faz 2 kapsamında üretilmiştir.** Glue layer'da olup şu an implicit olan tüm ilişkiler burada açığa çıkarılır.

---

## 1. Persona × Komut × Workflow × Script × Hook Matrisi

14 persona için ana sorumluluk tablosu. Her satır bir persona'nın hangi komutu tetikleyebileceğini, hangi workflow'u açacağını, hangi script'leri çağıracağını ve hangi hook'larla etkileşeceğini gösterir.

| Persona | Tetiklediği Komut(lar) | Açtığı Workflow | Çağırdığı Script(ler) | İlgili Hook(lar) |
|---|---|---|---|---|
| `+operation-manager` | `!start analysis`, `!start onboard`, `!status`, `!maintenance`, `!check` | 00, 01a, 01b, 09 | `kortext-session-start.py`, `kortext-consistency-check.py`, `kortext-backlog-health.py`, `kortext-context-check.py` | `audit-logger.sh` |
| `+product-manager` | (operation-manager altında) | 01a, 01b, 02 | `kortext-backlog-add.py`, `kortext-bulk-plan.py` | `backlog-sync-guard.sh` |
| `+engineering-manager` | `!start spike`, `!start development`, `!add task`, `!add debt` | 02, 02b, 04 | `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-backlog-add.py` | `lint-guard.sh`, `size-guard.sh`, `handover-guard.sh` |
| `+backend-developer` | (engineering-manager altında) | 04 | `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-handover.py` | `write-guard.sh`, `auto-locker.sh`, `secret-scanner.sh` |
| `+frontend-developer` | (engineering-manager altında) | 04 | `kortext-item-start.py`, `kortext-item-transition.py`, `kortext-handover.py` | `write-guard.sh`, `auto-locker.sh` |
| `+db-admin` | (engineering-manager altında) | 03, 04, 07 | `kortext-item-transition.py` | `write-guard.sh` |
| `+designer` | (product-manager altında) | 01a, 04 | `kortext-item-transition.py` | — |
| `+copywriter` | (product-manager altında) | 01a, 04 | `kortext-item-transition.py` | — |
| `+growth-expert` | (product-manager altında) | 01a | `kortext-item-transition.py` | — |
| `+compliance-expert` | (product-manager altında) | 01a | `kortext-item-transition.py` | — |
| `+delivery-manager` | `!deploy prod`, `!trigger-rollback`, `!start-hotfix` | 06, 07, 08 | `kortext-item-transition.py` | `branch-guard.sh` |
| `+devops-engineer` | (delivery-manager altında) | 03, 06, 07 | — | `branch-guard.sh`, `commit-msg-guard.sh` |
| `+qa-engineer` | (delivery-manager altında), `!add bug` | 05 | `kortext-item-transition.py`, `kortext-backlog-add.py` | — |
| `+security-engineer` | (delivery-manager altında) | 01a, 01b, 06, 08 | — | `secret-scanner.sh` |
| `+prime` | `!setup kortext`, `!continue`, `!approve`, `!reject` | 00 | — | — |

**Notlar:**
- "(parent altında)" notasyonu, ilgili persona'nın bağımsız komut tetiklemediğini, ancak parent persona'nın yönlendirdiği workflow'larda aktif olduğunu gösterir.
- Aynı script birden fazla persona tarafından kullanılabilir (örn: `kortext-item-transition.py` lifecycle boyunca farklı ajanlarca çağrılır).
- Hook'lar event-driven çalışır; persona'nın kendisi hook çağırmaz — runtime tetikler.

---

## 2. Komut Akış Şeması

Her komutun hangi workflow'u açtığını ve hangi script'leri çağırdığını gösteren akış diyagramı.

```text
!setup kortext
  └─→ workflows/00-kortext-setup.md
        └─→ +operation-manager
              ├─→ scripts/lock_kortext.sh        (framework çekirdek kilidi)
              └─→ hooks/kortext-init.sh           (git hooks kurulumu + SESSION_BRIEF)

!start analysis
  └─→ workflows/01a-analysis-pipeline.md
        └─→ +operation-manager + +product-manager
              └─→ scripts/kortext-session-start.py

!start onboard
  └─→ workflows/01b-onboarding-pipeline.md
        └─→ +operation-manager
              └─→ scripts/kortext-session-start.py

!start planning
  └─→ workflows/02-planning-pipeline.md
        └─→ +operation-manager + +engineering-manager
              └─→ scripts/kortext-bulk-plan.py
                    └─→ scripts/kortext-backlog-add.py  (her item için)

!start spike
  └─→ workflows/02b-spike-workflow.md
        └─→ +engineering-manager
              └─→ scripts/kortext-backlog-add.py --type spike

!setup environment
  └─→ workflows/03-environment-setup.md
        └─→ +devops-engineer
              └─→ (manuel ortam kurulumu, script yok)

!start development
  └─→ workflows/04-development-cycle.md
        └─→ +engineering-manager → assignee
              ├─→ scripts/kortext-item-start.py
              ├─→ scripts/kortext-item-transition.py     (Test, Review, Done)
              ├─→ scripts/kortext-item-check.py          (kapanış kontrol)
              ├─→ scripts/kortext-handover.py            (devir)
              └─→ scripts/kortext-backlog-sync.py        (dashboard drift)

!start test
  └─→ workflows/05-test-cycle.md
        └─→ +qa-engineer
              └─→ scripts/kortext-item-transition.py

!deploy prod
  └─→ workflows/06-deployment-cycle.md
        └─→ +delivery-manager + +devops-engineer
              └─→ (manuel git tag + CI tetikleme)

!trigger-rollback
  └─→ workflows/07-rollback-pipeline.md
        └─→ +delivery-manager
              └─→ (manuel git revert)

!start-hotfix
  └─→ workflows/08-hotfix-pipeline.md
        └─→ +delivery-manager
              └─→ scripts/kortext-backlog-add.py --type hotfix

!maintenance
  └─→ workflows/09-maintenance-cycle.md
        └─→ +operation-manager
              └─→ scripts/kortext-backlog-health.py

!status
  └─→ (workflow yok, direkt rapor)
        └─→ +operation-manager
              ├─→ scripts/kortext-session-start.py
              └─→ scripts/kortext-context-check.py

!continue
  └─→ (workflow yok, checkpoint onayı)
        └─→ +prime
              └─→ (ajan ilerlemeye devam eder)

!approve
  └─→ (workflow yok, gate onayı)
        └─→ +prime
              └─→ scripts/kortext-item-transition.py  (Review → Done)

!handover
  └─→ (workflow yok, ara devir)
        └─→ (herhangi ajan)
              └─→ scripts/kortext-handover.py

!add task | !add bug | !add debt
  └─→ (workflow yok, doğrudan backlog girişi)
        └─→ scripts/kortext-backlog-add.py --type <task|bug|debt>

!check
  └─→ (workflow yok, tutarlılık kontrolü)
        └─→ +operation-manager
              └─→ scripts/kortext-consistency-check.py
```

---

## 3. Karar Zinciri (Escalation Chain)

Kortext'te kararlar dört seviyeli zincir üzerinden ilerler. Her seviyenin yetkisi ve tetikleyicisi nettir.

### Seviye 1: Persona Kendi Başına Karar Verir
- **Yetki:** Persona'nın `skills/<persona>/` dizini + `rules/` kuralları kapsamında her karar.
- **Örnek:** `+backend-developer` bir bug fix için variable adlandırma kararı.
- **Çıktı:** `workspace/memory/context/<persona>-active.md` dosyasına işlenir.

### Seviye 2: Lead Persona'ya Danış (Consult)
- **Yetki:** Persona kendi rolünün dışında bir teknik karar gerektirdiğinde lead persona'sıyla konsültasyon yapar (RACI'deki C).
- **Örnek:** `+backend-developer` API contract değişikliği için `+engineering-manager`'a danışır.
- **Çıktı:** `workspace/memory/decisions.md`'ye karar kaydı (Tactical).

### Seviye 3: `+operation-manager`'a Escalate
- **Yetki:** İki persona arasında çatışma, workflow ihlali, sistem durumu sorunu.
- **Örnek:** İki ajan aynı dosyayı kilitlemeye çalışıyor; lock timeout aşıldı.
- **Çıktı:** `workspace/memory/learned.md`'ye not, gerekirse `+prime`'a paralel bildirim.

### Seviye 4: `+prime`'a Escalate
- **Yetki:** Stratejik karar (Architecture, Stack, Legal, Budget) veya çözülemeyen blocker.
- **Örnek:** Tech stack değişikliği önerisi, P0 incident, breaking change kararı.
- **Çıktı:** `!approve` / `!reject` komutu beklenir.

### Escalation Tetikleyicileri

| Tetikleyici | Hedef Seviye | Süre / Eşik |
|---|---|---|
| 3 farklı yöntem başarısız (Loop Protection) | Seviye 2 (lead persona) | Anında |
| 24 saat içinde çözüm yoksa | Seviye 3 (`+operation-manager`) | 24 saat |
| Bütçe / zaman / scope etkisi | Seviye 4 (`+prime`) | Anında |
| P0 incident (production down, data loss, security breach) | Seviye 4 + Seviye 3 paralel (`+prime` + `+delivery-manager`) | Anında |
| Stale In Progress item (48 saat üzeri) | Seviye 3 (`+operation-manager`) | 48 saat |
| Lock timeout (5 dakika aşıldı) | Seviye 3 (`+operation-manager`) | 5 dakika |

---

## 4. Hook Chain Sırası

Hook'ların hangi sırada çalıştığı kritik; bir hook fail ederse sonrakiler çalışmaz veya operasyon iptal olur.

### `git pre-commit` Hook Chain (Sırasıyla)
1. `secret-scanner.sh` — Staged dosyalarda secret pattern arar.
2. `lint-guard.sh` — Lint çalıştırır (proje diline göre).
3. `size-guard.sh` — Dosya boyut limitini kontrol eder (`KORTEXT_SIZE_LIMIT`).
4. `backlog-sync-guard.sh` — Backlog dashboard drift kontrolü.
5. `handover-guard.sh` — Handover formatı doğrulaması.
6. `snapshot-guard.sh` — Kritik dosyaların (handover, decisions, learned, context) yedeğini alır.

**Davranış:** Biri fail ederse commit iptal olur. STATUS değişkeni 1 olduğunda exit 1 ile sonlanır.

### `PreToolUse:Write|Edit` Hook Chain (Claude Code)
1. `write-guard.sh` — Path-based yazma izni kontrolü (workspace dışına yazma engellenir).
2. `secret-scanner.sh` — Yazılacak içerikte secret pattern var mı?
3. `auto-locker.sh` — Hedef path paylaşımlı alan ise lock alır.
4. `snapshot-guard.sh` — Critical path yazılıyorsa yedek alır.

### `PostToolUse:Write|Edit` Hook Chain (Claude Code)
1. `auto-unlocker.sh` — Daha önce alınan lock'u serbest bırakır.
2. `audit-logger.sh` — Yazma işlemini `workspace/reports/audit.log`'a kaydeder.

### `git pre-push` Hook
1. `branch-guard.sh` — Branch isimlendirme kuralı kontrolü (`feature/`, `hotfix/`, vb.).

### `git commit-msg` Hook
1. `commit-msg-guard.sh` — Conventional Commits formatı doğrulaması.

---

## 5. Atomic Operations (Script Transaction'ları)

Kortext'in "otonom ajan" iddiasını mümkün kılan en kritik kural: **her dosya değişikliği yapan script atomic bir transaction olmalıdır**. Yani:

1. Dosya değişikliğini uygula.
2. `git add <changed-files>` ile staging'e ekle.
3. `git commit -m "chore(kortext): <action> <item-id>"` ile commit at.
4. Hata oluşursa rollback: değişiklikleri `git stash` ile sakla (kibar rollback). `git reset --hard HEAD` agresif olduğu için tercih edilmez.

### Bu Kurala Uyması Gereken Script'ler (Write Operations)

| Script | Tipik Commit Mesajı |
|---|---|
| `kortext-item-start.py` | `chore(kortext): start item TXX-name` |
| `kortext-item-transition.py` | `chore(kortext): transition TXX to <status>` |
| `kortext-backlog-add.py` | `chore(kortext): add <type> XXX-name` |
| `kortext-handover.py` | `chore(kortext): handover from <from> to <to>` |
| `kortext-bulk-plan.py` | `chore(kortext): bulk plan from analysis` |
| `kortext-backlog-sync.py` | `chore(kortext): sync backlog dashboards` |

**Not:** Bu commit'ler `[skip ci]` flag'i taşıyabilir; meta operasyonlar CI tetiklemez.

### Bu Kurala UYMAYAN Script'ler (Read-Only)

Aşağıdaki script'ler yalnızca okur, raporlar veya kontrol eder. Dosya değişikliği yapmaz, commit gerektirmez:

| Script | Amaç |
|---|---|
| `kortext-session-start.py` | SESSION_BRIEF üretir (stdout) |
| `kortext-consistency-check.py` | Eski pattern taraması, exit code |
| `kortext-context-check.py` | Stale context tespiti, exit code |
| `kortext-backlog-health.py` | Backlog skoru (stdout) |
| `kortext-item-check.py` | Kapanış koşulu doğrulama (exit code) |
| `kortext-lock.py` (status komutu) | Kilit durumu sorgusu |

**Önemli:** `kortext-lock.py acquire` ve `release` da dosya yazar (`.locks/` altına) ama bunlar geçici dosyalardır; commit gerektirmez.

---

## 6. Stale & Timeout Konfigürasyonu

Tüm zaman bazlı eşikler `settings/config.md`'de tanımlanır. Faz 1.7'de tutarsızlık giderildikten sonra tek kaynaktan okunur.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `KORTEXT_STALE_HOURS_CONTEXT` | `24` | `workspace/memory/context/` altındaki aktif ajan dosyalarının stale eşiği. Aşılırsa `kortext-session-start.py` ve `kortext-context-check.py` uyarı verir. |
| `KORTEXT_STALE_HOURS_BACKLOG` | `48` | `In Progress` statüsündeki backlog item'ların stale eşiği. Aşılırsa `kortext-backlog-health.py` "stale" olarak işaretler. |
| `KORTEXT_LOCK_TIMEOUT_SECONDS` | `300` | Python lock (`kortext-lock.py`) timeout. 5 dakika sonra lock stale kabul edilir. |
| `KORTEXT_LOCK_TIMEOUT_MIN` | `5` | Shell fallback lock için dakika cinsinden eşik (`auto-locker.sh`). |
| `KORTEXT_SIZE_LIMIT` | `500` | Dosya satır limiti. Bu sayıyı aşan dosyalar `size-guard.sh` tarafından flag'lenir; arşivleme protokolü tetiklenir. |
| `KORTEXT_BACKUP_KEEP` | `5` | `workspace/backups/` altında tutulacak rolling snapshot sayısı. |

**Birim tutarlılığı:** Faz 1.3 sonrası tüm değişkenler birimleriyle birlikte adlandırılır (`_SECONDS`, `_MIN`, `_HOURS`). Eski `KORTEXT_LOCK_TIMEOUT` (birim belirsiz) değişkeni deprecate edilmiştir.

---

## Eklenti Notu (Faz Geçişi)

Bu dosya, Faz 2 kapsamında glue layer'ı dokümante eder. **Aşağıdaki ilgili adımlar başka ajan/iterasyonlara bırakılmıştır:**

- Faz 2.2 — Workflow'lara "Otomasyon Çağrıları" bölümü eklemek (workflow dosyalarının kendisi düzenlenir).
- Faz 2.4 — Yazma script'lerine git commit entegrasyonu (`kortext-item-start.py`, `kortext-item-transition.py`, `kortext-backlog-add.py`, `kortext-handover.py` kodları güncellenir).
- Faz 2.5 — `snapshot-guard.sh`'in `git-pre-commit.sh` chain'ine eklenmesi.
- `hooks/kortext-init.sh`'in runtime tespiti yapacak şekilde güncellenmesi.

Bu dosya bu değişikliklerin **referans yatağıdır**; uygulamalar başka ajanlar tarafından bu tabloya bakılarak yapılır.
