import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('POST /api/policy/reset', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화한 뒤 개수를 반환한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deletedCustomCount).toBe(1);
    expect(body.deactivatedFixedCount).toBe(1);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBe(0);
  });

  it('업로드 최대 크기 정책은 응답에도 DB에도 영향을 주지 않는다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 20971520 }).eq('id', 1);

    await POST();

    const { data } = await supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single();
    expect(data?.max_upload_size_bytes).toBe(20971520);

    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });
});
