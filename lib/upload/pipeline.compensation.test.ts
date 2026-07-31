import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clamav/client', () => ({ scanFile: vi.fn() }));
vi.mock('@/lib/upload/storage', () => ({ saveToStorage: vi.fn(), deleteFromStorage: vi.fn() }));
vi.mock('@/lib/logging/logger', () => ({ logUploadResult: vi.fn() }));
vi.mock('@/lib/supabase/server-client', () => ({ createServiceRoleClient: vi.fn() }));

import { runUploadPipeline } from './pipeline';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage, deleteFromStorage } from '@/lib/upload/storage';
import { logUploadResult } from '@/lib/logging/logger';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function makeFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type });
}

function makeSupabaseStub(overrides: { extensionPolicyError?: boolean; insertError?: boolean } = {}) {
  return {
    from: (table: string) => {
      if (table === 'extension_policy') {
        return {
          select: () => ({
            eq: () =>
              overrides.extensionPolicyError
                ? Promise.resolve({ data: null, error: { message: 'db down' } })
                : Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'upload_settings') {
        return {
          select: () => ({
            eq: () => ({ single: () => Promise.resolve({ data: { max_upload_size_bytes: 10485760 }, error: null }) }),
          }),
        };
      }
      if (table === 'uploads') {
        return {
          insert: () =>
            overrides.insertError
              ? Promise.resolve({ error: { message: 'insert failed' } })
              : Promise.resolve({ error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('runUploadPipeline 보상 흐름과 정책 조회 실패', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scanFile).mockResolvedValue({ isInfected: false });
  });

  it('정책 조회 자체가 실패하면 검증을 건너뛰지 않고 INTERNAL_ERROR로 거부한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(makeSupabaseStub({ extensionPolicyError: true }) as any);

    await expect(
      runUploadPipeline({ file: makeFile('safe.txt', 'data'), requestId: 'req-policy-fail' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

    expect(saveToStorage).not.toHaveBeenCalled();
  });

  it('메타데이터 저장 실패 시 같은 id로 Storage 객체를 삭제하고 METADATA_SAVE_FAILED로 응답한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(makeSupabaseStub({ insertError: true }) as any);
    vi.mocked(saveToStorage).mockResolvedValue(undefined);
    vi.mocked(deleteFromStorage).mockResolvedValue({ ok: true });

    await expect(
      runUploadPipeline({ file: makeFile('doc.txt', 'data'), requestId: 'req-meta-fail' }),
    ).rejects.toMatchObject({ code: 'METADATA_SAVE_FAILED' });

    const savedId = vi.mocked(saveToStorage).mock.calls[0][0];
    expect(deleteFromStorage).toHaveBeenCalledWith(savedId);
    expect(logUploadResult).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'METADATA_SAVE_FAILED', cleanupResult: 'SUCCESS', cleanupErrorCode: null }),
    );
  });

  it('보상 삭제까지 실패하면 cleanupResult를 FAILED로 기록한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(makeSupabaseStub({ insertError: true }) as any);
    vi.mocked(saveToStorage).mockResolvedValue(undefined);
    vi.mocked(deleteFromStorage).mockResolvedValue({ ok: false });

    await expect(
      runUploadPipeline({ file: makeFile('doc2.txt', 'data'), requestId: 'req-meta-fail-2' }),
    ).rejects.toMatchObject({ code: 'METADATA_SAVE_FAILED' });

    expect(logUploadResult).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupResult: 'FAILED', cleanupErrorCode: 'STORAGE_DELETE_FAILED' }),
    );
  });

  it('보상 삭제가 예외를 던져도 METADATA_SAVE_FAILED로 응답하고 FAILED로 기록한다', async () => {
    vi.mocked(createServiceRoleClient).mockReturnValue(makeSupabaseStub({ insertError: true }) as any);
    vi.mocked(saveToStorage).mockResolvedValue(undefined);
    vi.mocked(deleteFromStorage).mockRejectedValue(new Error('network error'));

    await expect(
      runUploadPipeline({ file: makeFile('doc3.txt', 'data'), requestId: 'req-meta-fail-3' }),
    ).rejects.toMatchObject({ code: 'METADATA_SAVE_FAILED' });

    expect(logUploadResult).toHaveBeenCalledWith(
      expect.objectContaining({ cleanupResult: 'FAILED', cleanupErrorCode: 'STORAGE_DELETE_FAILED' }),
    );
  });
});
