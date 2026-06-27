-- Dynamic Draw v1.0.3 기존 설치 보정 SQL
-- 사용자·관리자·결과·설정 데이터는 삭제하지 않습니다.
-- 기존 v1.0.2에서 발생한 env 파일 불일치, pgcrypto 검색 경로, 임시 감사 검증 함수 문제를 보정합니다.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.dynamic_draw_digest(p_data text, p_algorithm text)
returns bytea
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_crypto_schema text;
  v_result bytea;
begin
  select n.nspname
    into v_crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_crypto_schema is null then
    raise exception 'pgcrypto extension is not installed.';
  end if;

  execute format('select %I.digest($1::text, $2::text)', v_crypto_schema)
    into v_result
    using p_data, p_algorithm;

  return v_result;
end;
$$;

create or replace function public.dynamic_draw_random_bytes(p_length integer)
returns bytea
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_crypto_schema text;
  v_result bytea;
begin
  if p_length < 1 or p_length > 1024 then
    raise exception 'random byte length is out of range.';
  end if;

  select n.nspname
    into v_crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_crypto_schema is null then
    raise exception 'pgcrypto extension is not installed.';
  end if;

  execute format('select %I.gen_random_bytes($1)', v_crypto_schema)
    into v_result
    using p_length;

  return v_result;
end;
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
  v_entry_hash := encode(public.dynamic_draw_digest(
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
  v_entry_hash := encode(public.dynamic_draw_digest(
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
    v_bytes := public.dynamic_draw_random_bytes(4);
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
    v_expected_hash := encode(public.dynamic_draw_digest(
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
    v_expected_hash := encode(public.dynamic_draw_digest(
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

create or replace function public.dynamic_draw_install_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, extensions, public
as $$
  select jsonb_build_object(
    'ready', true,
    'schemaVersion', '1.0.3',
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

-- 서버 전용 권한을 다시 정렬합니다.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

revoke execute on function public.dynamic_draw_digest(text,text) from public, anon, authenticated;
revoke execute on function public.dynamic_draw_random_bytes(integer) from public, anon, authenticated;
revoke execute on function public.dynamic_draw_install_status() from public, anon, authenticated;
revoke execute on function public.append_admin_log(uuid,text,text,uuid,jsonb,text,text) from public, anon, authenticated;
revoke execute on function public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.execute_draw(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.verify_admin_log_chain() from public, anon, authenticated;
revoke execute on function public.verify_probability_history_chain() from public, anon, authenticated;

grant execute on function public.dynamic_draw_digest(text,text) to service_role;
grant execute on function public.dynamic_draw_random_bytes(integer) to service_role;
grant execute on function public.dynamic_draw_install_status() to service_role;
grant execute on function public.append_admin_log(uuid,text,text,uuid,jsonb,text,text) to service_role;
grant execute on function public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text) to service_role;
grant execute on function public.execute_draw(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.verify_admin_log_chain() to service_role;
grant execute on function public.verify_probability_history_chain() to service_role;

-- 이전 테스트 중 남은 요청 제한만 초기화합니다. 회원·결과 데이터에는 영향이 없습니다.
delete from public.rate_limits;

insert into public.site_settings(key, value, is_public)
values ('schema_version', '"1.0.3"'::jsonb, true)
on conflict(key) do update
set value = excluded.value,
    is_public = true,
    updated_at = now();

notify pgrst, 'reload schema';

commit;

-- 아래 한 줄의 결과에서 patch_applied, ready, digest_ready, random_ready가 모두 true면 성공입니다.
select
  true as patch_applied,
  exists(select 1 from public.draws) as ready,
  pg_catalog.octet_length(public.dynamic_draw_digest('dynamic-draw-v1.0.3', 'sha256')) = 32 as digest_ready,
  pg_catalog.octet_length(public.dynamic_draw_random_bytes(4)) = 4 as random_ready,
  has_table_privilege('service_role', 'public.profiles', 'SELECT') as service_role_can_read,
  public.verify_admin_log_chain() as admin_log_chain,
  public.verify_probability_history_chain() as probability_history_chain;
