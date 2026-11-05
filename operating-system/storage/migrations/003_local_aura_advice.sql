-- Crush.X AURA-X advice-only durable queue and distributed rate buckets.
-- Requires PostgreSQL 16+ and isolated owner-approved migration/backups.
-- No model/API secrets or plaintext user prompts are stored in these tables.
BEGIN;
CREATE TABLE IF NOT EXISTS cx_aura_advice_jobs (
 id TEXT PRIMARY KEY CHECK(id ~ '^[0-9a-f-]{36}$'),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 128),
 workflow TEXT NOT NULL CHECK(length(workflow) BETWEEN 1 AND 64),
 input_hash CHAR(64) NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','blocked','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at_ms BIGINT NOT NULL,
 next_run_at_ms BIGINT NOT NULL,
 due_at_ms BIGINT,
 expires_at_ms BIGINT NOT NULL,
 sealed JSONB,
 sealed_result JSONB,
 lease_token TEXT,
 lease_until_ms BIGINT,
 finished_at_ms BIGINT,
 code TEXT,
 CONSTRAINT cx_aura_valid_lease CHECK (
  status <> 'running' OR (lease_token IS NOT NULL AND lease_until_ms IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS cx_aura_advice_due
 ON cx_aura_advice_jobs (due_at_ms,id)
 WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS cx_aura_advice_expiry ON cx_aura_advice_jobs(expires_at_ms);
CREATE INDEX IF NOT EXISTS cx_aura_advice_subject ON cx_aura_advice_jobs(subject);
CREATE TABLE IF NOT EXISTS cx_aura_rate_buckets (
 bucket_key CHAR(64) PRIMARY KEY CHECK(bucket_key ~ '^[0-9a-f]{64}$'),
 hits INTEGER NOT NULL DEFAULT 0 CHECK(hits>=0),
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS cx_aura_rate_expiry ON cx_aura_rate_buckets(expires_at);
COMMIT;
