-- Dynamic Draw v1.3.0
-- 개인정보 최소화 아이디 로그인 + 공지/이벤트 + 전체 지급 + 디자인 개편 지원
-- 기존 데이터는 삭제하지 않습니다.

create extension if not exists pgcrypto with schema extensions;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter table public.profiles add column if not exists username text;

create or replace function public.normalize_dynamic_login_id(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_value, ''), '[^a-zA-Z0-9_]', '_', 'g'));
$$;

DO $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix integer;
begin
  for r in select id, email, member_code from public.profiles where username is null or username = '' loop
    v_base := public.normalize_dynamic_login_id(split_part(coalesce(r.email, ''), '@', 1));
    if length(v_base) < 3 then
      v_base := public.normalize_dynamic_login_id(coalesce(r.member_code, 'member'));
    end if;
    v_base := left(v_base, 24);
    if length(v_base) < 3 then v_base := 'member'; end if;
    v_candidate := v_base;
    v_suffix := 1;
    while exists(select 1 from public.profiles p where p.username = v_candidate and p.id <> r.id) loop
      v_candidate := left(v_base, 24) || '_' || v_suffix::text;
      v_suffix := v_suffix + 1;
    end loop;
    update public.profiles set username = v_candidate where id = r.id;
  end loop;
end $$;

update public.profiles set phone = null where phone is not null;

create unique index if not exists profiles_username_uidx on public.profiles(lower(username)) where username is not null;

DO $$ BEGIN
  alter table public.profiles add constraint profiles_username_format_chk check (username is null or username ~ '^[a-z0-9_]{3,32}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
begin
  v_username := public.normalize_dynamic_login_id(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(coalesce(new.email, ''), '@', 1)));
  if char_length(v_username) < 3 then v_username := null; end if;

  insert into public.profiles(id, email, username, display_name, phone)
  values (
    new.id,
    lower(coalesce(new.email, 'unknown-' || new.id::text || '@invalid.local')),
    v_username,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), '회원'), 30),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 2 and 2000),
  is_pinned boolean not null default false,
  is_public boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,80}$'),
  summary text check (summary is null or char_length(summary) <= 160),
  body text check (body is null or char_length(body) <= 4000),
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','ENDED','ARCHIVED')),
  is_public boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists notices_public_idx on public.notices(is_public, is_pinned desc, created_at desc);
create index if not exists events_public_idx on public.events(is_public, status, sort_order, created_at desc);

alter table public.notices enable row level security;
alter table public.events enable row level security;

DO $$ BEGIN create trigger notices_set_updated_at before update on public.notices for each row execute function public.set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger events_set_updated_at before update on public.events for each row execute function public.set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN create policy notices_select_public on public.notices for select to anon, authenticated using (is_public = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create policy events_select_public on public.events for select to anon, authenticated using (is_public = true and status in ('ACTIVE','ENDED')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

grant select on public.notices, public.events to anon, authenticated;
grant all privileges on table public.notices, public.events to service_role;

create or replace function public.admin_grant_draw_tickets_bulk(
  p_draw_id uuid,
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
  v_count integer := 0;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception '추첨권은 1장 이상 1000장 이하로 지급할 수 있습니다.';
  end if;
  select * into v_draw from public.draws where id = p_draw_id;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status = 'ENDED' then raise exception '종료된 뽑기에는 추첨권을 지급할 수 없습니다.'; end if;

  insert into public.draw_tickets(profile_id, draw_id, quantity)
  select p.id, p_draw_id, p_quantity
  from public.profiles p
  where p.status = 'APPROVED' and p.role = 'USER'
  on conflict(profile_id, draw_id) do update
  set quantity = public.draw_tickets.quantity + excluded.quantity,
      updated_at = now();

  get diagnostics v_count = row_count;

  perform public.append_admin_log(
    p_admin_id,
    'DRAW_TICKETS_BULK_GRANTED',
    'draw_tickets',
    p_draw_id,
    jsonb_build_object('drawId', p_draw_id, 'drawName', v_draw.name, 'quantityAddedEach', p_quantity, 'affectedCount', v_count, 'memo', coalesce(p_memo,'')),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object('drawId', p_draw_id, 'drawName', v_draw.name, 'quantityAddedEach', p_quantity, 'affectedCount', v_count);
end;
$$;

create or replace function public.admin_grant_virtual_currency_bulk(
  p_currency_id uuid,
  p_amount integer,
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
  v_currency public.virtual_currencies%rowtype;
  v_count integer := 0;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception '화폐는 1 이상 1,000,000 이하로 지급할 수 있습니다.';
  end if;
  select * into v_currency from public.virtual_currencies where id = p_currency_id and is_active = true;
  if not found then raise exception '사용 가능한 화폐를 찾을 수 없습니다.'; end if;

  insert into public.currency_balances(profile_id, currency_id, balance)
  select p.id, p_currency_id, p_amount
  from public.profiles p
  where p.status = 'APPROVED' and p.role = 'USER'
  on conflict(profile_id, currency_id) do update
  set balance = public.currency_balances.balance + excluded.balance,
      updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.currency_logs(profile_id, currency_id, amount, action, memo, balance_after, created_by, ip_address, user_agent)
  select cb.profile_id, p_currency_id, p_amount, 'ADMIN_BULK_GRANT', coalesce(p_memo,''), cb.balance, p_admin_id, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown')
  from public.currency_balances cb
  join public.profiles p on p.id = cb.profile_id
  where cb.currency_id = p_currency_id and p.status = 'APPROVED' and p.role = 'USER';

  perform public.append_admin_log(
    p_admin_id,
    'VIRTUAL_CURRENCY_BULK_GRANTED',
    'currency_balances',
    p_currency_id,
    jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAddedEach', p_amount, 'affectedCount', v_count, 'memo', coalesce(p_memo,'')),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAddedEach', p_amount, 'affectedCount', v_count);
end;
$$;

grant execute on function public.admin_grant_draw_tickets_bulk(uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.admin_grant_virtual_currency_bulk(uuid,integer,uuid,text,text,text) to service_role;

insert into public.notices(title, body, is_pinned, is_public)
values ('운영 안내', 'Dynamic Draw는 이벤트 운영용 추첨 시스템입니다. 실제 결제 기능은 없으며, 추첨권과 화폐는 사이트 내부 운영용 포인트입니다.', true, true)
on conflict do nothing;

insert into public.site_settings(key, value, is_public) values
  ('dynamic_draw_schema_version', '"v1.3.0"'::jsonb, false),
  ('hero_title', '"투명한 이벤트 추첨 운영"'::jsonb, true),
  ('hero_description', '"공지, 이벤트, 추첨권, 결과 공개를 한곳에서 관리하는 운영형 추첨 플랫폼"'::jsonb, true)
on conflict(key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='username') as username_ready,
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='notices') as notices_ready,
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='events') as events_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='admin_grant_draw_tickets_bulk') as bulk_tickets_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='admin_grant_virtual_currency_bulk') as bulk_currency_ready;
