-- Kortext v3.1 — review_gates on backlog_items (motor/şema epic §5.9 #2)
-- Item'ın gate-checklist seçimi: hangi gate'ler test-cycle'da koşacak
-- (code_review/quality_control/security_control/design_review/uat).
-- planning-pipeline yazar; orchestrator (§5.9 #4) okuyup paralel fan-out eder.
-- JSON array (gate isimleri); boş [] = 0-gate item → join vacuously pass → review (§5.8).
-- SQLite: sabit DEFAULT ile ADD COLUMN NOT NULL izinli (tablo rebuild GEREKMEZ).

ALTER TABLE backlog_items ADD COLUMN review_gates TEXT NOT NULL DEFAULT '[]';
