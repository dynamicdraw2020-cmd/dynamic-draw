-- Dynamic D emergency password recovery
-- Run this in the NEW Supabase project SQL Editor.
-- Temporary password for all restored users: DynamicD2026!reset

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password
  ON public.profiles(must_change_password)
  WHERE must_change_password = true;

-- Fix known typo if the restored auth row has gmil.com instead of gmail.com.
UPDATE auth.users
SET email = 'dynamicdraw2020@gmail.com',
    updated_at = now()
WHERE email = 'dynamicdraw2020@gmil.com'
  AND NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'dynamicdraw2020@gmail.com');

UPDATE public.profiles
SET email = 'dynamicdraw2020@gmail.com',
    updated_at = now()
WHERE email = 'dynamicdraw2020@gmil.com'
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'dynamicdraw2020@gmail.com');

-- Set temporary password for every non-deleted restored Auth user.
UPDATE auth.users AS u
SET encrypted_password = extensions.crypt('DynamicD2026!reset', extensions.gen_salt('bf')),
    email_confirmed_at = COALESCE(u.email_confirmed_at, now()),
    updated_at = now(),
    raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb)
FROM public.profiles AS p
WHERE p.id = u.id
  AND COALESCE(p.status, '') <> 'DELETED';

-- Mark users so the new login screen shows the temporary password notice.
UPDATE public.profiles AS p
SET must_change_password = true,
    password_reset_at = now(),
    password_changed_at = NULL,
    updated_at = now()
WHERE COALESCE(p.status, '') <> 'DELETED'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

SELECT
  COUNT(*) FILTER (WHERE p.must_change_password = true) AS profiles_marked_for_change,
  COUNT(*) FILTER (WHERE u.encrypted_password IS NOT NULL) AS auth_users_with_password,
  COUNT(*) FILTER (WHERE u.id IS NULL) AS profiles_missing_auth_user
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE COALESCE(p.status, '') <> 'DELETED';
