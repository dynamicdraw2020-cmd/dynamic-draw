-- Emergency password recovery for restored Dynamic D database.
-- This resets every non-deleted profile's Supabase Auth password to the same temporary password
-- and marks the profile so the login screen shows the temporary password notice.
-- Temporary password: DynamicD2026!reset
-- Run this in the NEW Supabase project's SQL Editor after ADD_FORCE_PASSWORD_CHANGE_v1.8.6.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NULL;

-- Fix the known restored admin-email typo, if it exists.
UPDATE auth.users
SET email = 'dynamicdraw2020@gmail.com',
    updated_at = now()
WHERE email = 'dynamicdraw2020@gmil.com';

UPDATE public.profiles
SET email = 'dynamicdraw2020@gmail.com',
    updated_at = now()
WHERE email = 'dynamicdraw2020@gmil.com';

-- Set a temporary password for restored Auth users.
UPDATE auth.users AS u
SET encrypted_password = extensions.crypt('DynamicD2026!reset', extensions.gen_salt('bf')),
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    updated_at = now(),
    raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb)
FROM public.profiles AS p
WHERE p.id = u.id
  AND COALESCE(p.status, '') <> 'DELETED';

-- Mark those users for mandatory password change.
UPDATE public.profiles AS p
SET must_change_password = true,
    password_reset_at = now(),
    password_changed_at = NULL,
    updated_at = now()
WHERE COALESCE(p.status, '') <> 'DELETED'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Quick check result.
SELECT
  COUNT(*) FILTER (WHERE p.must_change_password = true) AS profiles_marked_for_change,
  COUNT(*) FILTER (WHERE u.encrypted_password IS NOT NULL) AS auth_users_with_password,
  COUNT(*) FILTER (WHERE u.id IS NULL) AS profiles_missing_auth_user
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE COALESCE(p.status, '') <> 'DELETED';
