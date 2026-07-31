// components/FixedExtensionsSection.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FixedExtensionsSection } from './FixedExtensionsSection';

describe('FixedExtensionsSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('체크 후 500ms 뒤에만 저장 요청을 보낸다', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/policy/fixed-extensions/exe', expect.objectContaining({ method: 'PATCH' }));

    vi.useRealTimers();
  });

  it('저장에 성공하면 자동 소멸 토스트 콜백을 호출한다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));
    const onSaveSuccess = vi.fn();

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={onSaveSuccess}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('저장에 실패하면 닫기 가능한 토스트 콜백을 호출하고 서버 상태를 다시 조회한다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const onSaveError = vi.fn();
    const onResync = vi.fn();

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={onSaveError}
        onResync={onResync}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSaveError).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('Debounce 대기 중(저장 요청 전)에도 beforeunload 시 기본 확인 대화상자를 요청한다', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    expect(fetchSpy).not.toHaveBeenCalled();

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('저장이 완료되면 미저장 상태가 해제되어 beforeunload를 요청하지 않는다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('저장에 실패해 재동기화되어도 미저장 상태가 해제되어 beforeunload를 요청하지 않는다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
