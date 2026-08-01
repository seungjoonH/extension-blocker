import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/policy/custom-extensions/batch', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/policy/custom-extensions/batch', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('여러 개를 한 번에 등록하고 요약을 200으로 반환한다', async () => {
    const response = await POST(postRequest({ items: ['exe', 'sh', 'bak'] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.added.sort()).toEqual(['bak', 'sh']);
    expect(body.fixedActivated).toEqual(['exe']);
    expect(body.skippedExistingCount).toBe(0);
  });

  it('형식 오류 항목이 있으면 400과 함께 문제 항목 전체를 반환하고 아무것도 저장하지 않는다', async () => {
    const response = await POST(postRequest({ items: ['sh', 'my-ext'] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_ITEMS');
    expect(body.error.invalidItems).toEqual(['my-ext']);

    const { data } = await supabase.from('extension_policy').select('id').eq('name', 'sh').maybeSingle();
    expect(data).toBeNull();
  });

  it('처리 후 200개를 초과하면 409를 반환한다', async () => {
    const seedRows = Array.from({ length: 199 }, (_, i) => ({ name: `seed${i}`, kind: 'custom' as const, active: true }));
    await supabase.from('extension_policy').insert(seedRows);

    const response = await POST(postRequest({ items: ['new1', 'new2'] }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('LIMIT_EXCEEDED');
  });

  it('items가 빈 배열이면 400을 반환한다', async () => {
    const response = await POST(postRequest({ items: [] }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('items가 문자열 배열이 아니면 400을 반환한다', async () => {
    const response = await POST(postRequest({ items: 'exe,pdf' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('JSON으로 파싱할 수 없는 요청 본문은 400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions/batch', {
      method: 'POST',
      body: 'not-json',
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
