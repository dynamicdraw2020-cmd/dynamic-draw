-- Dynamic Draw v1.2.0
-- 룰렛 최적화 + 추첨권 소모형 관리자 추첨 + 이벤트 화폐 지급/교환 시스템
-- 기존 회원, 관리자, 뽑기, 결과는 삭제하지 않습니다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.draw_tickets (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  draw_id uuid not null references public.draws(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id, draw_id)
);

create table if not exists public.virtual_currencies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,24}$'),
  symbol text not null default 'P' check (char_length(symbol) between 1 and 8),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.currency_balances (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  currency_id uuid not null references public.virtual_currencies(id) on delete restrict,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id, currency_id)
);

create table if not exists public.currency_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  currency_id uuid not null references public.virtual_currencies(id) on delete restrict,
  amount integer not null,
  action text not null,
  memo text not null default '',
  balance_after integer not null,
  idempotency_key uuid unique,
  created_by uuid references public.profiles(id) on delete set null,
  ip_address text not null default 'unknown',
  user_agent text not null default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  currency_id uuid not null references public.virtual_currencies(id) on delete restrict,
  currency_cost integer not null check (currency_cost > 0),
  ticket_quantity integer not null default 1 check (ticket_quantity > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists currency_balances_profile_idx on public.currency_balances(profile_id, balance desc);
create index if not exists ticket_exchange_rates_active_idx on public.ticket_exchange_rates(is_active, sort_order);
create index if not exists currency_logs_profile_idx on public.currency_logs(profile_id, created_at desc);

alter table public.draw_tickets enable row level security;
alter table public.virtual_currencies enable row level security;
alter table public.currency_balances enable row level security;
alter table public.currency_logs enable row level security;
alter table public.ticket_exchange_rates enable row level security;

DO $$ BEGIN create trigger virtual_currencies_set_updated_at before update on public.virtual_currencies for each row execute function public.set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger currency_balances_set_updated_at before update on public.currency_balances for each row execute function public.set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create trigger ticket_exchange_rates_set_updated_at before update on public.ticket_exchange_rates for each row execute function public.set_updated_at(); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create policy virtual_currencies_select_active on public.virtual_currencies for select to anon, authenticated using (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create policy currency_balances_select_self on public.currency_balances for select to authenticated using (profile_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create policy currency_logs_select_self on public.currency_logs for select to authenticated using (profile_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN create policy ticket_exchange_rates_select_active on public.ticket_exchange_rates for select to anon, authenticated using (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

revoke all on public.currency_balances, public.currency_logs from anon, authenticated;
grant select on public.currency_balances, public.currency_logs to authenticated;
grant select on public.virtual_currencies, public.ticket_exchange_rates to anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

insert into public.virtual_currencies(name, code, symbol, sort_order)
values ('이벤트 코인', 'EVENT_COIN', 'EC', 10)
on conflict(code) do update set name = excluded.name, symbol = excluded.symbol, is_active = true, updated_at = now();

insert into public.ticket_exchange_rates(draw_id, currency_id, currency_cost, ticket_quantity, sort_order)
select d.id, c.id, 100, 1, 10 from public.draws d cross join public.virtual_currencies c where d.slug = 'ticket-draw' and c.code = 'EVENT_COIN' on conflict do nothing;

create or replace function public.admin_grant_virtual_currency(p_currency_id uuid, p_profile_id uuid, p_amount integer, p_admin_id uuid, p_memo text default '', p_ip text default 'unknown', p_user_agent text default 'unknown') returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_currency public.virtual_currencies%rowtype; v_profile public.profiles%rowtype; v_balance integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception '화폐는 1 이상 1,000,000 이하로 지급할 수 있습니다.'; end if;
  select * into v_currency from public.virtual_currencies where id = p_currency_id and is_active = true; if not found then raise exception '사용 가능한 화폐를 찾을 수 없습니다.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id; if not found then raise exception '회원을 찾을 수 없습니다.'; end if;
  if v_profile.status <> 'APPROVED' or v_profile.role <> 'USER' then raise exception '승인된 일반 회원에게만 화폐를 지급할 수 있습니다.'; end if;
  insert into public.currency_balances(profile_id, currency_id, balance) values(p_profile_id, p_currency_id, p_amount) on conflict(profile_id, currency_id) do update set balance = public.currency_balances.balance + excluded.balance, updated_at = now() returning balance into v_balance;
  insert into public.currency_logs(profile_id, currency_id, amount, action, memo, balance_after, created_by, ip_address, user_agent) values(p_profile_id, p_currency_id, p_amount, 'ADMIN_GRANT', coalesce(p_memo,''), v_balance, p_admin_id, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown'));
  perform public.append_admin_log(p_admin_id, 'VIRTUAL_CURRENCY_GRANTED', 'currency_balances', p_profile_id, jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'profileId', p_profile_id, 'profileName', v_profile.display_name, 'amountAdded', p_amount, 'balanceAfter', v_balance, 'memo', coalesce(p_memo,'')), p_ip, p_user_agent);
  return jsonb_build_object('profileId', p_profile_id, 'currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAdded', p_amount, 'balance', v_balance);
end; $$;

create or replace function public.user_exchange_currency_for_tickets(p_rate_id uuid, p_profile_id uuid, p_bundle_count integer, p_idempotency_key uuid, p_ip text default 'unknown', p_user_agent text default 'unknown') returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rate public.ticket_exchange_rates%rowtype; v_currency public.virtual_currencies%rowtype; v_draw public.draws%rowtype; v_profile public.profiles%rowtype; v_balance integer; v_balance_after integer; v_cost integer; v_tickets integer; v_ticket_after integer; v_existing public.currency_logs%rowtype;
begin
  if p_bundle_count is null or p_bundle_count < 1 or p_bundle_count > 100 then raise exception '교환 묶음 수를 확인해 주세요.'; end if;
  select * into v_existing from public.currency_logs where idempotency_key = p_idempotency_key; if found then return jsonb_build_object('duplicate', true, 'balanceAfter', v_existing.balance_after); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_rate_id::text, 0));
  select * into v_existing from public.currency_logs where idempotency_key = p_idempotency_key; if found then return jsonb_build_object('duplicate', true, 'balanceAfter', v_existing.balance_after); end if;
  select * into v_rate from public.ticket_exchange_rates where id = p_rate_id and is_active = true for update; if not found then raise exception '사용 가능한 추첨권 교환 규칙이 없습니다.'; end if;
  select * into v_draw from public.draws where id = v_rate.draw_id; if not found or v_draw.status <> 'ACTIVE' then raise exception '현재 진행 중인 뽑기만 추첨권으로 교환할 수 있습니다.'; end if;
  select * into v_currency from public.virtual_currencies where id = v_rate.currency_id and is_active = true; if not found then raise exception '사용 가능한 화폐가 아닙니다.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id; if not found or v_profile.status <> 'APPROVED' or v_profile.role <> 'USER' then raise exception '승인된 일반 회원만 교환할 수 있습니다.'; end if;
  v_cost := v_rate.currency_cost * p_bundle_count; v_tickets := v_rate.ticket_quantity * p_bundle_count;
  insert into public.currency_balances(profile_id, currency_id, balance) values(p_profile_id, v_rate.currency_id, 0) on conflict(profile_id, currency_id) do nothing;
  select balance into v_balance from public.currency_balances where profile_id = p_profile_id and currency_id = v_rate.currency_id for update;
  if coalesce(v_balance, 0) < v_cost then raise exception '보유 화폐가 부족합니다. 필요 %, 보유 %', v_cost, coalesce(v_balance, 0); end if;
  update public.currency_balances set balance = balance - v_cost, updated_at = now() where profile_id = p_profile_id and currency_id = v_rate.currency_id returning balance into v_balance_after;
  insert into public.draw_tickets(profile_id, draw_id, quantity) values(p_profile_id, v_rate.draw_id, v_tickets) on conflict(profile_id, draw_id) do update set quantity = public.draw_tickets.quantity + excluded.quantity, updated_at = now() returning quantity into v_ticket_after;
  insert into public.currency_logs(profile_id, currency_id, amount, action, memo, balance_after, idempotency_key, created_by, ip_address, user_agent) values(p_profile_id, v_rate.currency_id, -v_cost, 'USER_EXCHANGE_TO_TICKET', v_draw.name || ' 추첨권 교환', v_balance_after, p_idempotency_key, p_profile_id, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown'));
  perform public.append_admin_log(p_profile_id, 'USER_EXCHANGED_CURRENCY_TO_TICKETS', 'draw_tickets', p_profile_id, jsonb_build_object('drawId', v_rate.draw_id, 'drawName', v_draw.name, 'currencySpent', v_cost, 'ticketsAdded', v_tickets, 'ticketsAfter', v_ticket_after, 'balanceAfter', v_balance_after), p_ip, p_user_agent);
  return jsonb_build_object('drawId', v_rate.draw_id, 'drawName', v_draw.name, 'currencySpent', v_cost, 'ticketsAdded', v_tickets, 'ticketsAfter', v_ticket_after, 'balanceAfter', v_balance_after, 'duplicate', false);
end; $$;

create or replace function public.admin_execute_draw_with_ticket(p_draw_id uuid, p_participant_id uuid, p_admin_id uuid, p_idempotency_key uuid, p_ip text, p_user_agent text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_existing public.results%rowtype; v_ticket_quantity integer; v_remaining integer; v_result jsonb;
begin
  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then select coalesce(quantity, 0) into v_remaining from public.draw_tickets where profile_id = p_participant_id and draw_id = p_draw_id; return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', (select animation_ms from public.draws where id = p_draw_id), 'revealAt', v_existing.reveal_at, 'remainingTickets', coalesce(v_remaining, 0), 'duplicate', true); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_participant_id::text || ':' || p_draw_id::text || ':admin', 0));
  select * into v_existing from public.results where idempotency_key = p_idempotency_key;
  if found then select coalesce(quantity, 0) into v_remaining from public.draw_tickets where profile_id = p_participant_id and draw_id = p_draw_id; return jsonb_build_object('resultId', v_existing.id, 'drawId', v_existing.draw_id, 'animationMs', (select animation_ms from public.draws where id = p_draw_id), 'revealAt', v_existing.reveal_at, 'remainingTickets', coalesce(v_remaining, 0), 'duplicate', true); end if;
  select quantity into v_ticket_quantity from public.draw_tickets where profile_id = p_participant_id and draw_id = p_draw_id for update;
  if coalesce(v_ticket_quantity, 0) < 1 then raise exception '선택한 회원에게 이 뽑기에 사용할 추첨권이 없습니다.'; end if;
  update public.draw_tickets set quantity = quantity - 1, updated_at = now() where profile_id = p_participant_id and draw_id = p_draw_id and quantity > 0 returning quantity into v_remaining; if not found then raise exception '추첨권 차감에 실패했습니다.'; end if;
  v_result := public.execute_draw(p_draw_id, p_participant_id, p_admin_id, p_idempotency_key, p_ip, p_user_agent);
  perform public.append_admin_log(p_admin_id, 'ADMIN_DRAW_TICKET_CONSUMED', 'draw_tickets', p_participant_id, jsonb_build_object('drawId', p_draw_id, 'participantId', p_participant_id, 'remainingTickets', v_remaining), p_ip, p_user_agent);
  return v_result || jsonb_build_object('remainingTickets', v_remaining, 'ticketConsumed', true);
end; $$;

grant execute on function public.admin_grant_virtual_currency(uuid,uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.user_exchange_currency_for_tickets(uuid,uuid,integer,uuid,text,text) to service_role;
grant execute on function public.admin_execute_draw_with_ticket(uuid,uuid,uuid,uuid,text,text) to service_role;

insert into public.site_settings(key, value, is_public) values ('dynamic_draw_schema_version', '"v1.2.0"'::jsonb, false) on conflict(key) do update set value = excluded.value, updated_at = now();

select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'virtual_currencies') as currencies_table_ready, exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'currency_balances') as currency_balances_ready, exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ticket_exchange_rates') as ticket_exchange_ready, exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_execute_draw_with_ticket') as admin_ticket_draw_ready;
