import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('GET /api/policy', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
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

  it('고정 확장자는 activate 상태와 무관하게 항상 PLANNING.md §5.1 순서(bat, cmd, com, cpl, exe, scr, js)로 반환된다', async () => {
    // active 상태를 알파벳/삽입 순서와 무관한 패턴으로 토글해, 정렬이
    // created_at이나 active 값에 좌우되지 않고 고정된 순서를 유지하는지 검증한다.
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'js');
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'bat');
    await supabase.from('extension_policy').update({ active: false }).eq('name', 'exe');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fixedExtensions.map((e: { name: string }) => e.name)).toEqual([
      'bat',
      'cmd',
      'com',
      'cpl',
      'exe',
      'scr',
      'js',
    ]);
  });
});
