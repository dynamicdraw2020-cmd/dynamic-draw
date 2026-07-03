-- Dynamic D v1.8.6 emergency password reset recovery
-- 목적:
-- 1) profiles에 강제 비밀번호 변경 플래그 추가
-- 2) 복구 과정에서 비밀번호가 비어 있는 auth.users를 공통 임시 비밀번호로 세팅
-- 3) 로그인 후 /change-password에서 반드시 새 비밀번호로 바꾸게 함
--
-- 공통 임시 비밀번호: DynamicD2026!reset

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_reset_at timestamptz null,
  add column if not exists password_changed_at timestamptz null;

-- 관리자 이메일 오타 보정: gmil.com -> gmail.com
update auth.users
set email = 'dynamicdraw2020@gmail.com',
    updated_at = now()
where email = 'dynamicdraw2020@gmil.com';

update public.profiles
set email = 'dynamicdraw2020@gmail.com',
    username = coalesce(nullif(username, ''), 'dynamicdraw2020'),
    role = 'SUPER_ADMIN',
    status = 'APPROVED',
    updated_at = now()
where email = 'dynamicdraw2020@gmil.com'
   or id in (select id from auth.users where email = 'dynamicdraw2020@gmail.com');

-- auth.users 비밀번호를 공통 임시 비밀번호로 세팅한다.
-- DELETED가 아닌 profiles와 연결된 계정만 대상으로 한다.
do $$
declare
  v_crypto_schema text;
begin
  select n.nspname
    into v_crypto_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto'
  limit 1;

  if v_crypto_schema is null then
    raise exception 'pgcrypto extension is not installed.';
  end if;

  execute format($sql$
    update auth.users u
    set encrypted_password = %1$I.crypt($1, %1$I.gen_salt($2)),
        email_confirmed_at = coalesce(u.email_confirmed_at, now()),
        confirmed_at = coalesce(u.confirmed_at, now()),
        raw_app_meta_data = coalesce(u.raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
        updated_at = now()
    where exists (
      select 1
      from public.profiles p
      where p.id = u.id
        and coalesce(p.status::text, '') <> 'DELETED'
    )
  $sql$, v_crypto_schema)
  using 'DynamicD2026!reset', 'bf';
end $$;

-- 프로필 플래그: 로그인하면 반드시 비밀번호 변경 페이지로 보낸다.
update public.profiles p
set must_change_password = true,
    password_reset_at = now(),
    password_changed_at = null,
    updated_at = now()
where coalesce(p.status::text, '') <> 'DELETED'
  and exists (select 1 from auth.users u where u.id = p.id);

-- 확인용 결과
select
  count(*) filter (where must_change_password is true) as must_change_password_count,
  count(*) as total_non_deleted_profiles
from public.profiles
where coalesce(status::text, '') <> 'DELETED';
