CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization text NOT NULL,
  segment text NOT NULL DEFAULT 'other',
  city text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  source_url text NOT NULL DEFAULT '',
  source_type text NOT NULL DEFAULT 'manual',
  source_external_id text NOT NULL DEFAULT '',
  source_license text NOT NULL DEFAULT '',
  source_checked_at date,
  occasion text NOT NULL DEFAULT 'other',
  product_type text NOT NULL DEFAULT 'unknown',
  participants integer,
  event_date date,
  intent text NOT NULL DEFAULT 'unknown',
  location_fit text NOT NULL DEFAULT 'unknown',
  recurring boolean NOT NULL DEFAULT false,
  opportunity text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  followup date,
  notes text NOT NULL DEFAULT '',
  score integer NOT NULL DEFAULT 0,
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_source_unique
  ON leads(source_type, source_external_id)
  WHERE source_external_id <> '';
CREATE INDEX IF NOT EXISTS leads_discovered_idx ON leads(discovered_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_score_idx ON leads(score DESC);
CREATE INDEX IF NOT EXISTS leads_followup_idx ON leads(followup);

CREATE TABLE IF NOT EXISTS gmail_connections (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  gmail_email text NOT NULL DEFAULT '',
  encrypted_refresh_token text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  gmail_draft_id text NOT NULL DEFAULT '',
  recipient text NOT NULL DEFAULT '',
  subject text NOT NULL,
  body text NOT NULL,
  draft_type text NOT NULL DEFAULT 'first',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booking_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  handoff_type text NOT NULL CHECK (handoff_type IN ('quote', 'booking')),
  status text NOT NULL DEFAULT 'created',
  payload jsonb NOT NULL,
  external_id text NOT NULL DEFAULT '',
  external_url text NOT NULL DEFAULT '',
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  found_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discovery_runs
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE discovery_runs
  ADD COLUMN IF NOT EXISTS duration_ms integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS discovery_runs_started_idx ON discovery_runs(started_at DESC);
