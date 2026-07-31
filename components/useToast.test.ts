import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('한 번에 하나의 토스트만 유지한다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('첫 번째'));
    act(() => result.current.showError('두 번째'));

    expect(result.current.toast).toEqual({ kind: 'error', message: '두 번째' });
  });

  it('성공 토스트의 자동 소멸 타이머가 같은 메시지의 이후 오류 토스트를 지우지 않는다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('작업 실패'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showError('작업 실패'));

    // 첫 번째(성공) 토스트의 3초 타이머가 만료되는 시점까지 진행한다.
    act(() => vi.advanceTimersByTime(2000));

    expect(result.current.toast).toEqual({ kind: 'error', message: '작업 실패' });
  });

  it('동일 메시지로 연속 호출해도 각 토스트의 소멸 타이머는 독립적으로 동작한다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('완료'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showSuccess('완료'));

    // 첫 번째 호출의 3초 시점(호출 후 3000ms = 이번 두 번째 호출 이후 2000ms)에는 아직 지워지지 않아야 한다.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toast).toEqual({ kind: 'success', message: '완료' });

    // 두 번째 호출의 3초 시점에는 지워져야 한다.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toast).toBeNull();
  });
});
