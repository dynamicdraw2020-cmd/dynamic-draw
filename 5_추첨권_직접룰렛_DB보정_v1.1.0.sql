-- Dynamic Draw v1.1.0
-- 추첨권 지급 + 회원 직접 룰렛 뽑기 DB 보정 SQL
-- 기존 회원, 결과, 상품 데이터는 삭제하지 않습니다.

create extension if not exists pgcrypto with schema extensions;

DO $$ BEGIN
  alter function public.append_admin_log(uuid,text,text,uuid,jsonb,text,text) set search_path = public, extensions;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  alter function public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text) set search_path = public, extensions;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  alter function public.execute_draw(uuid,uuid,uuid,uuid,text,text) set search_path = public, extensions;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  alter function public.verify_admin_log_chain() set search_path = public, extensions;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  alter function public.verify_probability_history_chain() set search_path = public, extensions;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

create table if not exists public.draw_tickets (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draw_id uuid not null references public.draws(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id, draw_id)
);

create index if not exists draw_tickets_profile_qty_idx on public.draw_tickets(profile_id, quantity desc);
create index if not exists draw_tickets_draw_qty_idx on public.draw_tickets(draw_id, quantity desc);

alter table public.draw_tickets enable row level security;

DO $$ BEGIN
  create trigger draw_tickets_set_updated_at before update on public.draw_tickets for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create policy draw_tickets_select_self on public.draw_tickets for select to authenticated using (profile_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

revoke all on public.draw_tickets from anon, authenticated;
grant select on public.draw_tickets to authenticated;
grant all privileges on table public.draw_tickets to service_role;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

create or replace function public.admin_grant_draw_tickets(
  p_draw_id uuid,
  p_profile_id uuid,
  p_quantity integer,
  p_admin_id uuid,
  p_memo text default '',
  p_ip text default 'unknown',
  p_user_agent text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_draw public.draws%rowtype;
  v_profile public.profiles%rowtype;
  v_ticket public.draw_tickets%rowtype;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception '추첨권은 1장 이상 1000장 이하로 지급할 수 있습니다.';
  end if;

  select * into v_draw from public.draws where id = p_draw_id;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status = 'ENDED' then raise exception '종료된 뽑기에는 추첨권을 지급할 수 없습니다.'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception '회원을 찾을 수 없습니다.'; end if;
  if v_profile.status <> 'APPROVED' or v_profile.role <> 'USER' then
    raise exception '승인된 일반 회원에게만 추첨권을 지급할 수 있습니다.';
  end if;

  insert into public.draw_tickets(profile_id, draw_id, quantity)
  values(p_profile_id, p_draw_id, p_quantity)
  on conflict(profile_id, draw_id) do update
  set quantity = public.draw_tickets.quantity + excluded.quantity,
      updated_at = now()
  returning * into v_ticket;

  perform public.append_admin_log(
    p_admin_id,
    'DRAW_TICKETS_GRANTED',
    'draw_tickets',
    p_profile_id,
    jsonb_build_object(
      'drawId', p_draw_id,
      'drawName', v_draw.name,
      'profileId', p_profile_id,
      'profileName', v_profile.display_name,
      'quantityAdded', p_quantity,
      'quantityAfter', v_ticket.quantity,
      'memo', coalesce(p_memo, '')
    ),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object(
    'profileId', p_profile_id,
    'drawId', p_draw_id,
    'quantity', v_ticket.quantity,
    'quantityAdded', p_quantity,
    'drawName', v_draw.name,
    'profileName', v_profile.display_name
  );
end;
$$;

create or replace function public.user_execute_draw_with_ticket(
  p_draw_id uuid,
  p_profile_id uuid,
  p_idempotency_key uuid,
  p_ip text default 'unknown',
  p_user_agent text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_draw public.draws%rowtype;
  v_participant public.profiles%rowtype;
  v_reward public.rewards%rowtype;
  v_result public.results%rowtype;
  v_existing public.results%rowtype;
  v_ticket_quantity integer;
  v_remaining integer;
  v_bytes bytea;
  v_raw bigint;
  v_roll integer;
  v_snapshot jsonb;
begin
  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.draw_id <> p_draw_id or v_existing.participant_id <> p_profile_id then
      raise exception '이미 다른 뽑기 요청에 사용된 중복 방지 키입니다.';
    end if;
    select coalesce(quantity, 0) into v_remaining from public.draw_tickets where profile_id = p_profile_id and draw_id = p_draw_id;
    select * into v_draw from public.draws where id = v_existing.draw_id;
    return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_existing.reveal_at, 'remainingTickets', coalesce(v_remaining,0), 'duplicate', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_draw_id::text, 0));

  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.draw_id <> p_draw_id or v_existing.participant_id <> p_profile_id then
      raise exception '이미 다른 뽑기 요청에 사용된 중복 방지 키입니다.';
    end if;
    select coalesce(quantity, 0) into v_remaining from public.draw_tickets where profile_id = p_profile_id and draw_id = p_draw_id;
    select * into v_draw from public.draws where id = v_existing.draw_id;
    return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_existing.reveal_at, 'remainingTickets', coalesce(v_remaining,0), 'duplicate', true);
  end if;

  select quantity into v_ticket_quantity
  from public.draw_tickets
  where profile_id = p_profile_id and draw_id = p_draw_id
  for update;
  if coalesce(v_ticket_quantity, 0) < 1 then
    raise exception '사용 가능한 추첨권이 없습니다.';
  end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status <> 'ACTIVE' then raise exception '현재 진행 중인 뽑기가 아닙니다.'; end if;

  select * into v_participant from public.profiles where id = p_profile_id for update;
  if not found or v_participant.status <> 'APPROVED' or v_participant.role <> 'USER' then
    raise exception '승인된 일반 회원만 직접 뽑기를 실행할 수 있습니다.';
  end if;
  if v_participant.member_code is null then raise exception '회원 고유 ID가 발급되지 않았습니다.'; end if;

  perform public.validate_draw_ready(p_draw_id);

  update public.draw_tickets
  set quantity = quantity - 1, updated_at = now()
  where profile_id = p_profile_id and draw_id = p_draw_id and quantity > 0
  returning quantity into v_remaining;
  if not found then raise exception '추첨권 차감에 실패했습니다.'; end if;

  loop
    v_bytes := gen_random_bytes(4);
    v_raw := get_byte(v_bytes,0)::bigint * 16777216 + get_byte(v_bytes,1)::bigint * 65536 + get_byte(v_bytes,2)::bigint * 256 + get_byte(v_bytes,3)::bigint;
    exit when v_raw < 4294000000;
  end loop;
  v_roll := mod(v_raw, 1000000)::integer;

  select r.* into v_reward
  from public.rewards r
  join (
    select id, probability_units,
           sum(probability_units) over(order by sort_order, id) as cumulative,
           sort_order
    from public.rewards
    where draw_id = p_draw_id and is_active = true
  ) w on w.id = r.id
  where w.probability_units > 0
    and v_roll < w.cumulative
  order by w.cumulative, w.sort_order, w.id
  limit 1;
  if not found then raise exception '확률 계산 결과를 찾지 못했습니다.'; end if;

  select jsonb_agg(jsonb_build_object('rewardId', id, 'name', name, 'probabilityUnits', probability_units) order by sort_order, id)
  into v_snapshot from public.rewards where draw_id = p_draw_id and is_active = true;

  insert into public.results(draw_id, reward_id, participant_id, executed_by, idempotency_key, random_value, probability_snapshot, public_display_name, public_member_code, reveal_at)
  values(p_draw_id, v_reward.id, p_profile_id, p_profile_id, p_idempotency_key, v_roll, v_snapshot, v_participant.display_name, v_participant.member_code, now() + make_interval(secs => v_draw.animation_ms / 1000.0))
  returning * into v_result;

  if v_reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = v_reward.id and stock > 0;
    if not found then raise exception '선택된 상품의 재고가 부족합니다.'; end if;
  end if;

  insert into public.live_events(draw_id, result_id, event_type, payload)
  values
    (p_draw_id, v_result.id, 'DRAW_START', jsonb_build_object('mode', 'SELF', 'drawId', p_draw_id, 'resultId', v_result.id, 'drawName', v_draw.name, 'animationMs', v_draw.animation_ms, 'startedAt', v_result.created_at)),
    (p_draw_id, v_result.id, 'DRAW_ANIMATING', jsonb_build_object('mode', 'SELF', 'drawId', p_draw_id, 'resultId', v_result.id, 'animationMs', v_draw.animation_ms, 'revealAt', v_result.reveal_at));

  perform public.append_admin_log(
    p_profile_id,
    'USER_SELF_DRAW_EXECUTED',
    'results',
    v_result.id,
    jsonb_build_object('drawId', p_draw_id, 'ticketConsumed', true, 'remainingTickets', v_remaining),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object('resultId', v_result.id, 'drawId', p_draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_result.reveal_at, 'remainingTickets', v_remaining, 'duplicate', false);
end;
$$;

grant execute on function public.admin_grant_draw_tickets(uuid,uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.user_execute_draw_with_ticket(uuid,uuid,uuid,text,text) to service_role;

insert into public.site_settings(key, value, is_public)
values ('dynamic_draw_schema_version', '"v1.1.0"'::jsonb, false)
on conflict(key) do update set value = excluded.value, updated_at = now();

select
  exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'draw_tickets') as tickets_table_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_grant_draw_tickets') as grant_function_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'user_execute_draw_with_ticket') as self_draw_function_ready;
