-- Migration: session_acknowledgments table
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.session_acknowledgments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL,
  session_type    text NOT NULL CHECK (session_type IN ('on_track', 'activation')),
  person_id       uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, session_type, person_id)
);

CREATE INDEX IF NOT EXISTS session_ack_session_idx
  ON public.session_acknowledgments (session_id, session_type);

CREATE INDEX IF NOT EXISTS session_ack_person_idx
  ON public.session_acknowledgments (person_id);

ALTER TABLE public.session_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own acknowledgments (matched via people.linked_user_id)
CREATE POLICY "Own acknowledgments"
  ON public.session_acknowledgments
  FOR ALL
  USING (
    person_id IN (
      SELECT id FROM public.people WHERE linked_user_id = auth.uid()
    )
  );

-- Ops can read all acknowledgments
CREATE POLICY "Ops read all"
  ON public.session_acknowledgments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'ops_lead')
    )
  );

-- Service role full access (for edge functions)
CREATE POLICY "Service role full access"
  ON public.session_acknowledgments
  FOR ALL
  USING (auth.role() = 'service_role');
