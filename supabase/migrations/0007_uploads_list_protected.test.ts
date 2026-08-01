import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('0007_uploads_list_protected', () => {
  it('is_protected 컬럼이 있고 service_role로 select할 수 있다', async () => {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from('uploads').select('id, is_protected').limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });
});
