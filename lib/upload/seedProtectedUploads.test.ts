import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { ensureProtectedUploads, PROTECTED_UPLOAD_SEEDS } from './seedProtectedUploads';

describe('ensureProtectedUploads', () => {
  it('보호 시드 4개를 생성하고 두 번 호출해도 개수가 늘지 않는다', async () => {
    await ensureProtectedUploads();
    await ensureProtectedUploads();

    const supabase = createServiceRoleClient();
    const ids = PROTECTED_UPLOAD_SEEDS.map((s) => s.id);
    const { data, error } = await supabase.from('uploads').select('id, is_protected, original_filename').in('id', ids);
    expect(error).toBeNull();
    expect(data).toHaveLength(4);
    expect(data?.every((row) => row.is_protected)).toBe(true);
    expect(data?.map((row) => row.original_filename).sort()).toEqual(
      [...PROTECTED_UPLOAD_SEEDS.map((s) => s.originalFilename)].sort(),
    );
  });
});
