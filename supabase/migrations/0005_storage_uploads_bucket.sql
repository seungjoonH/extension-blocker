-- Supabase Storage 버킷을 애플리케이션 코드가 아닌 마이그레이션으로 생성해
-- 로컬/프로덕션 어디서든 `supabase migration up`만으로 동일하게 재현되게 한다.
-- uploads 버킷은 비공개(public=false)이며, 접근은 항상 service_role 클라이언트를
-- 통해서만 이루어진다(docs/specs/DESIGN.md 2절, 3.4절).
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;
