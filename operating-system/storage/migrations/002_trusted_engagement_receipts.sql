-- Crush.X trusted first-party engagement receipts.
-- Review and run after migration 001 on an isolated PostgreSQL 16+ staging DB.
-- Restricted application role: no public mobile/API write access to this table.
BEGIN;
CREATE TABLE IF NOT EXISTS cx_trusted_event_receipts (
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 128),
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 8 AND 96),
  content_id TEXT NOT NULL REFERENCES cx_content_catalog(content_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN
   ('view','complete','rewatch','like','save','share','follow','skip','not_interested','hide')),
  event_at_ms BIGINT NOT NULL,
  watch_fraction DOUBLE PRECISION NOT NULL CHECK (watch_fraction BETWEEN 0 AND 1),
  issued_at_ms BIGINT NOT NULL,
  issuer TEXT NOT NULL CHECK (length(issuer) BETWEEN 1 AND 96),
  audience TEXT NOT NULL CHECK (length(audience) BETWEEN 1 AND 96),
  signature CHAR(64) NOT NULL CHECK (signature ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(subject,event_id),
  CONSTRAINT cx_trusted_receipt_lifetime CHECK (expires_at > to_timestamp(issued_at_ms / 1000.0))
);
CREATE INDEX IF NOT EXISTS cx_trusted_event_receipts_expire_idx
 ON cx_trusted_event_receipts (expires_at);
COMMIT;
