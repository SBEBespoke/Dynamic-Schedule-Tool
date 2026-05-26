-- ============================================================
--  Live Schedule Manager — Supabase Schema
--  Run this entire file in: Supabase → SQL Editor → New Query
-- ============================================================

-- ── EXTENSIONS ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ── ENUM: user roles ──
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'ops_lead', 'area_manager', 'team_member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
--  TABLES
-- ============================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name           TEXT        NOT NULL,
  role           user_role   NOT NULL DEFAULT 'team_member',
  phone_whatsapp TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Events (one per race weekend / activation)
CREATE TABLE IF NOT EXISTS events (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  venue       TEXT,
  venue_lat   FLOAT,
  venue_lng   FLOAT,
  start_date  DATE,
  end_date    DATE,
  config      JSONB       DEFAULT '{}',   -- reserved for future per-event settings
  created_by  UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Days (linked to an event, one per calendar day of the event)
CREATE TABLE IF NOT EXISTS days (
  id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id   UUID    NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  date       DATE,
  sort_order INT     DEFAULT 0
);

-- On-track sessions
CREATE TABLE IF NOT EXISTS on_track_sessions (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id         UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day_id           UUID        NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  category         TEXT        DEFAULT 'General',
  start_mins       INT         NOT NULL,          -- scheduled start, minutes from midnight
  duration_mins    INT         NOT NULL,
  slip_mins        INT         DEFAULT 0,         -- manual operator slip
  cascade_slip_mins INT        DEFAULT 0,         -- auto-computed cascade
  duration_override INT,                          -- actual duration when manually adjusted
  must_start_at    INT,                           -- hard locked start (minutes from midnight)
  must_finish_by   INT,                           -- hard end cap (minutes from midnight)
  notes            TEXT,
  sort_order       INT         DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Activation areas (panel zones — e.g. Sponsor Village, Pitlane)
CREATE TABLE IF NOT EXISTS areas (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id      UUID    NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  color         TEXT    DEFAULT '#3b82f6',
  radio_channel TEXT
);

-- Area sessions (activations within a zone)
CREATE TABLE IF NOT EXISTS area_sessions (
  id                  UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            UUID    NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  area_id             UUID    NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  day_id              UUID    NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  name                TEXT    NOT NULL,
  -- Start dependency
  dep_type            TEXT    DEFAULT 'fixed',    -- 'fixed' | 'after'
  dep_session_id      UUID    REFERENCES on_track_sessions(id) ON DELETE SET NULL,
  dep_offset_mins     INT     DEFAULT 0,
  start_mins          INT     NOT NULL,           -- used when dep_type = 'fixed'
  -- Duration / finish dependency
  duration_mins       INT     NOT NULL,
  fin_dep_type        TEXT    DEFAULT 'duration', -- 'duration' | 'otStart' | 'otEnd'
  fin_dep_session_id  UUID    REFERENCES on_track_sessions(id) ON DELETE SET NULL,
  fin_dep_offset_mins INT     DEFAULT 0,
  notes               TEXT
);

-- People / team members
CREATE TABLE IF NOT EXISTS people (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id       UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  name           TEXT        NOT NULL,
  phone_whatsapp TEXT,
  radio_channel  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- People ↔ On-track sessions (many-to-many)
CREATE TABLE IF NOT EXISTS people_on_track (
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES on_track_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, session_id)
);

-- People ↔ Area sessions (many-to-many)
CREATE TABLE IF NOT EXISTS people_area_sessions (
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  area_session_id UUID NOT NULL REFERENCES area_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, area_session_id)
);

-- Slip log (audit trail)
CREATE TABLE IF NOT EXISTS slip_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id      UUID        REFERENCES on_track_sessions(id) ON DELETE SET NULL,
  session_name    TEXT        NOT NULL,
  day_id          UUID        REFERENCES days(id) ON DELETE SET NULL,
  added_mins      INT         NOT NULL,   -- delta applied in this operation
  total_slip_mins INT         NOT NULL,   -- cumulative slip after this operation
  operator_id     UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
--  HELPER FUNCTION — get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE days                ENABLE ROW LEVEL SECURITY;
ALTER TABLE on_track_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE people              ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_on_track     ENABLE ROW LEVEL SECURITY;
ALTER TABLE people_area_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_log            ENABLE ROW LEVEL SECURITY;


-- ── user_profiles ──
CREATE POLICY "Authenticated users can view all profiles"
  ON user_profiles FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Super admin can insert profiles"
  ON user_profiles FOR INSERT WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "Super admin can update any profile"
  ON user_profiles FOR UPDATE USING (get_user_role() = 'super_admin');


-- ── events ──
CREATE POLICY "Authenticated users can view events"
  ON events FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admin and ops lead can manage events"
  ON events FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── days ──
CREATE POLICY "All authenticated users can view days"
  ON days FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage days"
  ON days FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── on_track_sessions ──
CREATE POLICY "All authenticated users can view on_track_sessions"
  ON on_track_sessions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage on_track_sessions"
  ON on_track_sessions FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── areas ──
CREATE POLICY "All authenticated users can view areas"
  ON areas FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage areas"
  ON areas FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── area_sessions ──
CREATE POLICY "All authenticated users can view area_sessions"
  ON area_sessions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage area_sessions"
  ON area_sessions FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── people ──
CREATE POLICY "All authenticated users can view people"
  ON people FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage people"
  ON people FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── people_on_track ──
CREATE POLICY "All authenticated users can view people_on_track"
  ON people_on_track FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage people_on_track"
  ON people_on_track FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── people_area_sessions ──
CREATE POLICY "All authenticated users can view people_area_sessions"
  ON people_area_sessions FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can manage people_area_sessions"
  ON people_area_sessions FOR ALL USING (get_user_role() IN ('super_admin', 'ops_lead'));


-- ── slip_log ──
CREATE POLICY "All authenticated users can view slip_log"
  ON slip_log FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Ops and above can insert slip_log entries"
  ON slip_log FOR INSERT WITH CHECK (get_user_role() IN ('super_admin', 'ops_lead'));


-- ============================================================
--  TRIGGER: auto-create user_profile on first sign-up
--  This fires whenever a new user is created in auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'team_member'   -- default role; promote to super_admin manually
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
--  PROMOTE FIRST SUPER ADMIN
--  After running this schema, invite yourself via Supabase Auth,
--  then run this query substituting your email:
--
--    UPDATE user_profiles
--    SET role = 'super_admin'
--    WHERE id = (SELECT id FROM auth.users WHERE email = 'shaun@sbebespoke.com');
--
-- ============================================================
