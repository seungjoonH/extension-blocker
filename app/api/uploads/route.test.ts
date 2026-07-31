import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/uploads 요청 형식', () => {
  it('file 필드가 실제 파일이 아니면 FILE_REQUIRED로 거부한다', async () => {
    const formData = new FormData();
    formData.append('file', 'not-a-file');
    const request = new Request('http://localhost/api/uploads', { method: 'POST', body: formData });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('FILE_REQUIRED');
  });
});
