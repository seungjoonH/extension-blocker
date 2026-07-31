import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePolicy } from './usePolicy';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePolicy', () => {
  it('정책을 불러오면 로딩 상태가 해제된다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ fixedExtensions: [], customExtensions: [], maxUploadSizeBytes: 10485760 })),
    );

    const { result } = renderHook(() => usePolicy());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.policy?.maxUploadSizeBytes).toBe(10485760);
  });

  it('조회가 실패하면 error를 설정한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

    const { result } = renderHook(() => usePolicy());
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
