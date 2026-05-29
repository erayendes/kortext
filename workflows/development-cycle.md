# Development Cycle

> **Bu dosyada:** Planlamada atanmış, hazır bir backlog item assignee-developer
> tarafından izole worktree'de geliştirilir, test-cycle ile doğrulanır, gerekiyorsa
> prime onayından geçer, devops merge eder ve buna bağlı blocker'lar kaldırılır.
> Foundation okunmaz; references source-of-truth'tur.

## Implementation

1. **+assignee:** Sana atanmış, `blocked_by` boş item'ı `in_progress`'e çek; motor `development`'tan izole worktree açar. Referanslara sadık kalarak uygula; unit test ekle, yerelde çalıştır; commit at (`GLOSSARY` commit standardı). İşin kapsamına göre ilgili references'ı oku — backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`; ilgisiz dosyaları ve foundation'ı okuma. Bitince item'ı `test`'e çek.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/SECURITY.md`, `.kortext/references/TEST.md`
   - outputs: item-in-test

## Verification

1. **+assignee:** `05-test-cycle`'ı tetikle (`start_pipeline` MCP tool). Sonuç fail ise item `in_progress`'e dönmüştür (bulgular item yorumunda) → run biter. Pass ise item'ı `approver` alanına göre ilerlet: `+prime` ise `review`'e, değilse doğrudan `merge`'e çek.
   - inputs: item-in-test
   - outputs: item-verified

## Final Review

1. **+approver:** Yalnızca item'ın `approver` alanı `+prime` ise çalışır. Item UI/UX/UAT gerektiriyorsa ve proje lokal çalıştırılabiliyorsa motor worktree'den lokal bir test ortamı ayağa kaldırır ve prime'a local URL verir. Prime PR diff + acceptance criteria + gate sonuçlarını (varsa lokal preview'i) değerlendirir. Approve → `merge`'e çek; reject → `in_progress` (bulgular item yorumunda). Approver `+prime` değilse adım atlanır.
   - approver: +approver
   - inputs: item-verified
   - outputs: item-reviewed

## Merge & Closing

1. **+devops-engineer:** `merge` kolonundaki item'ı kontrol et (CI durumu, merge uygunluğu, ortam). Sorun varsa bulguyu item yorumuna yaz, `in_progress`'e geri çek ve assignee'ye ata. Sorun yoksa motor run-branch'ini `development`'a merge eder ve item `done`'a geçer; bu item'a `blocked_by` ile bağlı item'lardan referans kaldırılır. Epic'in son item'ı done olursa `06-deployment-cycle` staging deploy'u tetiklenir ve staging URL paylaşılır.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`, item-reviewed
   - outputs: item-merged

2. **+assignee:** Handover entry yaz (`write_handover` MCP tool: completed, changed_files, last_commit, next_steps). Motor worktree'yi kaldırır.
   - inputs: item-merged
   - outputs: item-done

**Sonraki akış:** Yeni item için tekrar `development-cycle`; production release zamanı geldiğinde `06-deployment-cycle`.
