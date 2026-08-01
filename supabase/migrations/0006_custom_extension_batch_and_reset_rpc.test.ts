import { beforeEach, describe, expect, it } from 'vitest';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('add_custom_extensions_batch RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자 여러 개를 한 번에 등록한다', async () => {
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'bak'] });
    expect(error).toBeNull();
    expect(data.added.sort()).toEqual(['bak', 'sh']);
    expect(data.fixed_activated).toEqual([]);
    expect(data.skipped_existing_count).toBe(0);
  });

  it('비활성 고정 확장자 이름이 섞여 있으면 자동 활성화하고 added에는 포함하지 않는다', async () => {
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['exe', 'sh'] });
    expect(data.added).toEqual(['sh']);
    expect(data.fixed_activated).toEqual(['exe']);

    const { data: fixedRow } = await supabase.from('extension_policy').select('active').eq('name', 'exe').single();
    expect(fixedRow?.active).toBe(true);
  });

  it('이미 활성 상태인 고정 확장자는 skipped_existing_count에 포함되고 fixed_activated에는 없다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['exe'] });
    expect(data.fixed_activated).toEqual([]);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('이미 등록된 커스텀 확장자는 조용히 제외하고 나머지만 등록한다(오류 아님)', async () => {
    await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh'] });
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'bak'] });
    expect(error).toBeNull();
    expect(data.added).toEqual(['bak']);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('입력 내부 중복은 하나로 처리한다', async () => {
    const { data } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'sh'] });
    expect(data.added).toEqual(['sh']);
  });

  it('신규 커스텀이 0개여도 성공 처리한다(모두 기존 중복이거나 고정 자동 활성화)', async () => {
    await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh'] });
    const { data, error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'exe'] });
    expect(error).toBeNull();
    expect(data.added).toEqual([]);
    expect(data.fixed_activated).toEqual(['exe']);
    expect(data.skipped_existing_count).toBe(1);
  });

  it('형식이 잘못된 이름이 하나라도 있으면 전체 실패하고 유효한 이름도 저장되지 않는다', async () => {
    const { error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['sh', 'MY EXT'] });
    expect(error?.message).toMatch(/INVALID_EXTENSION_NAME/);

    const { data: shRow } = await supabase.from('extension_policy').select('id').eq('name', 'sh').maybeSingle();
    expect(shRow).toBeNull();
  });

  it('처리 후 200개를 초과하면 전체 롤백된다', async () => {
    const seedRows = Array.from({ length: 199 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    const { error } = await supabase.rpc('add_custom_extensions_batch', { p_names: ['new1', 'new2'] });
    expect(error?.message).toMatch(/CUSTOM_EXTENSION_LIMIT_EXCEEDED/);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBe(199);
  });

  it('단일 등록 RPC와 같은 advisory lock을 공유해 동시 요청에서도 200개 제한을 지킨다', async () => {
    const seedRows = Array.from({ length: 198 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    await Promise.allSettled([
      supabase.rpc('add_custom_extensions_batch', { p_names: ['batcha', 'batchb'] }),
      supabase.rpc('add_custom_extension', { p_name: 'singlec' }),
    ]);

    const { count } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(count).toBeLessThanOrEqual(200);
  });
});

describe('reset_extension_policy RPC', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('커스텀 확장자를 모두 삭제하고 고정 확장자를 모두 비활성화한다', async () => {
    await supabase.rpc('add_custom_extension', { p_name: 'sh' });
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');

    const { data, error } = await supabase.rpc('reset_extension_policy');
    expect(error).toBeNull();
    expect(data.deleted_custom_count).toBe(1);
    expect(data.deactivated_fixed_count).toBe(1);

    const { count: customCount } = await supabase.from('extension_policy').select('*', { count: 'exact', head: true }).eq('kind', 'custom');
    expect(customCount).toBe(0);

    const { data: fixedRows } = await supabase.from('extension_policy').select('active').eq('kind', 'fixed');
    expect(fixedRows?.every((row) => row.active === false)).toBe(true);
  });

  it('업로드 최대 크기 정책은 건드리지 않는다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 20971520 }).eq('id', 1);
    await supabase.rpc('reset_extension_policy');

    const { data } = await supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single();
    expect(data?.max_upload_size_bytes).toBe(20971520);

    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('이미 모두 비활성/비어 있는 상태에서도 오류 없이 0을 반환한다', async () => {
    const { data, error } = await supabase.rpc('reset_extension_policy');
    expect(error).toBeNull();
    expect(data.deleted_custom_count).toBe(0);
    expect(data.deactivated_fixed_count).toBe(0);
  });
});
