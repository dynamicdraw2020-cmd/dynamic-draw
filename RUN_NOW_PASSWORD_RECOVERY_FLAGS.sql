-- Dynamic D 비밀번호 복구 플래그 SQL
-- Supabase SQL Editor에서 한 번 실행하세요.
-- 목적:
-- 1) profiles에 비밀번호 변경 강제 플래그 추가
-- 2) 기존 승인 유저에게 임시 비밀번호 안내가 뜨도록 must_change_password = true 설정
-- 3) 로그인 후 /change-password에서 새 비밀번호로 바꾸면 false로 자동 해제됨

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NULL;

-- username이 비어 있는 계정은 email 앞부분으로 채움
UPDATE public.profiles
SET username = split_part(email, '@', 1)
WHERE (username IS NULL OR username = '')
  AND email IS NOT NULL
  AND position('@' in email) > 1;

-- 복구 대상 표시
-- DELETED가 아닌 계정 전체를 임시 비밀번호 안내 대상으로 표시한다.
UPDATE public.profiles
SET
  must_change_password = true,
  password_reset_at = now(),
  password_changed_at = NULL,
  updated_at = now()
WHERE COALESCE(status::text, '') <> 'DELETED';

SELECT
  COUNT(*) AS total_profiles,
  COUNT(*) FILTER (WHERE must_change_password = true) AS marked_for_password_change
FROM public.profiles;
