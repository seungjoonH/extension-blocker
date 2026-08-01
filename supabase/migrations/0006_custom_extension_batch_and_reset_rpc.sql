create type add_custom_extensions_batch_result as (
  added                   text[],
  fixed_activated         text[],
  skipped_existing_count  integer
);

create or replace function add_custom_extensions_batch(p_names text[])
returns add_custom_extensions_batch_result
language plpgsql
as $$
declare
  v_name            text;
  v_existing        extension_policy;
  v_added           text[] := '{}';
  v_fixed_activated text[] := '{}';
  v_skipped_count   integer := 0;
  v_distinct_names  text[];
begin
  if p_names is null or array_length(p_names, 1) is null then
    raise exception using errcode = 'P0001', message = 'EMPTY_BATCH';
  end if;

  select array_agg(distinct name) into v_distinct_names from unnest(p_names) as name;

  -- 형식 검증은 잠금 밖에서 먼저 끝낸다(add_custom_extension과 동일한 순서 —
  -- 잠금을 오래 붙들지 않기 위함).
  foreach v_name in array v_distinct_names loop
    if v_name is null
       or v_name <> lower(v_name)
       or char_length(v_name) < 1
       or char_length(v_name) > 20
       or v_name !~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
    then
      raise exception using errcode = 'P0001', message = 'INVALID_EXTENSION_NAME';
    end if;
  end loop;

  -- add_custom_extension(단일 등록)과 동일한 키를 공유해야 한다. 다른 키를 쓰면
  -- 단일 등록과 배치 등록이 동시에 들어올 때 200개 제한이 깨질 수 있다.
  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  foreach v_name in array v_distinct_names loop
    select * into v_existing from extension_policy where name = v_name;

    if found then
      if v_existing.kind = 'fixed' then
        update extension_policy
        set active = true
        where id = v_existing.id and active = false;

        if found then
          v_fixed_activated := array_append(v_fixed_activated, v_name);
        else
          v_skipped_count := v_skipped_count + 1;
        end if;
      else
        -- 이미 등록된 커스텀 확장자 — 오류가 아니라 조용히 건너뛴다
        -- (설계 문서 2절: 배치 모드의 기존 커스텀 중복 처리는 단일 모드와 다르다).
        v_skipped_count := v_skipped_count + 1;
      end if;
    else
      if (select count(*) from extension_policy where kind = 'custom') >= 200 then
        raise exception using errcode = 'P0001', message = 'CUSTOM_EXTENSION_LIMIT_EXCEEDED';
      end if;

      insert into extension_policy (name, kind, active) values (v_name, 'custom', true);
      v_added := array_append(v_added, v_name);
    end if;
  end loop;

  return row(v_added, v_fixed_activated, v_skipped_count)::add_custom_extensions_batch_result;
end;
$$;

revoke execute on function add_custom_extensions_batch(text[]) from public, anon, authenticated;
grant execute on function add_custom_extensions_batch(text[]) to service_role;

create type reset_extension_policy_result as (
  deleted_custom_count     integer,
  deactivated_fixed_count  integer
);

create or replace function reset_extension_policy()
returns reset_extension_policy_result
language plpgsql
as $$
declare
  v_deleted_count      integer;
  v_deactivated_count  integer;
begin
  -- 배치/단일 등록과 같은 잠금을 공유해, 초기화 도중 등록 요청이 끼어들어 생기는
  -- 혼란스러운 인터리빙을 피한다(설계 문서 5절).
  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  with deleted as (
    delete from extension_policy where kind = 'custom' returning 1
  )
  select count(*) into v_deleted_count from deleted;

  with deactivated as (
    update extension_policy set active = false where kind = 'fixed' and active = true returning 1
  )
  select count(*) into v_deactivated_count from deactivated;

  return row(v_deleted_count, v_deactivated_count)::reset_extension_policy_result;
end;
$$;

revoke execute on function reset_extension_policy() from public, anon, authenticated;
grant execute on function reset_extension_policy() to service_role;
