create type add_custom_extension_result as (
  result  text,
  id      uuid,
  name    text,
  active  boolean
);

create or replace function add_custom_extension(p_name text)
returns add_custom_extension_result
language plpgsql
as $$
declare
  v_existing extension_policy;
  v_new      extension_policy;
begin
  if p_name is null
     or p_name <> lower(p_name)
     or char_length(p_name) < 1
     or char_length(p_name) > 20
     or p_name !~ '^[a-z0-9]+(\.[a-z0-9]+)*$'
  then
    raise exception using errcode = 'P0001', message = 'INVALID_EXTENSION_NAME';
  end if;

  perform pg_advisory_xact_lock(hashtext('extension_policy_custom_add'));

  select * into v_existing from extension_policy where name = p_name;

  if found then
    if v_existing.kind = 'fixed' then
      update extension_policy
      set active = true
      where id = v_existing.id and active = false
      returning * into v_existing;

      if found then
        return row('fixed_auto_activated', v_existing.id, v_existing.name, v_existing.active)::add_custom_extension_result;
      end if;

      select * into v_existing from extension_policy where name = p_name;
      return row('fixed_already_active', v_existing.id, v_existing.name, v_existing.active)::add_custom_extension_result;
    else
      raise exception using errcode = 'P0001', message = 'DUPLICATE_EXTENSION';
    end if;
  end if;

  if (select count(*) from extension_policy where kind = 'custom') >= 200 then
    raise exception using errcode = 'P0001', message = 'CUSTOM_EXTENSION_LIMIT_EXCEEDED';
  end if;

  insert into extension_policy (name, kind, active)
  values (p_name, 'custom', true)
  returning * into v_new;

  return row('custom_created', v_new.id, v_new.name, v_new.active)::add_custom_extension_result;
end;
$$;

revoke execute on function add_custom_extension(text) from public, anon, authenticated;
grant execute on function add_custom_extension(text) to service_role;
