create table uploads (
  id                    uuid primary key default gen_random_uuid(),
  original_filename     text not null,
  normalized_extension  text,
  declared_mime_type    text,
  file_size_bytes       bigint not null,
  created_at            timestamptz not null default now(),

  constraint uploads_declared_mime_type_length check (
    declared_mime_type is null or char_length(declared_mime_type) <= 255
  ),
  constraint uploads_file_size_bytes_non_negative check (file_size_bytes >= 0)
);

grant insert, delete on uploads to service_role;
