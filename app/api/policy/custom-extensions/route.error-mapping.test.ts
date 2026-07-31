import { beforeEach, describe, expect, it, vi } from 'vitest';

// route.test.ts는 실제 로컬 Supabase에 대한 통합 테스트다. 여기서 다루는
// 23505(유니크 제약 위반)와 RPC의 방어적 INVALID_EXTENSION_NAME 거부는
// add_custom_extension RPC를 우회하는 예외적인 동시성 경로에서만 발생하므로
// 실제 Postgres 경쟁 상태를 재현하는 대신 Supabase 클라이언트를 모킹해
// 오류 매핑 로직만 검증한다(DESIGN.md §5.2, §7 테스트 전략).
vi.mock('@/lib/supabase/server-client', () => ({ createServiceRoleClient: vi.fn() }));

import { POST } from './route';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function postRequest(name: string) {
  return new Request('http://localhost/api/policy/custom-extensions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

function makeSupabaseStub(rpcError: { message: string; code?: string }) {
  return {
    rpc: () => Promise.resolve({ data: null, error: rpcError }),
  };
}

describe('POST /api/policy/custom-extensions 오류 매핑', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Postgres 23505(유니크 제약 위반)는 DUPLICATE_EXTENSION/409로 매핑한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      makeSupabaseStub({ message: 'duplicate key value violates unique constraint', code: '23505' }) as any,
    );

    const response = await POST(postRequest('sh'));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe('DUPLICATE_EXTENSION');
  });

  it('RPC의 방어적 INVALID_EXTENSION_NAME 거부는 INVALID_EXTENSION_FORMAT/400으로 매핑한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      makeSupabaseStub({ message: 'INVALID_EXTENSION_NAME', code: 'P0001' }) as any,
    );

    const response = await POST(postRequest('sh'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_EXTENSION_FORMAT');
  });

  it('그 외 알 수 없는 오류는 기존처럼 INTERNAL_ERROR/500으로 응답한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(
      makeSupabaseStub({ message: 'connection reset', code: '08006' }) as any,
    );

    const response = await POST(postRequest('sh'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
