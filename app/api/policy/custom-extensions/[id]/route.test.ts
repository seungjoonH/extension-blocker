import { describe, expect, it } from 'vitest';
import { DELETE } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('DELETE /api/policy/custom-extensions/[id]', () => {
  const supabase = createServiceRoleClient();

  it('존재하는 커스텀 확장자를 삭제하고 204를 반환한다', async () => {
    const { data } = await supabase.rpc('add_custom_extension', { p_name: 'delme' });
    const request = new Request(`http://localhost/api/policy/custom-extensions/${data.id}`, { method: 'DELETE' });

    const response = await DELETE(request, { params: Promise.resolve({ id: data.id }) });
    expect(response.status).toBe(204);

    const { data: remaining } = await supabase.from('extension_policy').select('id').eq('id', data.id);
    expect(remaining).toHaveLength(0);
  });

  it('이미 삭제된 id를 다시 삭제해도 204를 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(response.status).toBe(204);
  });
});
