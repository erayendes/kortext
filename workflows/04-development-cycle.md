# Development Cycle (`!start development`)

## Pick & Plan

1. **+engineering-manager:** Backlog'tan `status: to_do` ve assignee'si atanmış item'ları sırala. `blocked_by` alanı boş olmayan item'ları atla. İlk hazır item'ı seç. Item'ın status'unu `in_progress` yap (`update_backlog_item` MCP tool) ve assignee persona'sına delege et. Yan etki: handover entry ekle (`write_handover` MCP tool, from: +engineering-manager, to: assignee).
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`

## Implementation

1. **+engineering-manager:** Item'ı assignee disiplinine uygun şekilde uygula. `rules/branching.md` uyarınca `feature/<item-id>` branch'i aç. Referanslara (`STACK`, `STRUCTURE`, `GLOSSARY`, `SECURITY`, `API`, `DATABASE`, `DESIGN`) sadık kal. Unit test ekle, yerelde çalıştır. Commit at (mesajlar `GLOSSARY` standartlarına uymalı), PR aç. Item status'unu `test` yap.
   - inputs: `.kortext/foundation/PRD.md`, `.kortext/foundation/TRD.md`, `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`, `.kortext/references/GLOSSARY.md`, `.kortext/references/SECURITY.md`, `.kortext/references/API.md`, `.kortext/references/DATABASE.md`, `.kortext/references/DESIGN.md`

## Verification

1. **+engineering-manager:** Item için `05-test-cycle` workflow'unu tetikle (`start_pipeline` MCP tool). Test sonucu fail ise item `in_progress`'e döndür ve assignee'ye yeniden ata; pass ise item status'unu `review` yap.

## Final Review

1. **+engineering-manager:** Item'ı review et. SQL'den item.approver oku. Eğer `+prime` ise `pending_question` aç (kind: `item_review`, body: PR diff özeti + acceptance criteria + review gate sonuçları); cevabı bekle. Approve ise step başarıyla biter; reject ise item `in_progress`'e döner ve assignee'ye yeniden atanır. Approver `+prime` değilse +engineering-manager kendi onayını uygular.

## Deployment & Closing

1. **+devops-engineer:** PR'ı `development` branch'ine merge et. CI/CD pipeline'ın staging'e deploy çıktısını bekle. `write_handover` MCP tool ile handover entry yaz (completed, changed_files, watch-outs, last_commit, next_steps). Item status'unu `done` yap. Epic veya versiyon ilişkisi varsa Epic'in son item'ı `done` olursa status raporu güncelle.
   - inputs: `.kortext/references/ACCESS.md`, `.kortext/references/ENVIRONMENT.md`

**Sonraki akış:** Yeni item için tekrar `04-development-cycle`; production release zamanı geldiğinde `06-deployment-cycle`.
