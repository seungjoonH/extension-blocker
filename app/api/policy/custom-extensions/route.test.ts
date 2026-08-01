import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function postRequest(name: string) {
  return new Request('http://localhost/api/policy/custom-extensions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

describe('POST /api/policy/custom-extensions', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  afterEach(async () => {
    await supabase.from('extension_policy').delete().eq('kind', 'custom');
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
  });

  it('새 커스텀 확장자를 201로 등록한다', async () => {
    const response = await POST(postRequest('sh'));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.result).toBe('custom_created');
    expect(body.customExtension.name).toBe('sh');
  });

  it('형식이 잘못된 입력은 400을 반환한다', async () => {
    const response = await POST(postRequest('my-ext'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_EXTENSION_FORMAT');
    expect(body.error.message).toBe('허용되지 않는 형식의 확장자입니다.');
  });

  it('연속된 마침표가 포함된 입력은 전용 메시지와 함께 400을 반환한다', async () => {
    const response = await POST(postRequest('tar..gz'));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_EXTENSION_FORMAT');
    expect(body.error.message).toBe('연속된 마침표는 사용할 수 없습니다.');
  });

  it('고정 확장자와 같은 값은 자동 활성화하고 200을 반환한다', async () => {
    const response = await POST(postRequest('exe'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toBe('fixed_auto_activated');
  });

  it('이미 활성 상태인 고정 확장자는 already_active를 반환한다', async () => {
    await POST(postRequest('exe'));
    const response = await POST(postRequest('exe'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toBe('fixed_already_active');
  });

  it('중복 등록은 409를 반환한다', async () => {
    await POST(postRequest('sh'));
    const response = await POST(postRequest('sh'));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('DUPLICATE_EXTENSION');
  });

  it('JSON으로 파싱할 수 없는 요청 본문은 INVALID_REQUEST_BODY/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions', {
      method: 'POST',
      body: 'not-json',
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('name이 문자열이 아니면 INVALID_REQUEST_BODY/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/custom-extensions', {
      method: 'POST',
      body: JSON.stringify({ name: 123 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });
});
