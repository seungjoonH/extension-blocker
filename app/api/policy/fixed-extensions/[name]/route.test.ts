import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PATCH } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('PATCH /api/policy/fixed-extensions/[name]', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('고정 확장자를 활성화한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/exe', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'exe' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ name: 'exe', active: true });
  });

  it('존재하지 않는 고정 확장자는 404를 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/notreal', {
      method: 'PATCH',
      body: JSON.stringify({ active: true }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'notreal' }) });
    expect(response.status).toBe(404);
  });

  it('JSON으로 파싱할 수 없는 요청 본문은 INVALID_REQUEST_BODY/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/exe', {
      method: 'PATCH',
      body: 'not-json',
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'exe' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('active가 boolean이 아니면 INVALID_REQUEST_BODY/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/fixed-extensions/exe', {
      method: 'PATCH',
      body: JSON.stringify({ active: 'true' }),
    });

    const response = await PATCH(request, { params: Promise.resolve({ name: 'exe' }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });
});
