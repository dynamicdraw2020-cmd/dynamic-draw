-- Dynamic D password recovery flags for SQL + GitHub/Vercel flow.
-- Run this ONCE in the NEW Supabase project SQL Editor before deploying the ZIP.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS username text NULL;

-- Make sure every restored profile has an ID-style username.
UPDATE public.profiles
SET username = split_part(email, '@', 1)
WHERE (username IS NULL OR btrim(username) = '')
  AND email IS NOT NULL
  AND position('@' in email) > 1;

-- Align auth.users.email to profiles.email when they share the same id.
-- This fixes cases like dynamicdraw2020@gmil.com -> dynamicdraw2020@gmail.com.
UPDATE auth.users AS u
SET
  email = lower(p.email),
  updated_at = now(),
  raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
FROM public.profiles AS p
WHERE u.id = p.id
  AND p.email IS NOT NULL
  AND btrim(p.email) <> ''
  AND lower(COALESCE(u.email, '')) <> lower(p.email)
  AND NOT EXISTS (
    SELECT 1
    FROM auth.users AS other
    WHERE other.id <> u.id
      AND lower(other.email) = lower(p.email)
  );

-- Mark accounts that exist in auth.users but have no password hash.
-- These users will see the temporary password notice on the login screen.
UPDATE public.profiles AS p
SET
  must_change_password = true,
  password_reset_at = COALESCE(password_reset_at, now()),
  password_changed_at = NULL,
  updated_at = now()
FROM auth.users AS u
WHERE u.id = p.id
  AND (p.status IS NULL OR p.status <> 'DELETED')
  AND (u.encrypted_password IS NULL OR btrim(u.encrypted_password) = '');

-- Optional: make the known operator/admin login visible too if the profile exists.
UPDATE public.profiles
SET
  must_change_password = true,
  password_reset_at = COALESCE(password_reset_at, now()),
  password_changed_at = NULL,
  updated_at = now()
WHERE lower(email) = 'dynamicdraw2020@gmail.com'
  AND (status IS NULL OR status <> 'DELETED');

SELECT
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE must_change_password = true AND password_changed_at IS NULL) AS temporary_password_users,
  COUNT(*) FILTER (WHERE email IS NULL OR btrim(email) = '') AS profiles_without_email
FROM public.profiles
WHERE (status IS NULL OR status <> 'DELETED');
