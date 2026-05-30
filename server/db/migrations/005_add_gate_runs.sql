-- Kortext v3.1 — gate_runs (motor/şema epic §5.9 #3)
-- test-cycle gate kontrollerinin evi: her seçili gate item'da bir satır bırakır
-- (pass/fail + bulgu). Join motorun işi (§5.8) — orchestrator bu satırlar üzerinde
-- TS fold yapar (hepsi pass→review · ≥1 fail→in_progress); DAG fan-in DEĞİL (§5.13).
-- attempt = test-cycle ayırıcı: item her `test`'e girdiğinde +1; bounce sonrası
-- re-test eski cycle'ın `fail` satırlarını okumaz → sonsuz-bounce imkânsız (§5.13).

CREATE TABLE gate_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  gate            TEXT NOT NULL
                    CHECK (gate IN ('code_review','quality_control','security_control','design_review','uat')),
  persona         TEXT,                                -- gate'i koşan persona, e.g. '+qa-engineer'
  attempt         INTEGER NOT NULL DEFAULT 1,          -- kaçıncı test-cycle (bounce → +1)
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','pass','fail')),
  findings        TEXT,                                -- fail bulgusu (markdown); pass'te genelde null
  created_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  UNIQUE(item_id, attempt, gate)                       -- bir cycle'da aynı gate iki kez koşamaz
);

CREATE INDEX idx_gate_runs_item ON gate_runs(item_id);
CREATE INDEX idx_gate_runs_item_attempt ON gate_runs(item_id, attempt);
CREATE INDEX idx_gate_runs_status ON gate_runs(status);
