-- Dynamic Draw v1.0.2 existing-install hotfix
-- Purpose: fix "function digest(text, unknown) does not exist" and gen_random_bytes lookup errors.
-- Safe to run more than once. This script does not delete users, results, settings, or logs.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  v_crypto_schema text;
  v_signature text;
  v_signatures text[] := array[
    'public.append_admin_log(uuid,text,text,uuid,jsonb,text,text)',
    'public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text)',
    'public.execute_draw(uuid,uuid,uuid,uuid,text,text)',
    'public.verify_admin_log_chain()',
    'public.verify_probability_history_chain()'
  ];
  v_digest bytea;
  v_random bytea;
begin
  select n.nspname
    into v_crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_crypto_schema is null then
    raise exception 'pgcrypto extension is not installed.';
  end if;

  -- Verify both cryptographic functions before changing application routines.
  execute format('select %I.digest($1::text, $2::text)', v_crypto_schema)
    into v_digest
    using 'dynamic-draw-v1.0.2', 'sha256';

  execute format('select %I.gen_random_bytes($1)', v_crypto_schema)
    into v_random
    using 4;

  if pg_catalog.octet_length(v_digest) <> 32 then
    raise exception 'pgcrypto digest verification failed.';
  end if;

  if pg_catalog.octet_length(v_random) <> 4 then
    raise exception 'pgcrypto random-byte verification failed.';
  end if;

  execute format('grant usage on schema %I to service_role', v_crypto_schema);

  foreach v_signature in array v_signatures loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Required Dynamic Draw function is missing: %', v_signature;
    end if;

    -- Supabase installs most extensions in the extensions schema. The old
    -- routines only searched public, so digest()/gen_random_bytes() could not
    -- be resolved. Use the actual pgcrypto schema discovered above.
    execute format(
      'alter function %s set search_path = pg_catalog, %I, public',
      v_signature,
      v_crypto_schema
    );
  end loop;
end
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

revoke execute on function public.dynamic_draw_install_status() from public, anon, authenticated;
grant execute on function public.dynamic_draw_install_status() to service_role;

insert into public.site_settings(key, value, is_public)
values ('schema_version', '"1.0.2"'::jsonb, true)
on conflict(key) do update
set value = excluded.value,
    is_public = true,
    updated_at = now();

notify pgrst, 'reload schema';

commit;

-- The final row must show ready=true, pgcrypto_installed=true,
-- hash_functions_fixed=true, and random_function_fixed=true.
with crypto as (
  select n.nspname as schema_name
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto'
), checks as (
  select
    p.proname as function_name,
    pg_catalog.coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') as config
  from pg_catalog.pg_proc p
  where p.oid in (
    pg_catalog.to_regprocedure('public.append_admin_log(uuid,text,text,uuid,jsonb,text,text)'),
    pg_catalog.to_regprocedure('public.admin_update_probabilities(uuid,jsonb,text,uuid,text,text)'),
    pg_catalog.to_regprocedure('public.execute_draw(uuid,uuid,uuid,uuid,text,text)'),
    pg_catalog.to_regprocedure('public.verify_admin_log_chain()'),
    pg_catalog.to_regprocedure('public.verify_probability_history_chain()')
  )
)
select
  exists(select 1 from public.draws) as ready,
  exists(select 1 from crypto) as pgcrypto_installed,
  (select schema_name from crypto limit 1) as pgcrypto_schema,
  (
    select count(*) = 4
    from checks, crypto
    where function_name <> 'execute_draw'
      and config like '%' || crypto.schema_name || '%'
  ) as hash_functions_fixed,
  (
    select count(*) = 1
    from checks, crypto
    where function_name = 'execute_draw'
      and config like '%' || crypto.schema_name || '%'
  ) as random_function_fixed;
