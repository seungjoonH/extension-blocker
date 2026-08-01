// components/useCustomExtensionsBatch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomExtensionsBatch } from './useCustomExtensionsBatch';

function setup() {
  const onSaveSuccess = vi.fn();
  const onSaveError = vi.fn();
  const onResync = vi.fn();
  const { result } = renderHook(() => useCustomExtensionsBatch({ onSaveSuccess, onSaveError, onResync }));
  return { result, onSaveSuccess, onSaveError, onResync };
}

describe('useCustomExtensionsBatch', () => {
  it('빈 입력이면 canSubmit이 false다', () => {
    const { result } = setup();
    expect(result.current.canSubmit).toBe(false);
  });

  it('쉼표로 구분한 입력을 제출하면 성공 요약 메시지로 토스트를 호출하고 입력값을 초기화한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ added: ['sh', 'bak'], fixedActivated: ['exe'], skippedExistingCount: 0 }), { status: 200 }),
    );
    const { result, onSaveSuccess, onResync } = setup();

    act(() => result.current.setInput('exe,sh,bak'));
    act(() => result.current.handleSubmitText());

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('2개 등록됨');
    expect(onSaveSuccess.mock.calls[0][0]).toContain('exe 활성화됨');
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(result.current.input).toBe('');
  });

  it('형식 오류 항목이 있으면 API 호출 없이 플랫 목록 오류 메시지를 보여준다', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();
    const { result } = setup();

    act(() => result.current.setInput('exe,my-ext,very-long-extension-name'));
    act(() => result.current.handleSubmitText());

    expect(result.current.errorMessage).toBe('올바르지 않은 항목이 있습니다: my-ext, very-long-extension-name');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('extignore.txt 파일을 import하면 줄바꿈 기준으로 파싱해 동일한 파이프라인으로 제출한다', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                new Response(
                  JSON.stringify({ added: ['out', 'txt'], fixedActivated: [], skippedExistingCount: 0 }),
                  { status: 200 },
                ),
              ),
            30,
          );
        }),
    );
    const { result, onSaveSuccess } = setup();

    const file = new File(['out\ntxt'], 'extignore.txt', { type: 'text/plain' });
    act(() => result.current.handleImportFile(file));

    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('2개 등록됨');
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
  });

  it('import 중 형식 오류면 진행 중 상태를 해제하고 인라인 오류를 남긴다', async () => {
    const { result } = setup();
    const file = new File(['ok\nmy-ext'], 'extignore.txt', { type: 'text/plain' });

    act(() => result.current.handleImportFile(file));

    await waitFor(() =>
      expect(result.current.errorMessage).toBe('올바르지 않은 항목이 있습니다: my-ext'),
    );
    expect(result.current.isSubmitting).toBe(false);
  });

  it('신규 커스텀 0개(기존 중복만 있음)여도 성공 메시지를 보여준다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ added: [], fixedActivated: [], skippedExistingCount: 2 }), { status: 200 }),
    );
    const { result, onSaveSuccess } = setup();

    act(() => result.current.setInput('sh,bak'));
    act(() => result.current.handleSubmitText());

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(onSaveSuccess.mock.calls[0][0]).toContain('이미 등록된 2개 제외');
  });

  it('200개 초과는 인라인 오류로 안내하고 진행 중 상태를 해제한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'LIMIT_EXCEEDED', message: '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.' },
        }),
        { status: 409 },
      ),
    );
    const { result, onSaveError } = setup();

    act(() => result.current.setInput('sh'));
    act(() => result.current.handleSubmitText());

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        '최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.',
      ),
    );
    expect(onSaveError).not.toHaveBeenCalled();
    expect(result.current.isSubmitting).toBe(false);
  });
});
