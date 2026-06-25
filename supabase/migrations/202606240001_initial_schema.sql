-- Dynamic Draw production schema
-- Supabase PostgreSQL / 2026-06-24

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

DO $$ BEGIN
  create type public.profile_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.user_role as enum ('USER', 'VIEWER', 'MANAGER', 'SUPER_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.draw_status as enum ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.live_event_type as enum ('DRAW_START', 'DRAW_ANIMATING', 'DRAW_RESULT', 'STATS_UPDATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 2 and 30),
  phone text,
  role public.user_role not null default 'USER',
  status public.profile_status not null default 'PENDING',
  member_code text unique,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_uidx on public.profiles (lower(email));
create index if not exists profiles_status_idx on public.profiles(status, created_at desc);
create index if not exists profiles_member_code_idx on public.profiles(member_code) where member_code is not null;


create sequence if not exists public.member_code_seq start with 1001 increment by 1;

create or replace function public.next_member_code()
returns text
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_code text;
begin
  loop
    v_code := 'DD-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.member_code_seq')::text, 6, '0');
    exit when not exists(select 1 from public.profiles where member_code = v_code);
  end loop;
  return v_code;
end;
$$;

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  description text,
  status public.draw_status not null default 'DRAFT',
  animation_ms integer not null default 4000 check (animation_ms between 3000 and 5000),
  is_public boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists draws_public_status_idx on public.draws(is_public, status, created_at desc);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  image_url text,
  color text not null default '#38bdf8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  probability_units integer not null default 0 check (probability_units between 0 and 1000000),
  stock integer check (stock is null or stock >= 0),
  is_inventory_item boolean not null default true,
  is_exchange_material boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draw_id, name)
);
create index if not exists rewards_draw_active_idx on public.rewards(draw_id, is_active, sort_order);

create table if not exists public.participant_items (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id, reward_id)
);
create index if not exists participant_items_profile_qty_idx on public.participant_items(profile_id, quantity desc);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete restrict,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  participant_id uuid not null references public.profiles(id) on delete restrict,
  executed_by uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  random_value integer not null check (random_value between 0 and 999999),
  probability_snapshot jsonb not null,
  public_display_name text not null,
  public_member_code text not null,
  reveal_at timestamptz not null,
  revealed_at timestamptz,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  check (voided_at is null or void_reason is not null)
);
create index if not exists results_public_feed_idx on public.results(revealed_at desc) where revealed_at is not null and voided_at is null;
create index if not exists results_participant_idx on public.results(participant_id, created_at desc);
create index if not exists results_draw_created_idx on public.results(draw_id, created_at desc);
create index if not exists results_reveal_due_idx on public.results(reveal_at) where revealed_at is null and voided_at is null;

create table if not exists public.exchange_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  source_reward_id uuid not null references public.rewards(id) on delete restrict,
  source_quantity integer not null check (source_quantity > 0),
  target_reward_id uuid not null references public.rewards(id) on delete restrict,
  target_quantity integer not null default 1 check (target_quantity > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_reward_id <> target_reward_id)
);
create index if not exists exchange_rules_active_idx on public.exchange_rules(is_active, sort_order);

create table if not exists public.exchange_logs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.exchange_rules(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  source_reward_id uuid not null references public.rewards(id) on delete restrict,
  source_quantity integer not null,
  target_reward_id uuid not null references public.rewards(id) on delete restrict,
  target_quantity integer not null,
  idempotency_key uuid not null unique,
  ip_address text not null default 'unknown',
  user_agent text not null default 'unknown',
  created_at timestamptz not null default now()
);
create index if not exists exchange_logs_profile_idx on public.exchange_logs(profile_id, created_at desc);

create table if not exists public.probability_history (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  draw_id uuid not null references public.draws(id) on delete restrict,
  admin_id uuid not null references public.profiles(id) on delete restrict,
  before_values jsonb not null,
  after_values jsonb not null,
  reason text not null check (char_length(reason) between 2 and 200),
  ip_address text not null default 'unknown',
  user_agent text not null default 'unknown',
  previous_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists probability_history_draw_idx on public.probability_history(draw_id, created_at desc);
create index if not exists probability_history_admin_idx on public.probability_history(admin_id, created_at desc);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity unique,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip_address text not null default 'unknown',
  user_agent text not null default 'unknown',
  previous_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_logs_admin_idx on public.admin_logs(admin_id, created_at desc);
create index if not exists admin_logs_action_idx on public.admin_logs(action, created_at desc);

create table if not exists public.live_events (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  result_id uuid references public.results(id) on delete cascade,
  event_type public.live_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists live_events_created_idx on public.live_events(created_at desc);
create index if not exists live_events_draw_idx on public.live_events(draw_id, created_at desc);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DO $$ BEGIN
  create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger draws_set_updated_at before update on public.draws for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger rewards_set_updated_at before update on public.rewards for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger items_set_updated_at before update on public.participant_items for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger exchange_rules_set_updated_at before update on public.exchange_rules for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
begin
  insert into public.profiles(id, email, display_name, phone)
  values (
    new.id,
    lower(coalesce(new.email, 'unknown-' || new.id::text || '@invalid.local')),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), '회원'), 30),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

