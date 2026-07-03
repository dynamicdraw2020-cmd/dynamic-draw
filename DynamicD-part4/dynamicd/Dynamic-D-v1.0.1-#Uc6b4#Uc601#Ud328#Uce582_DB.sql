-- Dynamic D v1.0.1 운영 패치 2
-- 상품 이미지 파일 업로드 UI, 공지 삭제, 전체 회원 삭제, 관리자 지급 대상 확장 보정

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.product_catalog add column if not exists deleted_at timestamptz;
alter table public.rewards add column if not exists deleted_at timestamptz;
alter table public.draws add column if not exists deleted_at timestamptz;
alter table public.virtual_currencies add column if not exists deleted_at timestamptz;
alter table public.ticket_exchange_rates add column if not exists deleted_at timestamptz;

-- AI/기본 안내로 들어간 예시 공지는 비웁니다. 사용자가 직접 작성한 다른 공지는 유지합니다.
delete from public.notices
where title in ('운영 안내', 'Dynamic D 공식 채널 안내', 'Dynamic Draw 운영 안내')
   or body ilike '%Dynamic Draw는 이벤트 운영용 추첨 시스템%'
   or body ilike '%공지 예시%'
   or body ilike '%추첨권과 화폐는 사이트 내부 운영용 포인트%';

insert into public.site_settings(key, value, is_public) values
  ('site_name', '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃"'::jsonb, true),
  ('hero_title', '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 - 이벤트 전용 사이트"'::jsonb, true),
  ('dynamic_draw_schema_version', '"1.0.1"'::jsonb, false)
