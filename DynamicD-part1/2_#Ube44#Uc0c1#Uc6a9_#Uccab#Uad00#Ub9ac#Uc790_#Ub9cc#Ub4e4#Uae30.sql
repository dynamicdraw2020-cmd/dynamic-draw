-- 1) 아래 YOUR_EMAIL_HERE를 본인이 가입할 때 사용한 이메일로 바꾸세요.
-- 2) Supabase > SQL Editor에서 전체 실행하세요.
DO $$
DECLARE
  v_email text := 'YOUR_EMAIL_HERE';
  v_id uuid;
BEGIN
  IF v_email = 'YOUR_EMAIL_HERE' THEN
    RAISE EXCEPTION 'YOUR_EMAIL_HERE를 실제 이메일로 먼저 바꿔 주세요.';
  END IF;

  SELECT id INTO v_id FROM public.profiles WHERE lower(email) = lower(v_email);
  IF v_id IS NULL THEN
    RAISE EXCEPTION '해당 이메일의 가입 신청이 없습니다. 홈페이지에서 먼저 회원가입 신청을 해 주세요.';
  END IF;

  UPDATE public.profiles
  SET role = 'SUPER_ADMIN',
      status = 'APPROVED',
      member_code = 'ADMIN-' || right(replace(v_id::text, '-', ''), 8),
      approved_by = v_id,
      approved_at = now(),
      rejection_reason = null
  WHERE id = v_id;

  PERFORM public.append_admin_log(v_id, 'FIRST_ADMIN_CREATED', 'profiles', v_id, jsonb_build_object('email', v_email), 'setup', 'Supabase SQL Editor');
  RAISE NOTICE '첫 관리자 생성 완료: %', v_email;
END $$;
