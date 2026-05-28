# Kortext Command Reference

Bu dosya, +prime tarafından tetiklenen dış giriş kapılarını tanımlar. Komutlar yalnızca var olan workflow'ları veya açık onay noktalarını başlatır; workflow içinde zaten tanımlı olan ara adımlar burada ayrı komut olarak çoğaltılmaz.

## Komut Tablosu (Glue Reference)

Bu tablo Faz 2 (glue layer) kapsamında eklendi. Her komutun hangi persona tarafından tetiklendiğini, hangi workflow'u açtığını ve hangi script'i çağırdığını tek bakışta gösterir. Detaylı açıklamalar aşağıdaki "Ana Komutlar" bölümünde.

| Komut | Tetikleyen Persona | Açılan Workflow | Çağrılan Script |
|---|---|---|---|
| `!start analysis` | +operation-manager | workflows/new-project-analysis.md | `kortext-session-start.py` |
| `!start onboard` | +operation-manager | workflows/existing-project-analysis.md | `kortext-session-start.py` |
| `!start planning` | +operation-manager | workflows/planning-pipeline.md | `kortext-bulk-plan.py` |
| `!start spike` | +engineering-manager | workflows/02b-spike-workflow.md | `kortext-backlog-add.py --type spike` |
| `!setup environment` | +devops-engineer | workflows/environment-setup.md | — |
| `!start development` | +engineering-manager | workflows/04-development-cycle.md | `kortext-item-start.py` |
| `!start test` | +qa-engineer | workflows/05-test-cycle.md | `kortext-item-transition.py` |
| `!deploy prod` | +delivery-manager | workflows/06-deployment-cycle.md | — (manuel git tag + CI) |
| `!trigger-rollback` | +delivery-manager | workflows/07-rollback-pipeline.md | (manuel git revert) |
| `!start-hotfix` | +delivery-manager | workflows/08-hotfix-pipeline.md | `kortext-backlog-add.py --type hotfix` |
| `!maintenance` | +operation-manager | workflows/09-maintenance-cycle.md | `kortext-backlog-health.py` |
| `!status` | +operation-manager | — | `kortext-session-start.py` + `kortext-context-check.py` |
| `!continue` | +prime | — (checkpoint onayı) | — |
| `!approve` | +prime | — (gate onayı) | `kortext-item-transition.py` |
| `!handover` | (herhangi ajan) | — | `kortext-handover.py` |
| `!add task` | +engineering-manager | — | `kortext-backlog-add.py --type task` |
| `!add bug` | +qa-engineer | — | `kortext-backlog-add.py --type bug` |
| `!add debt` | +engineering-manager | — | `kortext-backlog-add.py --type debt` |
| `!check` | +operation-manager | — | `kortext-consistency-check.py` |

### Yeni Komutlar (Faz 2'de Tanıtılan)

- `!trigger-rollback` — +delivery-manager tarafından son güvenli sürüme geri dönüş akışını başlatır. `workflows/07-rollback-pipeline.md` üzerinden ilerler; manuel git revert sonrası rollback kayıtları işlenir.
- `!start-hotfix` — +delivery-manager tarafından kritik production hatası için hotfix akışı başlatır. `kortext-backlog-add.py --type hotfix` ile backlog'a `HXX-` prefix'li item eklenir.
- `!continue` — +prime tarafından checkpoint onayı olarak verilir. Workflow açmaz, ajanın bir sonraki adıma geçmesini onaylar. `04-development-cycle.md`'deki checkpoint mekanizmasında kullanılır.
- `!approve` — +prime tarafından gate onayı olarak verilir. `Review` statüsündeki bir item'ı `Done`'a taşımak için `kortext-item-transition.py` tetikler.
- `!handover` — Herhangi bir ajan tarafından ara devir için kullanılabilir. `kortext-handover.py` ile `workspace/memory/handover.md`'ye yeni devir kaydı eklenir.
- `!add task` / `!add bug` / `!add debt` — Sırasıyla +engineering-manager, +qa-engineer ve +engineering-manager tarafından direkt backlog girişi için. `kortext-backlog-add.py --type <task|bug|debt>` çağırır.
- `!check` — +operation-manager tarafından tutarlılık kontrolü olarak çağrılır. `kortext-consistency-check.py` çalıştırır; eski pattern kalıntılarını tespit eder.

## Ana Komutlar

