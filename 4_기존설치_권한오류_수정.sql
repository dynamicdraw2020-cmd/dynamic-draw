-- Dynamic Draw v1.0.2 기존 설치 권한 보정 패치
-- 대상: 1_SUPABASE에_한번만_붙여넣기.sql을 이미 실행했지만
--       /setup-admin에서 "DB 설치 SQL이 아직 실행되지 않았습니다"가 나오는 프로젝트
-- 실행 위치: Supabase > SQL Editor > New query > 전체 붙여넣기 > Run
-- 이 파일은 여러 번 실행해도 안전합니다.

begin;

grant usage on schema public to service_role;
grant usage on schema extensions to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;

create or replace function public.dynamic_draw_install_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select jsonb_build_object(
    'ready', true,
    'schemaVersion', '1.0.2',
    'pgcryptoReady', exists (select 1 from pg_catalog.pg_extension where extname = 'pgcrypto'),
    'superAdminCount', (select count(*)::integer from public.profiles where role = 'SUPER_ADMIN'),
    'serviceRoleCanReadProfiles', has_table_privilege('service_role', 'public.profiles', 'SELECT'),
    'serviceRoleCanWriteProfiles',
      has_table_privilege('service_role', 'public.profiles', 'INSERT')
      and has_table_privilege('service_role', 'public.profiles', 'UPDATE')
      and has_table_privilege('service_role', 'public.profiles', 'DELETE')
  );
$$;

revoke execute on function public.dynamic_draw_install_status() from public, anon, authenticated;
grant execute on function public.dynamic_draw_install_status() to service_role;

-- 기존 앱이 사용하는 서버 전용 함수들의 실행 권한도 다시 보정합니다.
grant execute on function public.next_member_code() to service_role;
grant execute on function public.append_admin_log(uuid,text,text,uuid,jsonb,text,text) to service_role;
grant execute on function public.validate_draw_ready(uuid) to service_role;
grant execute on function public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text) to service_role;
grant execute on function public.execute_draw(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.reveal_result(uuid,uuid,boolean,text,text) to service_role;
grant execute on function public.reveal_due_results() to service_role;
grant execute on function public.exchange_items(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.void_result(uuid,uuid,text,text,text) to service_role;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
grant execute on function public.verify_admin_log_chain() to service_role;
grant execute on function public.verify_probability_history_chain() to service_role;
grant execute on function public.calculate_stats() to service_role;
grant execute on function public.get_admin_stats() to service_role;

notify pgrst, 'reload schema';
commit;

-- 아래 결과에서 ready=true, serviceRoleCanReadProfiles=true가 보이면 성공입니다.
select public.dynamic_draw_install_status() as dynamic_draw_status;
