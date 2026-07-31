import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('GET /api/policy', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
  });

  it('고정 확장자, 커스텀 확장자, 업로드 크기를 함께 반환한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fixedExtensions).toHaveLength(7);
    expect(body.customExtensions.some((e: { name: string }) => e.name === 'sh')).toBe(true);
    expect(body.maxUploadSizeBytes).toBe(10485760);
  });
});
