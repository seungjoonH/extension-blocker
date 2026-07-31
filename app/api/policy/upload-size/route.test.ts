import { afterEach, describe, expect, it } from 'vitest';
import { PUT } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

describe('PUT /api/policy/upload-size', () => {
  const supabase = createServiceRoleClient();

  afterEach(async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('허용된 값으로 변경한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: 20971520 }),
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.maxUploadSizeBytes).toBe(20971520);
  });

  it('허용되지 않은 값은 400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: 999 }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
  });

  it('JSON으로 파싱할 수 없는 요청 본문은 INVALID_REQUEST_BODY/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: 'not-json',
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST_BODY');
  });

  it('maxUploadSizeBytes가 숫자가 아니면 INVALID_UPLOAD_SIZE/400을 반환한다', async () => {
    const request = new Request('http://localhost/api/policy/upload-size', {
      method: 'PUT',
      body: JSON.stringify({ maxUploadSizeBytes: '20971520' }),
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_UPLOAD_SIZE');
  });
});
