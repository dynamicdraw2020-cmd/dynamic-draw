-- Dynamic D v1.8.6: restored-password flow
-- Run once in Supabase SQL Editor on the NEW project.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password
  ON public.profiles(must_change_password)
  WHERE must_change_password = true;
