// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DELETE } from './route';
import { ensureProtectedUploads, PROTECTED_UPLOAD_SEEDS } from '@/lib/upload/seedProtectedUploads';

describe('DELETE /api/uploads/[id]', () => {
  it('보호 파일은 403으로 거부한다', async () => {
    await ensureProtectedUploads();
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: PROTECTED_UPLOAD_SEEDS[0].id }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('PROTECTED_UPLOAD');
  });
});
