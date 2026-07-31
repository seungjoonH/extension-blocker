import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('add_custom_extension RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자를 등록한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    expect(error).toBeNull();
    expect(data.result).toBe('custom_created');
    expect(data.name).toBe('sh');
  });

  it('비활성 고정 확장자 이름을 등록하면 자동 활성화한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extension', { p_name: 'exe' });
    expect(error).toBeNull();
    expect(data.result).toBe('fixed_auto_activated');
    expect(data.active).toBe(true);
  });

  it('이미 활성 상태인 고정 확장자는 already_active를 반환한다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    const { data } = await supabase.rpc('add_custom_extension', { p_name: 'exe' });
    expect(data.result).toBe('fixed_already_active');
  });

  it('이미 등록된 커스텀 확장자는 DUPLICATE_EXTENSION 예외를 던진다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    const { error } = await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    expect(error?.message).toMatch(/DUPLICATE_EXTENSION/);
  });

  it('형식이 잘못된 이름은 INVALID_EXTENSION_NAME 예외를 던진다', async () => {
    const { error } = await supabase.rpc('add_custom_extension', { p_name: 'MY EXT' });
    expect(error?.message).toMatch(/INVALID_EXTENSION_NAME/);
  });

  it('동시에 같은 이름을 추가하면 하나만 성공한다', async () => {
    const results = await Promise.allSettled([
      supabase.rpc('add_custom_extension', { p_name: 'race' }),
      supabase.rpc('add_custom_extension', { p_name: 'race' }),
    ]);

    const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    const successes = outcomes.filter((r) => r && !r.error);
    const duplicates = outcomes.filter((r) => r?.error?.message?.includes('DUPLICATE_EXTENSION'));

    expect(successes).toHaveLength(1);
    expect(duplicates).toHaveLength(1);
  });

  it('전역 잠금이 서로 다른 이름의 동시 요청에서도 200개 제한을 정확히 지킨다', async () => {
    // 199개를 미리 채워 200개 경계 바로 앞 상태를 만든다(RPC 대신 직접 insert로 빠르게 시드)
    const seedRows = Array.from({ length: 199 }, (_, i) => ({
      name: `seed${i}`,
      kind: 'custom' as const,
      active: true,
    }));
    await supabase.from('extension_policy').insert(seedRows);

    // 서로 다른 이름 5개를 동시에 추가 시도 — 이름이 겹치지 않으므로
    // 잠금이 이름별이 아니라 테이블 전체에 걸린 전역 잠금이어야만 200개를 넘기지 않는다
    const raceNames = ['racea', 'raceb', 'racec', 'raced', 'racee'];
    await Promise.allSettled(
      raceNames.map((name) => supabase.rpc('add_custom_extension', { p_name: name })),
    );

    const { count } = await supabase
      .from('extension_policy')
      .select('*', { count: 'exact', head: true })
      .eq('kind', 'custom');

    expect(count).toBe(200);
  });
});
