import { describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('extension_policy 마이그레이션', () => {
  const supabase = createServiceRoleClient();

  it('시드된 7개 고정 확장자가 모두 비활성 상태다', async () => {
    const { data, error } = await supabase
      .from('extension_policy')
      .select('name, kind, active')
      .eq('kind', 'fixed')
      .order('name');

    expect(error).toBeNull();
    expect(data).toHaveLength(7);
    expect(data?.every((row) => row.active === false)).toBe(true);
  });

  it('커스텀 확장자는 active=false로 저장할 수 없다', async () => {
    const { error } = await supabase
      .from('extension_policy')
      .insert({ name: 'zzz-test', kind: 'custom', active: false });

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/extension_policy_custom_always_active/);
  });

  it('같은 name을 두 번 등록할 수 없다', async () => {
    await supabase.from('extension_policy').insert({ name: 'dup-test', kind: 'custom' });
    const { error } = await supabase
      .from('extension_policy')
      .insert({ name: 'dup-test', kind: 'custom' });

    expect(error?.message).toMatch(/extension_policy_name_key/);
    await supabase.from('extension_policy').delete().eq('name', 'dup-test');
  });
});
