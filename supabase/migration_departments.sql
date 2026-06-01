-- ============================================================
--  Departments Migration
--  Run this in: Supabase → SQL Editor → New Query
--  Adds: departments table + people.department_id column
-- ============================================================


-- ── 1. Create departments table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id    UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#63b3ed',
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read departments
CREATE POLICY "Authenticated users can read departments"
  ON public.departments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only super_admin can insert/update/delete
CREATE POLICY "Super admins can manage departments"
  ON public.departments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );


-- ── 2. Add department_id to people ───────────────────────────────────────────

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;


-- ── 3. Index for common queries ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_departments_event_id ON public.departments(event_id);
CREATE INDEX IF NOT EXISTS idx_people_department_id ON public.people(department_id);