on conflict(key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

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
  select * into v_draw from public.draws where id = p_draw_id and deleted_at is null;
  if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status = 'ENDED' then raise exception '종료된 뽑기에는 추첨권을 지급할 수 없습니다.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception '계정을 찾을 수 없습니다.'; end if;
  if v_profile.status <> 'APPROVED' then raise exception '승인된 계정에게만 추첨권을 지급할 수 있습니다.'; end if;
  insert into public.draw_tickets(profile_id, draw_id, quantity)
  values(p_profile_id, p_draw_id, p_quantity)
  on conflict(profile_id, draw_id) do update set quantity = public.draw_tickets.quantity + excluded.quantity, updated_at = now()
  returning * into v_ticket;
  perform public.append_admin_log(p_admin_id, 'DRAW_TICKETS_GRANTED', 'draw_tickets', p_profile_id, jsonb_build_object('drawId', p_draw_id, 'drawName', v_draw.name, 'profileId', p_profile_id, 'profileName', v_profile.display_name, 'profileRole', v_profile.role, 'quantityAdded', p_quantity, 'quantityAfter', v_ticket.quantity, 'memo', coalesce(p_memo,'')), p_ip, p_user_agent);
  return jsonb_build_object('profileId', p_profile_id, 'drawId', p_draw_id, 'quantity', v_ticket.quantity, 'quantityAdded', p_quantity, 'drawName', v_draw.name, 'profileName', v_profile.display_name, 'profileRole', v_profile.role);
end;
$$;

create or replace function public.admin_grant_virtual_currency(
  p_currency_id uuid,
  p_profile_id uuid,
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
  v_profile public.profiles%rowtype;
  v_balance integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception '화폐는 1 이상 1,000,000 이하로 지급할 수 있습니다.'; end if;
  select * into v_currency from public.virtual_currencies where id = p_currency_id and is_active = true and deleted_at is null; if not found then raise exception '사용 가능한 화폐를 찾을 수 없습니다.'; end if;
  select * into v_profile from public.profiles where id = p_profile_id; if not found then raise exception '계정을 찾을 수 없습니다.'; end if;
  if v_profile.status <> 'APPROVED' then raise exception '승인된 계정에게만 화폐를 지급할 수 있습니다.'; end if;
  insert into public.currency_balances(profile_id, currency_id, balance) values(p_profile_id, p_currency_id, p_amount)
  on conflict(profile_id, currency_id) do update set balance = public.currency_balances.balance + excluded.balance, updated_at = now()
  returning balance into v_balance;
  insert into public.currency_logs(profile_id, currency_id, amount, action, memo, balance_after, created_by, ip_address, user_agent)
  values(p_profile_id, p_currency_id, p_amount, 'ADMIN_GRANT', coalesce(p_memo,''), v_balance, p_admin_id, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown'));
  perform public.append_admin_log(p_admin_id, 'VIRTUAL_CURRENCY_GRANTED', 'currency_balances', p_profile_id, jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'profileId', p_profile_id, 'profileName', v_profile.display_name, 'profileRole', v_profile.role, 'amountAdded', p_amount, 'balanceAfter', v_balance, 'memo', coalesce(p_memo,'')), p_ip, p_user_agent);
  return jsonb_build_object('profileId', p_profile_id, 'currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAdded', p_amount, 'balance', v_balance, 'profileRole', v_profile.role);
end;
$$;

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
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then raise exception '추첨권은 1장 이상 1000장 이하로 지급할 수 있습니다.'; end if;
  select * into v_draw from public.draws where id = p_draw_id and deleted_at is null; if not found then raise exception '뽑기를 찾을 수 없습니다.'; end if;
  if v_draw.status = 'ENDED' then raise exception '종료된 뽑기에는 추첨권을 지급할 수 없습니다.'; end if;
  insert into public.draw_tickets(profile_id, draw_id, quantity)
  select p.id, p_draw_id, p_quantity from public.profiles p where p.status = 'APPROVED'
  on conflict(profile_id, draw_id) do update set quantity = public.draw_tickets.quantity + excluded.quantity, updated_at = now();
  get diagnostics v_count = row_count;
  perform public.append_admin_log(p_admin_id, 'DRAW_TICKETS_BULK_GRANTED', 'draw_tickets', p_draw_id, jsonb_build_object('drawId', p_draw_id, 'drawName', v_draw.name, 'quantityAddedEach', p_quantity, 'affectedCount', v_count, 'memo', coalesce(p_memo,'')), p_ip, p_user_agent);
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
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception '화폐는 1 이상 1,000,000 이하로 지급할 수 있습니다.'; end if;
  select * into v_currency from public.virtual_currencies where id = p_currency_id and is_active = true and deleted_at is null; if not found then raise exception '사용 가능한 화폐를 찾을 수 없습니다.'; end if;
  insert into public.currency_balances(profile_id, currency_id, balance)
  select p.id, p_currency_id, p_amount from public.profiles p where p.status = 'APPROVED'
  on conflict(profile_id, currency_id) do update set balance = public.currency_balances.balance + excluded.balance, updated_at = now();
  get diagnostics v_count = row_count;
  insert into public.currency_logs(profile_id, currency_id, amount, action, memo, balance_after, created_by, ip_address, user_agent)
  select cb.profile_id, p_currency_id, p_amount, 'ADMIN_BULK_GRANT', coalesce(p_memo,''), cb.balance, p_admin_id, coalesce(p_ip,'unknown'), coalesce(p_user_agent,'unknown') from public.currency_balances cb join public.profiles p on p.id = cb.profile_id where cb.currency_id = p_currency_id and p.status = 'APPROVED';
  perform public.append_admin_log(p_admin_id, 'VIRTUAL_CURRENCY_BULK_GRANTED', 'currency_balances', p_currency_id, jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAddedEach', p_amount, 'affectedCount', v_count, 'memo', coalesce(p_memo,'')), p_ip, p_user_agent);
  return jsonb_build_object('currencyId', p_currency_id, 'currencyName', v_currency.name, 'amountAddedEach', p_amount, 'affectedCount', v_count);
end;
$$;

grant execute on function public.admin_grant_draw_tickets(uuid,uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.admin_grant_virtual_currency(uuid,uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.admin_grant_draw_tickets_bulk(uuid,integer,uuid,text,text,text) to service_role;
grant execute on function public.admin_grant_virtual_currency_bulk(uuid,integer,uuid,text,text,text) to service_role;

select
  true as dynamic_d_patch_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='deleted_at') as user_delete_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_grant_draw_tickets') as ticket_grant_ready,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='admin_grant_virtual_currency') as currency_grant_ready;
