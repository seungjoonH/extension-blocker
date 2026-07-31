import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clamav/client', () => ({
  pingClamAv: vi.fn(),
}));

import { GET } from './route';
import { pingClamAv } from '@/lib/clamav/client';

describe('GET /api/health', () => {
  it('clamd가 응답하면 200을 반환한다', async () => {
    vi.mocked(pingClamAv).mockResolvedValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it('clamd가 응답하지 않으면 503을 반응한다', async () => {
    vi.mocked(pingClamAv).mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(503);
  });
});
