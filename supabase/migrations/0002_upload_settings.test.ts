import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('upload_settings 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('기본값은 10MB(10485760바이트)다', async () => {
    const { data, error } = await supabase
      .from('upload_settings')
      .select('max_upload_size_bytes')
      .eq('id', 1)
      .single();

    expect(error).toBeNull();
    expect(data?.max_upload_size_bytes).toBe(10485760);
  });

  it('허용되지 않은 값은 저장할 수 없다', async () => {
    const { error } = await supabase
      .from('upload_settings')
      .update({ max_upload_size_bytes: 999 })
      .eq('id', 1);

    expect(error?.message).toMatch(/upload_settings_max_upload_size_bytes_check/);
  });
});