DO $$ BEGIN
  create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create or replace function public.block_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '감사 기록은 수정하거나 삭제할 수 없습니다.' using errcode = '42501';
end;
$$;

DO $$ BEGIN
  create trigger probability_history_immutable before update or delete on public.probability_history for each row execute function public.block_audit_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  create trigger admin_logs_immutable before update or delete on public.admin_logs for each row execute function public.block_audit_mutation();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create or replace function public.mask_public_name(p_name text)
returns text language sql immutable as $$
  select case
    when p_name is null or char_length(p_name) = 0 then '참가자'
    when char_length(p_name) = 1 then p_name || '*'
    else left(p_name, 1) || repeat('*', least(char_length(p_name) - 1, 3))
  end;
$$;

create or replace function public.mask_public_member_code(p_code text)
returns text language sql immutable as $$
  select case when p_code is null then 'DD-****' else 'DD-****-' || right(p_code, 4) end;
$$;

create or replace function public.append_admin_log(
  p_admin_id uuid,
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_details jsonb,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_previous_hash text;
  v_entry_hash text;
  v_id uuid := gen_random_uuid();
  v_created_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('dynamic_draw_admin_log_chain'));
  select entry_hash into v_previous_hash from public.admin_logs order by sequence_no desc limit 1;
  v_entry_hash := encode(digest(
    coalesce(v_previous_hash, '') || '|' || v_id::text || '|' || coalesce(p_admin_id::text, '') || '|' ||
    p_action || '|' || coalesce(p_target_table, '') || '|' || coalesce(p_target_id::text, '') || '|' ||
    coalesce(p_details, '{}'::jsonb)::text || '|' || coalesce(p_ip, 'unknown') || '|' ||
    coalesce(p_user_agent, 'unknown') || '|' || to_char(v_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'
  ), 'hex');
  insert into public.admin_logs(id, admin_id, action, target_table, target_id, details, ip_address, user_agent, previous_hash, entry_hash, created_at)
  values(v_id, p_admin_id, p_action, p_target_table, p_target_id, coalesce(p_details, '{}'::jsonb), coalesce(p_ip, 'unknown'), coalesce(p_user_agent, 'unknown'), v_previous_hash, v_entry_hash, v_created_at);
  return v_id;
end;
$$;

create or replace function public.validate_draw_ready(p_draw_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_count integer;
  v_sum bigint;
  v_out_of_stock integer;
begin
  select count(*), coalesce(sum(probability_units), 0), count(*) filter (where probability_units > 0 and stock = 0)
    into v_count, v_sum, v_out_of_stock
  from public.rewards
  where draw_id = p_draw_id and is_active = true;
  if v_count = 0 then raise exception '활성 상품이 없습니다.'; end if;
  if v_sum <> 1000000 then raise exception '활성 상품의 확률 합계가 100%%가 아닙니다. 현재 %%%', v_sum / 10000.0; end if;
  if v_out_of_stock > 0 then raise exception '확률이 설정된 상품 중 재고가 0인 상품이 있습니다.'; end if;
  return true;
end;
$$;

create or replace function public.admin_update_probabilities(
  p_draw_id uuid,
  p_probabilities jsonb,
  p_reason text,
  p_admin_id uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_active_count integer;
  v_input_count integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_total bigint;
  v_before jsonb;
  v_after jsonb;
  v_previous_hash text;
  v_entry_hash text;
  v_history_id uuid := gen_random_uuid();
  v_created_at timestamptz := clock_timestamp();
begin
  if char_length(trim(p_reason)) < 2 then raise exception '변경 사유를 입력해 주세요.'; end if;
  perform 1 from public.draws where id = p_draw_id for update;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  perform 1 from public.rewards where draw_id = p_draw_id and is_active = true for update;

  select count(*) into v_active_count from public.rewards where draw_id = p_draw_id and is_active = true;
  select jsonb_array_length(p_probabilities) into v_input_count;
  select count(distinct (item ->> 'reward_id')) into v_distinct_count from jsonb_array_elements(p_probabilities) item;
  select count(*) into v_valid_count
    from jsonb_array_elements(p_probabilities) item
    join public.rewards r on r.id = (item ->> 'reward_id')::uuid
    where r.draw_id = p_draw_id and r.is_active = true;
  select coalesce(sum((item ->> 'probability_units')::bigint), 0) into v_total from jsonb_array_elements(p_probabilities) item;

  if v_input_count <> v_active_count or v_distinct_count <> v_active_count or v_valid_count <> v_active_count then
    raise exception '모든 활성 상품의 확률을 한 번씩 입력해야 합니다.';
  end if;
  if v_total <> 1000000 then raise exception '확률 합계는 정확히 100%%여야 합니다.'; end if;
  if exists(select 1 from jsonb_array_elements(p_probabilities) item where (item ->> 'probability_units')::integer < 0 or (item ->> 'probability_units')::integer > 1000000) then
    raise exception '상품별 확률은 0%% 이상 100%% 이하여야 합니다.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('rewardId', id, 'name', name, 'probabilityUnits', probability_units) order by sort_order, id), '[]'::jsonb)
  into v_before from public.rewards where draw_id = p_draw_id and is_active = true;

  update public.rewards r
  set probability_units = x.probability_units
  from jsonb_to_recordset(p_probabilities) as x(reward_id uuid, probability_units integer)
  where r.id = x.reward_id and r.draw_id = p_draw_id and r.is_active = true;

  select coalesce(jsonb_agg(jsonb_build_object('rewardId', id, 'name', name, 'probabilityUnits', probability_units) order by sort_order, id), '[]'::jsonb)
  into v_after from public.rewards where draw_id = p_draw_id and is_active = true;

  perform pg_advisory_xact_lock(hashtext('dynamic_draw_probability_history_chain'));
  select entry_hash into v_previous_hash from public.probability_history order by sequence_no desc limit 1;
  v_entry_hash := encode(digest(
    coalesce(v_previous_hash, '') || '|' || v_history_id::text || '|' || p_draw_id::text || '|' || p_admin_id::text || '|' ||
    v_before::text || '|' || v_after::text || '|' || trim(p_reason) || '|' || coalesce(p_ip,'unknown') || '|' ||
    coalesce(p_user_agent,'unknown') || '|' || to_char(v_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'
  ), 'hex');
  insert into public.probability_history(id, draw_id, admin_id, before_values, after_values, reason, ip_address, user_agent, previous_hash, entry_hash, created_at)
  values(v_history_id, p_draw_id, p_admin_id, v_before, v_after, trim(p_reason), coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown'), v_previous_hash, v_entry_hash, v_created_at);

  perform public.append_admin_log(p_admin_id, 'PROBABILITY_UPDATED', 'draws', p_draw_id, jsonb_build_object('reason', trim(p_reason), 'before', v_before, 'after', v_after), p_ip, p_user_agent);
  return jsonb_build_object('drawId', p_draw_id, 'totalUnits', v_total, 'historyId', v_history_id);
end;
$$;

create or replace function public.execute_draw(
  p_draw_id uuid,
  p_participant_id uuid,
  p_admin_id uuid,
  p_idempotency_key uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_draw public.draws%rowtype;
  v_participant public.profiles%rowtype;
  v_reward public.rewards%rowtype;
  v_result public.results%rowtype;
  v_existing public.results%rowtype;
  v_bytes bytea;
  v_raw bigint;
  v_roll integer;
  v_snapshot jsonb;
begin
  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.draw_id <> p_draw_id or v_existing.participant_id <> p_participant_id then
      raise exception '이미 다른 추첨 요청에 사용된 중복 방지 키입니다.';
    end if;
    select * into v_draw from public.draws where id = v_existing.draw_id;
    return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_existing.reveal_at, 'duplicate', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_draw_id::text, 0));
  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.draw_id <> p_draw_id or v_existing.participant_id <> p_participant_id then
      raise exception '이미 다른 추첨 요청에 사용된 중복 방지 키입니다.';
    end if;
    select * into v_draw from public.draws where id = v_existing.draw_id;
    return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_existing.reveal_at, 'duplicate', true);
  end if;

  select * into v_draw from public.draws where id = p_draw_id for update;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status <> 'ACTIVE' then raise exception '현재 진행 중인 뽑기가 아닙니다.'; end if;
  if exists(select 1 from public.results where draw_id = p_draw_id and revealed_at is null and voided_at is null) then
    raise exception '이 뽑기의 이전 카드 연출이 아직 진행 중입니다. 결과 공개 후 다시 시도해 주세요.';
  end if;

  select * into v_participant from public.profiles where id = p_participant_id for update;
  if not found or v_participant.status <> 'APPROVED' or v_participant.role <> 'USER' then raise exception '승인된 일반 회원만 참가할 수 있습니다.'; end if;
  if v_participant.member_code is null then raise exception '회원 고유 ID가 발급되지 않았습니다.'; end if;

  perform public.validate_draw_ready(p_draw_id);

  loop
    v_bytes := gen_random_bytes(4);
    v_raw := get_byte(v_bytes,0)::bigint * 16777216 + get_byte(v_bytes,1)::bigint * 65536 + get_byte(v_bytes,2)::bigint * 256 + get_byte(v_bytes,3)::bigint;
    exit when v_raw < 4294000000; -- rejection sampling: modulo bias 제거
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
  values(p_draw_id, v_reward.id, p_participant_id, p_admin_id, p_idempotency_key, v_roll, v_snapshot, v_participant.display_name, v_participant.member_code, now() + make_interval(secs => v_draw.animation_ms / 1000.0))
  returning * into v_result;

  if v_reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = v_reward.id and stock > 0;
    if not found then raise exception '선택된 상품의 재고가 부족합니다.'; end if;
  end if;

  insert into public.live_events(draw_id, result_id, event_type, payload)
  values
    (p_draw_id, v_result.id, 'DRAW_START', jsonb_build_object('drawId', p_draw_id, 'resultId', v_result.id, 'drawName', v_draw.name, 'animationMs', v_draw.animation_ms, 'startedAt', v_result.created_at)),
    (p_draw_id, v_result.id, 'DRAW_ANIMATING', jsonb_build_object('drawId', p_draw_id, 'resultId', v_result.id, 'animationMs', v_draw.animation_ms, 'revealAt', v_result.reveal_at));

  perform public.append_admin_log(p_admin_id, 'DRAW_EXECUTED', 'results', v_result.id, jsonb_build_object('drawId', p_draw_id, 'participantId', p_participant_id, 'resultCommitted', true), p_ip, p_user_agent);
  return jsonb_build_object('resultId', v_result.id, 'drawId', p_draw_id, 'animationMs', v_draw.animation_ms, 'revealAt', v_result.reveal_at, 'duplicate', false);
end;
$$;

create or replace function public.reveal_result(
  p_result_id uuid,
  p_admin_id uuid default null,
  p_force boolean default false,
  p_ip text default 'system',
  p_user_agent text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result public.results%rowtype;
  v_reward public.rewards%rowtype;
  v_draw public.draws%rowtype;
  v_payload jsonb;
begin
  select * into v_result from public.results where id = p_result_id for update;
  if not found then raise exception '추첨 결과를 찾을 수 없습니다.'; end if;
  if v_result.voided_at is not null then raise exception '무효 처리된 결과입니다.'; end if;
  if v_result.revealed_at is null and not p_force and now() < v_result.reveal_at then raise exception '아직 결과 공개 시간이 되지 않았습니다.'; end if;
  select * into v_reward from public.rewards where id = v_result.reward_id;
  select * into v_draw from public.draws where id = v_result.draw_id;

  if v_result.revealed_at is null then
    update public.results set revealed_at = now() where id = p_result_id returning * into v_result;
    if v_reward.is_inventory_item then
      insert into public.participant_items(profile_id, reward_id, quantity)
      values(v_result.participant_id, v_reward.id, 1)
      on conflict(profile_id, reward_id) do update
      set quantity = public.participant_items.quantity + 1, updated_at = now();
    end if;
    v_payload := jsonb_build_object(
      'resultId', v_result.id,
      'drawName', v_draw.name,
      'rewardName', v_reward.name,
      'rewardColor', v_reward.color,
      'participantName', public.mask_public_name(v_result.public_display_name),
      'memberCode', public.mask_public_member_code(v_result.public_member_code),
      'revealedAt', v_result.revealed_at
    );
    insert into public.live_events(draw_id, result_id, event_type, payload) values(v_result.draw_id, v_result.id, 'DRAW_RESULT', v_payload);
    insert into public.live_events(draw_id, result_id, event_type, payload) values(v_result.draw_id, v_result.id, 'STATS_UPDATE', jsonb_build_object('resultId', v_result.id));
    if p_admin_id is not null then
      perform public.append_admin_log(p_admin_id, 'RESULT_REVEALED', 'results', v_result.id, jsonb_build_object('rewardId', v_reward.id), p_ip, p_user_agent);
    end if;
  else
    v_payload := jsonb_build_object('resultId', v_result.id, 'drawName', v_draw.name, 'rewardName', v_reward.name, 'rewardColor', v_reward.color, 'participantName', public.mask_public_name(v_result.public_display_name), 'memberCode', public.mask_public_member_code(v_result.public_member_code), 'revealedAt', v_result.revealed_at);
  end if;
  return v_payload;
end;
$$;

create or replace function public.reveal_due_results()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in select id from public.results where revealed_at is null and voided_at is null and reveal_at <= now() order by reveal_at limit 25
  loop
    perform public.reveal_result(v_row.id, null, false, 'system', 'automatic recovery');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.exchange_items(
  p_profile_id uuid,
  p_rule_id uuid,
  p_idempotency_key uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_rule public.exchange_rules%rowtype;
  v_profile public.profiles%rowtype;
  v_source public.rewards%rowtype;
  v_target public.rewards%rowtype;
  v_owned integer;
  v_log public.exchange_logs%rowtype;
begin
  select * into v_log from public.exchange_logs where idempotency_key = p_idempotency_key;
  if found then
    if v_log.profile_id <> p_profile_id or v_log.rule_id <> p_rule_id then
      raise exception '이미 다른 교환 요청에 사용된 중복 방지 키입니다.';
    end if;
    select * into v_target from public.rewards where id = v_log.target_reward_id;
    return jsonb_build_object('exchangeLogId', v_log.id, 'targetRewardName', v_target.name, 'targetQuantity', v_log.target_quantity, 'duplicate', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || p_rule_id::text, 0));
  select * into v_log from public.exchange_logs where idempotency_key = p_idempotency_key;
  if found then
    if v_log.profile_id <> p_profile_id or v_log.rule_id <> p_rule_id then
      raise exception '이미 다른 교환 요청에 사용된 중복 방지 키입니다.';
    end if;
    select * into v_target from public.rewards where id = v_log.target_reward_id;
    return jsonb_build_object('exchangeLogId', v_log.id, 'targetRewardName', v_target.name, 'targetQuantity', v_log.target_quantity, 'duplicate', true);
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found or v_profile.status <> 'APPROVED' or v_profile.role <> 'USER' then raise exception '승인된 일반 회원만 교환할 수 있습니다.'; end if;
  select * into v_rule from public.exchange_rules where id = p_rule_id and is_active = true for update;
  if not found then raise exception '현재 사용할 수 없는 교환 규칙입니다.'; end if;
  select * into v_source from public.rewards where id = v_rule.source_reward_id and is_active = true;
  if not found then raise exception '교환 재료 상품을 찾을 수 없습니다.'; end if;
  select * into v_target from public.rewards where id = v_rule.target_reward_id and is_active = true for update;
  if not found then raise exception '교환 대상 상품을 찾을 수 없습니다.'; end if;
  if not v_source.is_inventory_item or not v_target.is_inventory_item then raise exception '보유 상품만 교환에 사용할 수 있습니다.'; end if;

  select quantity into v_owned from public.participant_items where profile_id = p_profile_id and reward_id = v_rule.source_reward_id for update;
  if coalesce(v_owned, 0) < v_rule.source_quantity then raise exception '교환 재료 수량이 부족합니다. 필요 %, 보유 %', v_rule.source_quantity, coalesce(v_owned,0); end if;
  if v_target.stock is not null and v_target.stock < v_rule.target_quantity then raise exception '교환 상품 재고가 부족합니다.'; end if;

  update public.participant_items set quantity = quantity - v_rule.source_quantity, updated_at = now() where profile_id = p_profile_id and reward_id = v_rule.source_reward_id;
  insert into public.participant_items(profile_id, reward_id, quantity) values(p_profile_id, v_rule.target_reward_id, v_rule.target_quantity)
  on conflict(profile_id, reward_id) do update set quantity = public.participant_items.quantity + excluded.quantity, updated_at = now();
  if v_target.stock is not null then update public.rewards set stock = stock - v_rule.target_quantity where id = v_target.id; end if;

  insert into public.exchange_logs(rule_id, profile_id, source_reward_id, source_quantity, target_reward_id, target_quantity, idempotency_key, ip_address, user_agent)
  values(v_rule.id, p_profile_id, v_rule.source_reward_id, v_rule.source_quantity, v_rule.target_reward_id, v_rule.target_quantity, p_idempotency_key, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown'))
  returning * into v_log;
  return jsonb_build_object('exchangeLogId', v_log.id, 'sourceRewardName', v_source.name, 'sourceQuantity', v_rule.source_quantity, 'targetRewardName', v_target.name, 'targetQuantity', v_rule.target_quantity, 'duplicate', false);
end;
$$;

create or replace function public.void_result(
  p_result_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_result public.results%rowtype;
  v_reward public.rewards%rowtype;
  v_quantity integer;
begin
  if char_length(trim(p_reason)) < 2 then raise exception '무효 처리 사유를 입력해 주세요.'; end if;
  select * into v_result from public.results where id = p_result_id for update;
  if not found then raise exception '결과를 찾을 수 없습니다.'; end if;
  if v_result.voided_at is not null then raise exception '이미 무효 처리된 결과입니다.'; end if;
  if v_result.revealed_at is null then raise exception '카드 연출과 결과 공개가 끝난 뒤 무효 처리해 주세요.'; end if;
  select * into v_reward from public.rewards where id = v_result.reward_id for update;

  if v_reward.is_inventory_item and v_result.revealed_at is not null then
    select quantity into v_quantity from public.participant_items where profile_id = v_result.participant_id and reward_id = v_result.reward_id for update;
    if coalesce(v_quantity, 0) < 1 then raise exception '회원 보유 수량이 부족하여 결과를 무효 처리할 수 없습니다. 이미 교환·사용되었는지 확인해 주세요.'; end if;
    update public.participant_items set quantity = quantity - 1, updated_at = now() where profile_id = v_result.participant_id and reward_id = v_result.reward_id;
  end if;
  if v_reward.stock is not null then update public.rewards set stock = stock + 1 where id = v_reward.id; end if;
  update public.results set voided_at = now(), voided_by = p_admin_id, void_reason = trim(p_reason) where id = p_result_id returning * into v_result;
  insert into public.live_events(draw_id, result_id, event_type, payload) values(v_result.draw_id, v_result.id, 'STATS_UPDATE', jsonb_build_object('resultId', v_result.id, 'voided', true));
  perform public.append_admin_log(p_admin_id, 'RESULT_VOIDED', 'results', p_result_id, jsonb_build_object('reason', trim(p_reason), 'rewardId', v_reward.id), p_ip, p_user_agent);
  return jsonb_build_object('resultId', p_result_id, 'voidedAt', v_result.voided_at, 'reason', trim(p_reason));
end;
$$;

create or replace function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits(key, window_start, request_count, updated_at)
  values(p_key, now(), 1, now())
  on conflict(key) do update set
    window_start = case when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= now() then now() else public.rate_limits.window_start end,
    request_count = case when public.rate_limits.window_start + make_interval(secs => p_window_seconds) <= now() then 1 else public.rate_limits.request_count + 1 end,
    updated_at = now()
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.verify_admin_log_chain()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_row record;
  v_expected_previous text := null;
  v_expected_hash text;
  v_checked integer := 0;
begin
  for v_row in select * from public.admin_logs order by sequence_no
  loop
    if v_row.previous_hash is distinct from v_expected_previous then
      return jsonb_build_object('valid', false, 'checked', v_checked, 'invalidSequence', v_row.sequence_no, 'reason', 'PREVIOUS_HASH_MISMATCH');
    end if;
    v_expected_hash := encode(digest(
      coalesce(v_expected_previous, '') || '|' || v_row.id::text || '|' || coalesce(v_row.admin_id::text, '') || '|' ||
      v_row.action || '|' || coalesce(v_row.target_table, '') || '|' || coalesce(v_row.target_id::text, '') || '|' ||
      coalesce(v_row.details, '{}'::jsonb)::text || '|' || coalesce(v_row.ip_address, 'unknown') || '|' ||
      coalesce(v_row.user_agent, 'unknown') || '|' || to_char(v_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      'sha256'
    ), 'hex');
    if v_row.entry_hash is distinct from v_expected_hash then
      return jsonb_build_object('valid', false, 'checked', v_checked, 'invalidSequence', v_row.sequence_no, 'reason', 'ENTRY_HASH_MISMATCH');
    end if;
    v_expected_previous := v_row.entry_hash;
    v_checked := v_checked + 1;
  end loop;
  return jsonb_build_object('valid', true, 'checked', v_checked, 'invalidSequence', null, 'reason', null);
end;
$$;

create or replace function public.verify_probability_history_chain()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_row record;
  v_expected_previous text := null;
  v_expected_hash text;
  v_checked integer := 0;
begin
  for v_row in select * from public.probability_history order by sequence_no
  loop
    if v_row.previous_hash is distinct from v_expected_previous then
      return jsonb_build_object('valid', false, 'checked', v_checked, 'invalidSequence', v_row.sequence_no, 'reason', 'PREVIOUS_HASH_MISMATCH');
    end if;
    v_expected_hash := encode(digest(
      coalesce(v_expected_previous, '') || '|' || v_row.id::text || '|' || v_row.draw_id::text || '|' || v_row.admin_id::text || '|' ||
      v_row.before_values::text || '|' || v_row.after_values::text || '|' || v_row.reason || '|' || coalesce(v_row.ip_address, 'unknown') || '|' ||
      coalesce(v_row.user_agent, 'unknown') || '|' || to_char(v_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      'sha256'
    ), 'hex');
    if v_row.entry_hash is distinct from v_expected_hash then
      return jsonb_build_object('valid', false, 'checked', v_checked, 'invalidSequence', v_row.sequence_no, 'reason', 'ENTRY_HASH_MISMATCH');
    end if;
    v_expected_previous := v_row.entry_hash;
    v_checked := v_checked + 1;
  end loop;
  return jsonb_build_object('valid', true, 'checked', v_checked, 'invalidSequence', null, 'reason', null);
end;
$$;

create or replace function public.calculate_stats()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
with valid_results as (
  select res.*
  from public.results res
  join public.draws d on d.id = res.draw_id
  where res.revealed_at is not null
    and res.voided_at is null
    and d.is_public = true
    and d.status in ('ACTIVE','PAUSED','ENDED')
), totals as (
  select count(*)::integer as total from valid_results
), draw_totals as (
  select draw_id, count(*)::integer as total
  from valid_results
  group by draw_id
), reward_rows as (
  select r.id, r.name, d.name as draw_name, r.color, r.probability_units, r.sort_order, d.created_at as draw_created_at,
         count(v.id)::integer as result_count,
         case when coalesce(dt.total, 0) > 0 then round(count(v.id)::numeric * 100 / dt.total, 2) else 0 end as actual_rate
  from public.rewards r
  join public.draws d on d.id = r.draw_id and d.is_public = true and d.status in ('ACTIVE','PAUSED','ENDED')
  left join valid_results v on v.reward_id = r.id
  left join draw_totals dt on dt.draw_id = r.draw_id
  where r.is_active = true
  group by r.id, r.name, d.name, r.color, r.probability_units, r.sort_order, d.created_at, dt.total
), dates as (
  select generate_series(((now() at time zone 'Asia/Seoul')::date - 6), (now() at time zone 'Asia/Seoul')::date, interval '1 day')::date as day
), daily as (
  select d.day, count(v.id)::integer as result_count
  from dates d
  left join valid_results v on (v.created_at at time zone 'Asia/Seoul')::date = d.day
  group by d.day order by d.day
)
select jsonb_build_object(
  'totalDraws', (select total from totals),
  'todayDraws', (select count(*)::integer from valid_results where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date),
  'totalMembers', (select count(*)::integer from public.profiles where status = 'APPROVED' and role = 'USER'),
  'rewardStats', coalesce((select jsonb_agg(jsonb_build_object('rewardId', id, 'drawName', draw_name, 'name', name, 'count', result_count, 'actualRate', actual_rate, 'configuredRate', probability_units / 10000.0, 'color', color) order by draw_created_at desc, sort_order, id) from reward_rows), '[]'::jsonb),
  'dailyStats', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(day, 'MM/DD'), 'count', result_count) order by day) from daily), '[]'::jsonb)
);
$$;

create or replace function public.get_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select case
    when coalesce((select (value #>> '{}')::boolean from public.site_settings where key = 'public_stats'), true)
      then public.calculate_stats()
    else jsonb_build_object(
      'totalDraws', 0,
      'todayDraws', 0,
      'totalMembers', 0,
      'rewardStats', '[]'::jsonb,
      'dailyStats', '[]'::jsonb
    )
  end;
$$;

create or replace function public.get_admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select public.calculate_stats();
$$;

create or replace view public.public_results as
select
  res.id,
  res.draw_id,
  res.reward_id,
  null::uuid as participant_id,
  public.mask_public_member_code(res.public_member_code) as public_member_code,
  public.mask_public_name(res.public_display_name) as public_display_name,
  rw.name as reward_name,
  rw.color as reward_color,
  d.name as draw_name,
  res.created_at,
  res.revealed_at,
  res.voided_at
from public.results res
join public.rewards rw on rw.id = res.reward_id
join public.draws d on d.id = res.draw_id
where res.revealed_at is not null
  and res.voided_at is null
  and d.is_public = true
  and d.status in ('ACTIVE','PAUSED','ENDED');


-- 설치 상태와 service_role 권한을 안전하게 확인하는 서버 전용 함수
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
    'pgcryptoReady', exists (
      select 1
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'pgcrypto'
    ),
    'superAdminCount', (select count(*)::integer from public.profiles where role = 'SUPER_ADMIN'),
    'serviceRoleCanReadProfiles', has_table_privilege('service_role', 'public.profiles', 'SELECT'),
    'serviceRoleCanWriteProfiles',
      has_table_privilege('service_role', 'public.profiles', 'INSERT')
      and has_table_privilege('service_role', 'public.profiles', 'UPDATE')
      and has_table_privilege('service_role', 'public.profiles', 'DELETE')
  );
$$;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.draws enable row level security;
alter table public.rewards enable row level security;
alter table public.participant_items enable row level security;
alter table public.results enable row level security;
alter table public.exchange_rules enable row level security;
alter table public.exchange_logs enable row level security;
alter table public.probability_history enable row level security;
alter table public.admin_logs enable row level security;
alter table public.live_events enable row level security;
alter table public.site_settings enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists draws_select_public on public.draws;
create policy draws_select_public on public.draws for select to anon, authenticated using (is_public = true and status in ('ACTIVE','PAUSED','ENDED'));
drop policy if exists draws_select_participated on public.draws;
create policy draws_select_participated on public.draws for select to authenticated using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED')
  and exists(select 1 from public.results res where res.draw_id = draws.id and res.participant_id = auth.uid() and res.revealed_at is not null)
);
drop policy if exists rewards_select_public on public.rewards;
create policy rewards_select_public on public.rewards for select to anon, authenticated using (is_active = true and exists(select 1 from public.draws d where d.id = draw_id and d.is_public = true and d.status in ('ACTIVE','PAUSED','ENDED')));
drop policy if exists rewards_select_owned on public.rewards;
create policy rewards_select_owned on public.rewards for select to authenticated using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED')
  and (
    exists(select 1 from public.participant_items pi where pi.reward_id = rewards.id and pi.profile_id = auth.uid() and pi.quantity > 0)
    or exists(select 1 from public.results res where res.reward_id = rewards.id and res.participant_id = auth.uid() and res.revealed_at is not null)
  )
);
drop policy if exists rewards_select_exchange_rule on public.rewards;
create policy rewards_select_exchange_rule on public.rewards for select to authenticated using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED')
  and exists(select 1 from public.exchange_rules er where er.is_active = true and (er.source_reward_id = rewards.id or er.target_reward_id = rewards.id))
);
drop policy if exists participant_items_select_self on public.participant_items;
create policy participant_items_select_self on public.participant_items for select to authenticated using (profile_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED'));
drop policy if exists results_select_self on public.results;
create policy results_select_self on public.results for select to authenticated using (participant_id = auth.uid() and revealed_at is not null and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED'));
drop policy if exists exchange_rules_select_active on public.exchange_rules;
create policy exchange_rules_select_active on public.exchange_rules for select to anon, authenticated using (is_active = true);
drop policy if exists exchange_logs_select_self on public.exchange_logs;
create policy exchange_logs_select_self on public.exchange_logs for select to authenticated using (profile_id = auth.uid() and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED'));
drop policy if exists live_events_select_public on public.live_events;
create policy live_events_select_public on public.live_events for select to anon, authenticated using (
  created_at > now() - interval '24 hours'
  and (
    exists(select 1 from public.draws d where d.id = live_events.draw_id and d.is_public = true and d.status in ('ACTIVE','PAUSED','ENDED'))
    or exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'APPROVED' and p.role in ('VIEWER','MANAGER','SUPER_ADMIN'))
  )
);
drop policy if exists site_settings_select_public on public.site_settings;
create policy site_settings_select_public on public.site_settings for select to anon, authenticated using (is_public = true);

revoke all on public.rate_limits from anon, authenticated;
revoke all on public.admin_logs from anon, authenticated;
revoke all on public.probability_history from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to service_role;
revoke select on public.draws, public.rewards, public.exchange_rules, public.site_settings from anon, authenticated;
grant select (id, name, slug, description, status, animation_ms, is_public, created_at, updated_at) on public.draws to anon, authenticated;
grant select (id, draw_id, name, description, image_url, color, probability_units, is_inventory_item, is_exchange_material, is_active, sort_order, created_at, updated_at) on public.rewards to anon, authenticated;
grant select (id, name, source_reward_id, source_quantity, target_reward_id, target_quantity, is_active, sort_order, created_at, updated_at) on public.exchange_rules to anon, authenticated;
grant select (key, value, is_public, updated_at) on public.site_settings to anon, authenticated;
grant select on public.live_events, public.public_results to anon, authenticated;
grant select on public.profiles, public.participant_items, public.results, public.exchange_logs to authenticated;
grant execute on function public.get_public_stats() to anon, authenticated;

-- Supabase의 새 Secret key와 레거시 service_role key 모두가 서버 API에서 동작하도록 명시적 권한 부여
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select, update on sequences to service_role;

revoke execute on function public.dynamic_draw_install_status() from public, anon, authenticated;
revoke execute on function public.next_member_code() from public, anon, authenticated;
revoke execute on function public.append_admin_log(uuid,text,text,uuid,jsonb,text,text) from public, anon, authenticated;
revoke execute on function public.validate_draw_ready(uuid) from public, anon, authenticated;
revoke execute on function public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.execute_draw(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.reveal_result(uuid,uuid,boolean,text,text) from public, anon, authenticated;
revoke execute on function public.reveal_due_results() from public, anon, authenticated;
revoke execute on function public.exchange_items(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.void_result(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
revoke execute on function public.verify_admin_log_chain() from public, anon, authenticated;
revoke execute on function public.verify_probability_history_chain() from public, anon, authenticated;
revoke execute on function public.calculate_stats() from public, anon, authenticated;
revoke execute on function public.get_admin_stats() from public, anon, authenticated;

grant execute on function public.dynamic_draw_install_status() to service_role;
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

insert into public.site_settings(key, value, is_public) values
  ('site_name', '"Dynamic Draw"'::jsonb, true),
  ('hero_title', '"결과는 짜릿하게, 운영은 투명하게."'::jsonb, true),
  ('hero_description', '"확률과 결과를 실시간으로 공개하는 이벤트 추첨 시스템"'::jsonb, true),
  ('public_stats', 'true'::jsonb, true)
on conflict(key) do nothing;

insert into public.site_settings(key, value, is_public)
values ('schema_version', '"1.0.2"'::jsonb, true)
on conflict(key) do update set value = excluded.value, is_public = true, updated_at = now();

DO $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_events') then
    alter publication supabase_realtime add table public.live_events;
  end if;
end $$;

notify pgrst, 'reload schema';
