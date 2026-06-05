-- Kortext v3.1 — per-item model on backlog_items (planning epic: Epic→Version→Task + model)
-- Item'ın LLM model tercihi: +operation-manager planning'de rules/models.md mapping'ine göre yazar.
-- Orchestrator/worker bu alanı okuyup item'ı doğru modelle çalıştırır.
-- Boş (NULL) = model belirtilmemiş → runtime varsayılanı uygulanır.
-- SQLite: NULL-able ADD COLUMN her zaman izinli (tablo rebuild GEREKMEZ).

ALTER TABLE backlog_items ADD COLUMN model TEXT;
