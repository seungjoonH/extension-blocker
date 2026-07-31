create table upload_settings (
  id                    smallint primary key default 1 check (id = 1),
  max_upload_size_bytes integer not null check (
    max_upload_size_bytes in (1048576, 5242880, 10485760, 20971520, 52428800)
  ),
  updated_at            timestamptz not null default now()
);

insert into upload_settings (id, max_upload_size_bytes) values (1, 10485760);

grant select, update on upload_settings to service_role;