| Komut | Parametre | Tetiklediği Akış | Ana Çıktı | Kullanım |
| :--- | :--- | :--- | :--- | :--- |
| `!setup` | `environment` | `workflows/environment-setup.md` | Çalışan ortam ve test kaydı | Analiz ve planlama sonrası ortam kurulumunu başlatır. |
| `!start` | `analysis` | `workflows/new-project-analysis.md` | `workspace/reports/analysis-reports.md` | Yeni proje analizini başlatır. |
| `!start` | `onboard` | `workflows/existing-project-analysis.md` | `workspace/reports/analysis-reports.md` | Mevcut projeyi Kortext'e dahil eder. |
| `!start` | `planning` | `workflows/planning-pipeline.md` | `workspace/memory/backlog/` | Onaylı analizden düz backlog üretir. |
| `!start` | `spike` | `workflows/02b-spike-workflow.md` | `workspace/memory/decisions.md` ADR veya yeni Task | Teknik belirsizliği gidermek için time-boxed araştırma başlatır. |
| `!start` | `development` | `workflows/04-development-cycle.md` | Aktif item akışı | Backlog'daki uygun item üzerinde geliştirmeyi başlatır. |
| `!deploy` | `prod` | `workflows/06-deployment-cycle.md` | `workspace/reports/delivery-reports.md` | Production deployment akışını başlatır. |
| `!rollback` | `[version]` | `workflows/07-rollback-pipeline.md` | Rollback kayıtları | Son güvenli sürüme geri dönüş akışını başlatır. |
| `!hotfix` | `[issue-id]` | `workflows/08-hotfix-pipeline.md` | Hotfix kayıtları | Kritik production hatası için hotfix akışını başlatır. |
| `!maintenance` | — | `workflows/09-maintenance-cycle.md` | `workspace/reports/status-reports.md` | Rutin bakım döngüsünü başlatır (bağımlılık, teknik borç, güvenlik). |
| `!status` | — | `scripts/kortext-backlog-health.py` + `context-check.py` | Hızlı durum özeti | Backlog sağlığı, aktif ajanlar ve blokerları özetler. |
| `!status` | `full` | Tüm rapor dosyaları | Tam sistem raporu | Deployment durumu, test coverage ve maliyet dahil tam rapor. |
| `!request` | `[açıklama]` | Talep alım süreci | `workspace/memory/backlog/` adayı | Yeni feature, improvement, bug veya debt talebini sisteme alır. |
| `!approve` | `[artifact]` | Onay noktası | İlgili artifact status kaydı | Bekleyen kararı onaylar ve akışı ilerletir. |
| `!reject` | `[artifact] [sebep]` | Revizyon noktası | İlgili artifact status kaydı | Bekleyen çıktıyı revizyona geri gönderir. |

## Yorumlama Kuralları

- Komutlar yalnızca workflow giriş kapıları ve onay noktalarıdır.
- Test, review, security check, handover, sync ve release note üretimi workflow içindeki adımlardır; ayrı komut olarak çağrılmaz.
- `!start analysis` yalnız yeni projede; `!start onboard` yalnız mevcut projede kullanılır.
- `!start spike` geliştirme başlamadan önce teknik belirsizlik varsa kullanılır; sprint kapsamını değiştirmez.
- `!approve` ve `!reject` mutlaka hedef artifact veya item ile birlikte kullanılır.
- `!status` hızlı özet için; `!status full` tüm rapor dosyalarını kapsayan tam rapor için kullanılır.
- Dosya yolu yazılırken canonical workspace yolları kullanılır: `workspace/references/`, `workspace/reports/`, `workspace/memory/backlog/`, `workspace/memory/context/[agent-name]-active.md`.
- Backlog item'ları düz yapıdadır: `TXX-[task-name].md`, `BXX-[bug-name].md`, `DXX-[debt-name].md`.
- `skills/` ayrı bir çalışma alanıdır; komut referansı bu klasörün içeriğini yönetmez.
- Görev yaşam döngüsü scriptlerle desteklenir:
  - `kortext-session-start.py` — oturum başlangıcı (context yükleme ve SESSION_BRIEF)
  - `kortext-context-check.py` — context bütünlük kontrolü
  - `kortext-backlog-health.py` — backlog sağlık skoru
  - `kortext-lock.py` — paylaşımlı dosya kilidi yönetimi
  - `kortext-item-start.py`
  - `kortext-item-transition.py`
  - `kortext-handover.py`
  - `kortext-item-check.py`
  - `kortext-backlog-sync.py`

## `!request` Akışı

`!request [açıklama]` komutu geldiğinde +product-manager şu adımları izler:

1. **Sınıflandır**
   - **Feature:** Yeni özellik veya geliştirme
   - **Improvement:** Mevcut özelliğin iyileştirilmesi
   - **Bug:** Hata bildirimi → +engineering-manager'a yönlendirilir
   - **Debt:** Teknik borç, refactor, test açığı veya operasyonel iyileştirme
2. **Netleştir**
   - Beklenen davranış ne?
   - Hangi kullanıcıyı etkiliyor?
   - Ne zaman gerekli? (`Acil / Bu versiyon / Gelecek versiyon`)
3. **Backlog'a al**
   - Uygun formatta (`TXX-[task-name].md`, `BXX-[bug-name].md`, `DXX-[debt-name].md`) düz backlog altında kayıt aç.
   - Önceliği +prime'ın aciliyet belirtiminden çıkar.
4. **Bildir**

```text
---
TALEBİN ALINDI
+prime, "[talep özeti]" backlog'a eklendi.
- Tip: [Feature / Improvement / Bug / Debt]
- Öncelik: [Blocker / High / Medium / Low]
- ID: [task-id]
Komutunu bekliyorum.
---
```
