-- Crush.X Content Intelligence — PostgreSQL review migration.
-- Run only against an owner-approved staging database after backup and review.
-- These tables store coarse user preferences and authorized content metadata,
-- not private DMs, OTPs, payment details, raw video, sensitive demographics.
BEGIN;

CREATE TABLE IF NOT EXISTS cx_content_preferences (
  subject TEXT PRIMARY KEY CHECK (length(subject) BETWEEN 1 AND 128),
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_analyze BOOLEAN NOT NULL DEFAULT FALSE,
  can_personalize BOOLEAN NOT NULL DEFAULT FALSE,
  topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cx_content_consent_dependencies CHECK
    ((NOT can_analyze OR can_read) AND (NOT can_personalize OR can_read)),
  CONSTRAINT cx_content_interests_requires_consent CHECK
    (can_personalize OR cardinality(topics) = 0)
);

CREATE TABLE IF NOT EXISTS cx_content_catalog (
  content_id TEXT PRIMARY KEY CHECK (length(content_id) BETWEEN 1 AND 96),
  creator_subject TEXT NOT NULL CHECK (length(creator_subject) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK (kind IN ('reel','post','story','video')),
  status TEXT NOT NULL CHECK (status IN ('draft','published','deleted')),
  moderation TEXT NOT NULL CHECK (moderation IN ('pending','approved','rejected')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','self','followers','close_friends','private')),
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cx_content_text_sizes CHECK
    (length(title) <= 200 AND length(caption) <= 2400 AND length(transcript) <= 8000)
);
CREATE INDEX IF NOT EXISTS cx_content_public_recent
  ON cx_content_catalog (kind,published_at DESC,content_id)
  WHERE status='published' AND moderation='approved' AND visibility='public';
CREATE INDEX IF NOT EXISTS cx_content_creator_idx
  ON cx_content_catalog (creator_subject);

CREATE TABLE IF NOT EXISTS cx_content_blocks (
  subject TEXT NOT NULL,
  blocked_creator TEXT NOT NULL,
  PRIMARY KEY(subject,blocked_creator)
);
CREATE TABLE IF NOT EXISTS cx_content_hides (
  subject TEXT NOT NULL,
  content_id TEXT NOT NULL REFERENCES cx_content_catalog(content_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(subject,content_id)
);

-- Events are inserted only by an authenticated, trusted engagement collector.
-- event_id is a durable idempotency key scoped to account.
CREATE TABLE IF NOT EXISTS cx_content_events (
  subject TEXT NOT NULL,
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 8 AND 96),
  content_id TEXT NOT NULL REFERENCES cx_content_catalog(content_id) ON DELETE CASCADE,
  creator_subject TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN
    ('view','complete','rewatch','like','save','share','follow','skip','not_interested','hide')),
  topics TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  watch_fraction DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (watch_fraction BETWEEN 0 AND 1),
  occurred_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(subject,event_id)
);
CREATE INDEX IF NOT EXISTS cx_content_events_read
  ON cx_content_events (subject,occurred_at DESC);
CREATE INDEX IF NOT EXISTS cx_content_events_media
  ON cx_content_events(content_id);

COMMIT;
