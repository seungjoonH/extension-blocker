create table extension_policy (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint extension_policy_name_key unique (name),
  constraint extension_policy_kind_check check (kind in ('fixed', 'custom')),
  constraint extension_policy_custom_always_active check (kind = 'fixed' or active = true)
);

grant select, insert, update, delete on extension_policy to service_role;

insert into extension_policy (name, kind, active) values
  ('bat','fixed',false), ('cmd','fixed',false), ('com','fixed',false),
  ('cpl','fixed',false), ('exe','fixed',false), ('scr','fixed',false), ('js','fixed',false);
