# Development Cycle

> **Bu dosyada:** assignee-developer atanmış item'ı izole worktree'de geliştirip
> `test`'e taşır; development-cycle burada biter. Doğrulama/onay/merge test-cycle +
> motorun işi. Foundation okunmaz; references source-of-truth.

## Implementation

1. **+assignee:** Sana atanmış, `blocked_by` boş item'ı `in_progress`'e çek; motor `development`'tan izole worktree açar. Referanslara sadık kalarak uygula; unit test ekle, yerelde çalıştır; commit at (`GLOSSARY` commit standardı). Her görevde `STACK` + `STRUCTURE` + `GLOSSARY` + `SECURITY` + `TEST` oku; görev türüne göre ek oku — backend → `API` + `DATABASE`, frontend → `DESIGN` + `API`. İlgisiz reference'ları ve foundation'ı okuma. Bitince item'ı `test`'e çek; motor PR açar ve çalıştırılabilir görevse local test URL verir.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/SECURITY.md`, `.kortext/references/TEST.md`
   - outputs: item-in-test

**Sonraki akış:** `05-test-cycle`
