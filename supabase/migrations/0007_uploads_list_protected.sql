-- 업로드 목록 조회와 보호 시드를 위한 컬럼/권한
alter table uploads
  add column is_protected boolean not null default false;

grant select on uploads to service_role;
