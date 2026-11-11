-- Migration: reminder_log table
-- Run this in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id      uuid NOT NULL,
  session_type    text NOT NULL CHECK (session_type IN ('on_track', 'activation')),
  person_id       uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  scheduled_day   date NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

-- One reminder per person per session per day
CREATE UNIQUE INDEX IF NOT EXISTS reminder_log_dedup
  ON public.reminder_log (session_id, session_type, person_id, scheduled_day);

-- Index for quick cleanup queries
CREATE INDEX IF NOT EXISTS reminder_log_day_idx
  ON public.reminder_log (scheduled_day);

-- RLS: service role only (edge function uses service role key)
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.reminder_log
  FOR ALL
  USING (auth.role() = 'service_role');

-- Auto-clean reminders older than 7 days (keeps table tidy)
-- Optional: run this as a pg_cron job daily
-- SELECT cron.schedule('cleanup-reminder-log', '0 3 * * *', $$
--   DELETE FROM public.reminder_log WHERE scheduled_day < current_date - interval '7 days';
-- $$);

COMMENT ON TABLE public.reminder_log IS
  'Tracks sent WhatsApp reminders to prevent duplicate sends when cron fires multiple times in the reminder window.';
