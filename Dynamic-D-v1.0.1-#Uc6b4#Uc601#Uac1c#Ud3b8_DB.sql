-- Dynamic D 1.0.1 운영 개편 DB 보정
-- 기능: 상품 보관함, 뽑기 소프트 삭제, 유저 삭제 상태, 화폐/교환비 삭제·정지, 기존 뽑기 정리

create extension if not exists pgcrypto with schema extensions;

-- 회원 삭제 상태 추가. 이미 있으면 건너뜁니다.
do $$ begin
  alter type public.profile_status add value if not exists 'DELETED';
exception when duplicate_object then null;
end $$;

alter table if exists public.profiles add column if not exists deleted_at timestamptz;
alter table if exists public.draws add column if not exists deleted_at timestamptz;
alter table if exists public.rewards add column if not exists deleted_at timestamptz;
alter table if exists public.virtual_currencies add column if not exists deleted_at timestamptz;
alter table if exists public.ticket_exchange_rates add column if not exists deleted_at timestamptz;
alter table if exists public.rewards add column if not exists product_catalog_id uuid;

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  image_url text,
  color text not null default '#111111' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  default_stock integer check (default_stock is null or default_stock >= 0),
  is_inventory_item boolean not null default true,
  is_exchange_material boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (not is_exchange_material or is_inventory_item)
);

create index if not exists product_catalog_active_idx on public.product_catalog(is_active, deleted_at, sort_order);
create index if not exists rewards_product_catalog_idx on public.rewards(product_catalog_id);
create index if not exists draws_deleted_idx on public.draws(deleted_at, created_at desc);
create index if not exists rewards_deleted_idx on public.rewards(deleted_at, draw_id, sort_order);
create index if not exists profiles_deleted_idx on public.profiles(status, deleted_at, created_at desc);

alter table public.product_catalog enable row level security;
drop policy if exists product_catalog_no_public_access on public.product_catalog;
create policy product_catalog_no_public_access on public.product_catalog for select to authenticated using (false);

grant usage on schema public to service_role;
grant all privileges on public.product_catalog to service_role;
grant all privileges on all sequences in schema public to service_role;

-- 업데이트 시간 트리거
DO $$ BEGIN
  create trigger product_catalog_set_updated_at before update on public.product_catalog for each row execute function public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 기존 뽑기 상품을 상품 보관함에 복사합니다. 이미 같은 이름의 활성 상품이 있으면 추가하지 않습니다.
insert into public.product_catalog(name, description, image_url, color, default_stock, is_inventory_item, is_exchange_material, is_active, sort_order)
select distinct on (lower(r.name))
  r.name,
  r.description,
  r.image_url,
  coalesce(r.color, '#111111'),
  r.stock,
  r.is_inventory_item,
  r.is_exchange_material,
  true,
  r.sort_order
from public.rewards r
where r.name is not null
  and not exists (
    select 1 from public.product_catalog pc
    where lower(pc.name) = lower(r.name)
      and pc.deleted_at is null
  )
order by lower(r.name), r.sort_order, r.created_at;

-- 기존 rewards에 product_catalog_id 연결
update public.rewards r
set product_catalog_id = pc.id
from public.product_catalog pc
where r.product_catalog_id is null
  and lower(r.name) = lower(pc.name)
  and pc.deleted_at is null;

-- 기존의 모든 공개 뽑기를 새 구조로 다시 만들 수 있도록 첫 적용 시 한 번만 화면에서 제거합니다.
do $$
begin
  if not exists(select 1 from public.site_settings where key = 'v1_0_1_operation_redesign_applied') then
    update public.rewards
    set is_active = false,
        probability_units = 0,
        deleted_at = coalesce(deleted_at, now())
    where deleted_at is null;

    update public.draws
    set status = 'ENDED',
        is_public = false,
        deleted_at = coalesce(deleted_at, now())
    where deleted_at is null;

    insert into public.site_settings(key, value, is_public)
    values('v1_0_1_operation_redesign_applied', 'true'::jsonb, false)
    on conflict(key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

-- 사이트 톤 설정
insert into public.site_settings(key, value, is_public) values
  ('site_name', '"Dynamic D"'::jsonb, true),
  ('hero_title', '"Dynamic D - 이벤트 전용 사이트"'::jsonb, true),
  ('hero_description', '"Dynamic에서 주관하는 모든 뽑기(추첨)형 이벤트를 주관하는 사이트. Dynamic D - 누구보다 빠른 본방 입성을 향한 길."'::jsonb, true),
  ('design_reference', '"monochrome_dynamic_ink"'::jsonb, false),
  ('event_live_enabled', 'true'::jsonb, true)
on conflict(key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

-- service_role 권한 보정
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

select
  exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = 'product_catalog') as product_catalog_ready,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'draws' and column_name = 'deleted_at') as draw_delete_ready,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at') as user_delete_ready,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ticket_exchange_rates' and column_name = 'deleted_at') as exchange_rate_delete_ready,
  exists(select 1 from public.site_settings where key = 'v1_0_1_operation_redesign_applied') as old_draws_hidden;
