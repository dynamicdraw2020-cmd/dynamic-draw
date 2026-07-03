-- 𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 v1.0.1 퇴근 패치 DB 보정
-- 공개 문구 교체, 기본 안내 정리, 라이브 연동 보정, 버전 표기 고정

create extension if not exists pgcrypto with schema extensions;

-- 사이트 전역 문구를 요청 문구로 고정
insert into public.site_settings(key, value, is_public) values
  ('site_name', '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃"'::jsonb, true),
  ('hero_title', '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃"'::jsonb, true),
  ('hero_description', '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server"'::jsonb, true),
  ('dynamic_draw_schema_version', '"v1.0.1"'::jsonb, false)
on conflict(key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

-- 내가 넣었던 테스트/예시 공지는 제거
-- 사용자가 직접 등록한 공지는 title이 아래 기본값과 정확히 일치하지 않으면 건드리지 않음
delete from public.notices
where title in (
  '홈페이지 테스트 및 관리 안내.',
  '홈페이지 테스트 및 관리 안내',
  'Dynamic D 공식 채널 안내',
  '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 공식 채널 안내',
  '운영 안내'
);

-- 기본 이벤트 안내 문구 정리
update public.events
set
  title = replace(replace(title, 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
  summary = case
    when slug = 'dynamic-d-event' then '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 Event server'
    else replace(replace(coalesce(summary, ''), 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜')
  end,
  body = case
    when slug = 'dynamic-d-event' then '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 제공'
    else replace(replace(coalesce(body, ''), 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜')
  end,
  updated_at = now()
where title like '%Dynamic%' or coalesce(summary, '') like '%Dynamic%' or coalesce(body, '') like '%Dynamic%' or slug = 'dynamic-d-event';

-- Dynamic 문구가 들어간 상품/뽑기명을 스타일 표기로 보정
update public.draws
set name = replace(replace(name, 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    description = replace(replace(coalesce(description, ''), 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    updated_at = now()
where name like '%Dynamic%' or coalesce(description, '') like '%Dynamic%';

update public.rewards
set name = replace(replace(name, 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    description = replace(replace(coalesce(description, ''), 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    updated_at = now()
where name like '%Dynamic%' or coalesce(description, '') like '%Dynamic%';

update public.product_catalog
set name = replace(replace(name, 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    description = replace(replace(coalesce(description, ''), 'Dynamic D', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃'), 'Dynamic', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜'),
    updated_at = now()
where name like '%Dynamic%' or coalesce(description, '') like '%Dynamic%';

-- Supabase Realtime 연동 보정: 라이브 화면/대시보드가 draw, reward, raffle 변경을 새로고침할 수 있게 함
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.live_events; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.raffle_events; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.draws; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.rewards; exception when duplicate_object then null; end;
  end if;
end $$;

select
  exists(select 1 from public.site_settings where key = 'site_name' and value = '"𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃"'::jsonb) as brand_text_ready,
  exists(select 1 from public.site_settings where key = 'dynamic_draw_schema_version' and value = '"v1.0.1"'::jsonb) as version_fixed,
  exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'raffle_events') as raffle_live_ready,
  not exists(select 1 from public.notices where title in ('홈페이지 테스트 및 관리 안내.', '홈페이지 테스트 및 관리 안내', 'Dynamic D 공식 채널 안내', '𝐃𝐲𝐧𝐚𝐦𝐢𝐜 𝐃 공식 채널 안내', '운영 안내')) as default_notices_removed;
