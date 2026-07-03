-- Dynamic D v1.4.0 public redesign + whole-member raffle system
-- Safe to run more than once.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.raffle_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 100),
  description text,
  prize_name text not null check (char_length(prize_name) between 1 and 120),
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  is_public boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  winner_profile_id uuid references public.profiles(id) on delete set null,
  winner_member_code text,
  winner_display_name text,
  executed_by uuid references public.profiles(id) on delete set null,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raffle_events_public_idx on public.raffle_events(is_public, status, created_at desc);
create index if not exists raffle_events_status_idx on public.raffle_events(status, created_at desc);
DO $$ BEGIN
  create trigger raffle_events_set_updated_at before update on public.raffle_events for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
alter table public.raffle_events enable row level security;
drop policy if exists raffle_events_select_public on public.raffle_events;
create policy raffle_events_select_public on public.raffle_events for select to anon, authenticated using (is_public = true and status in ('ACTIVE','COMPLETED'));
grant select (id,title,description,prize_name,status,is_public,starts_at,ends_at,winner_member_code,winner_display_name,executed_at,created_at,updated_at) on public.raffle_events to anon, authenticated;
grant all privileges on public.raffle_events to service_role;

create or replace function public.execute_member_raffle(p_raffle_id uuid, p_admin_id uuid, p_ip text, p_user_agent text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raffle public.raffle_events%rowtype;
  v_winner public.profiles%rowtype;
  v_count integer;
  v_offset integer;
  v_executed_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_raffle_id::text, 0));
  select * into v_raffle from public.raffle_events where id = p_raffle_id for update;
  if not found then raise exception '전체 회원 추첨 이벤트를 찾을 수 없습니다.'; end if;
  if v_raffle.status <> 'ACTIVE' then raise exception '진행 중인 추첨 이벤트만 실행할 수 있습니다.'; end if;
  if v_raffle.winner_profile_id is not null then raise exception '이미 당첨자가 확정된 추첨 이벤트입니다.'; end if;
  select count(*) into v_count from public.profiles where status = 'APPROVED' and role = 'USER';
  if coalesce(v_count, 0) < 1 then raise exception '승인된 일반 회원이 없어 전체 추첨을 실행할 수 없습니다.'; end if;
  v_offset := floor(random() * v_count)::integer;
  select * into v_winner from public.profiles where status = 'APPROVED' and role = 'USER' order by created_at, id offset v_offset limit 1;
  if not found then raise exception '당첨 회원을 선택하지 못했습니다.'; end if;
  update public.raffle_events set status = 'COMPLETED', winner_profile_id = v_winner.id, winner_member_code = public.mask_public_member_code(v_winner.member_code), winner_display_name = public.mask_public_name(v_winner.display_name), executed_by = p_admin_id, executed_at = v_executed_at where id = p_raffle_id returning * into v_raffle;
  perform public.append_admin_log(p_admin_id, 'MEMBER_RAFFLE_EXECUTED', 'raffle_events', p_raffle_id, jsonb_build_object('title', v_raffle.title, 'prizeName', v_raffle.prize_name, 'winnerProfileId', v_winner.id, 'participantCount', v_count), p_ip, p_user_agent);
  return jsonb_build_object('raffleId', v_raffle.id, 'title', v_raffle.title, 'prizeName', v_raffle.prize_name, 'winnerName', v_raffle.winner_display_name, 'memberCode', v_raffle.winner_member_code, 'participantCount', v_count, 'executedAt', v_raffle.executed_at);
end;
$$;
revoke execute on function public.execute_member_raffle(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.execute_member_raffle(uuid,uuid,text,text) to service_role;

insert into public.site_settings(key, value, is_public) values
  ('site_name', '"Dynamic D"'::jsonb, true),
  ('hero_title', '"Dynamic D - 이벤트 전용 사이트"'::jsonb, true),
  ('hero_description', '"Dynamic에서 주관하는 모든 뽑기(추첨)형 이벤트를 주관하는 사이트. Dynamic D - 누구보다 빠른 본방 입성을 향한 길."'::jsonb, true)
on conflict(key) do update set value = excluded.value, is_public = true, updated_at = now();

insert into public.notices(title, body, is_pinned, is_public)
select 'Dynamic D 공식 채널 안내', '공식 디스코드: https://discord.gg/Q2j3uZADft
공식 오픈채팅: https://open.kakao.com/o/s8p7BvBi
공식 1:1 문의: @sihoo._ (디스코드)', true, true
where not exists (select 1 from public.notices where title = 'Dynamic D 공식 채널 안내');

insert into public.events(title, slug, summary, body, status, is_public, sort_order)
select 'Dynamic D 이벤트 안내', 'dynamic-d-event', 'Dynamic에서 주관하는 모든 뽑기(추첨)형 이벤트를 확인하는 공식 안내 페이지입니다.', 'Dynamic D - 누구보다 빠른 본방 입성을 향한 길.
추첨권, 전체 회원 추첨, 교환 이벤트 안내를 이곳에서 확인할 수 있습니다.', 'ACTIVE', true, 5
where not exists (select 1 from public.events where slug = 'dynamic-d-event');


insert into public.raffle_events(title, description, prize_name, status, is_public)
select '전체 회원 본방 입장 추첨', '승인된 일반 회원 전체를 대상으로 진행하는 공개 추첨 이벤트입니다.', '본방 입장 우선권', 'ACTIVE', true
where not exists (select 1 from public.raffle_events where title = '전체 회원 본방 입장 추첨');

select exists(select 1 from public.raffle_events) as raffle_events_ready, exists(select 1 from pg_proc where proname = 'execute_member_raffle') as raffle_function_ready, exists(select 1 from public.site_settings where key = 'site_name' and value = '"Dynamic D"'::jsonb) as dynamic_d_settings_ready;
