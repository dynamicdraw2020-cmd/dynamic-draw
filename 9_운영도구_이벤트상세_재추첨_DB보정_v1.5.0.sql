-- Dynamic Draw / Dynamic D v1.5.0
-- Event details, raffle re-run policy support, and schema version marker.

create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create table if not exists public.raffle_redraw_logs (
    id uuid primary key default gen_random_uuid(),
    raffle_id uuid not null references public.raffle_events(id) on delete cascade,
    previous_winner_profile_id uuid references public.profiles(id) on delete set null,
    previous_winner_member_code text,
    previous_winner_display_name text,
    new_winner_profile_id uuid references public.profiles(id) on delete set null,
    new_winner_member_code text,
    new_winner_display_name text,
    reason text not null check (char_length(reason) between 2 and 300),
    executed_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
  );
exception when undefined_table then
  raise notice 'raffle_events table is not ready. Run v1.4.0 SQL first.';
end $$;

create index if not exists raffle_redraw_logs_raffle_idx on public.raffle_redraw_logs(raffle_id, created_at desc);
alter table public.raffle_redraw_logs enable row level security;
revoke all on public.raffle_redraw_logs from anon, authenticated;
grant all privileges on table public.raffle_redraw_logs to service_role;

do $$ begin
  create policy raffle_redraw_logs_no_public_access on public.raffle_redraw_logs for select to authenticated using (false);
exception when duplicate_object then null; end $$;

create or replace function public.rerun_member_raffle(
  p_raffle_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_ip text default 'unknown',
  p_user_agent text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raffle public.raffle_events%rowtype;
  v_winner public.profiles%rowtype;
  v_admin public.profiles%rowtype;
  v_count integer;
  v_offset integer;
  v_executed_at timestamptz := clock_timestamp();
  v_previous_id uuid;
  v_previous_code text;
  v_previous_name text;
begin
  if char_length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception '재추첨 사유를 2자 이상 입력해 주세요.';
  end if;

  select * into v_admin from public.profiles where id = p_admin_id;
  if not found or v_admin.role <> 'SUPER_ADMIN' or v_admin.status <> 'APPROVED' then
    raise exception '재추첨은 승인된 최고 관리자만 실행할 수 있습니다.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_raffle_id::text, 1));
  select * into v_raffle from public.raffle_events where id = p_raffle_id for update;
  if not found then raise exception '전체 회원 추첨 이벤트를 찾을 수 없습니다.'; end if;
  if v_raffle.winner_profile_id is null then raise exception '기존 당첨자가 없는 추첨은 재추첨할 수 없습니다.'; end if;

  v_previous_id := v_raffle.winner_profile_id;
  v_previous_code := v_raffle.winner_member_code;
  v_previous_name := v_raffle.winner_display_name;

  select count(*) into v_count
  from public.profiles
  where status = 'APPROVED' and role = 'USER' and id <> v_previous_id;
  if coalesce(v_count, 0) < 1 then raise exception '재추첨 가능한 승인 회원이 없습니다.'; end if;

  v_offset := floor(random() * v_count)::integer;
  select * into v_winner
  from public.profiles
  where status = 'APPROVED' and role = 'USER' and id <> v_previous_id
  order by created_at, id
  offset v_offset limit 1;
  if not found then raise exception '새 당첨 회원을 선택하지 못했습니다.'; end if;

  update public.raffle_events
  set status = 'COMPLETED',
      winner_profile_id = v_winner.id,
      winner_member_code = public.mask_public_member_code(v_winner.member_code),
      winner_display_name = public.mask_public_name(v_winner.display_name),
      executed_by = p_admin_id,
      executed_at = v_executed_at,
      updated_at = now()
  where id = p_raffle_id
  returning * into v_raffle;

  insert into public.raffle_redraw_logs(raffle_id, previous_winner_profile_id, previous_winner_member_code, previous_winner_display_name, new_winner_profile_id, new_winner_member_code, new_winner_display_name, reason, executed_by)
  values(p_raffle_id, v_previous_id, v_previous_code, v_previous_name, v_winner.id, v_raffle.winner_member_code, v_raffle.winner_display_name, trim(p_reason), p_admin_id);

  perform public.append_admin_log(
    p_admin_id,
    'MEMBER_RAFFLE_RERUN',
    'raffle_events',
    p_raffle_id,
    jsonb_build_object('reason', trim(p_reason), 'previousWinnerProfileId', v_previous_id, 'newWinnerProfileId', v_winner.id, 'title', v_raffle.title, 'participantCount', v_count + 1),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object('raffleId', v_raffle.id, 'title', v_raffle.title, 'prizeName', v_raffle.prize_name, 'winnerName', v_raffle.winner_display_name, 'memberCode', v_raffle.winner_member_code, 'participantCount', v_count + 1, 'executedAt', v_raffle.executed_at, 'rerun', true);
end;
$$;

revoke execute on function public.rerun_member_raffle(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.rerun_member_raffle(uuid,uuid,text,text,text) to service_role;

insert into public.site_settings(key, value, is_public)
values ('dynamic_draw_schema_version', '"v1.5.0"'::jsonb, false)
on conflict(key) do update set value = excluded.value, updated_at = now();

select
  exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'raffle_redraw_logs') as redraw_logs_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rerun_member_raffle') as rerun_function_ready,
  exists(select 1 from public.site_settings where key = 'dynamic_draw_schema_version' and value = '"v1.5.0"'::jsonb) as v150_marker_ready;
