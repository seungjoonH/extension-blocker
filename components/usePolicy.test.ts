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

  it('초기 로드 이후 refetch를 호출해도 isLoading이 다시 true로 바뀌지 않는다', async () => {
    let resolveSecondFetch!: (response: Response) => void;
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ fixedExtensions: [], customExtensions: [], maxUploadSizeBytes: 10485760 })),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecondFetch = resolve;
          }),
      );

    const { result } = renderHook(() => usePolicy());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const refetchPromise = result.current.refetch();
    expect(result.current.isLoading).toBe(false);

    resolveSecondFetch(
      new Response(JSON.stringify({ fixedExtensions: [], customExtensions: [], maxUploadSizeBytes: 20971520 })),
    );
    await refetchPromise;

    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
