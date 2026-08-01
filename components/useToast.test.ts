import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('연속 알림이 서로 교체되지 않고 각각 독립된 토스트로 쌓인다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('첫 번째'));
    act(() => result.current.showError('두 번째'));

    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0]).toMatchObject({ kind: 'success', message: '첫 번째' });
    expect(result.current.toasts[1]).toMatchObject({ kind: 'error', message: '두 번째' });
    // 메시지 문자열이 아니라 고유 id로 구분된다.
    expect(result.current.toasts[0].id).not.toBe(result.current.toasts[1].id);
  });

  it('먼저 표시된 토스트의 자동 소멸 타이머가 끝나도 그 토스트만 사라지고 나머지는 유지된다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('A'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showSuccess('B'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showSuccess('C'));

    // A는 호출 후 3000ms 시점(현재 기준 1000ms 뒤)에 사라져야 하고, B/C는 아직 남아있어야 한다.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts.map((t) => t.message)).toEqual(['B', 'C']);

    // B는 호출 후 3000ms 시점(현재 기준 1000ms 뒤)에 사라지고, C는 남아있어야 한다.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts.map((t) => t.message)).toEqual(['C']);

    // C도 자신의 3000ms가 지나면 사라진다.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts).toEqual([]);
  });

  it('동일한 종류와 메시지의 토스트가 이미 표시 중이면 새로 추가하지 않고 표시 시간만 갱신한다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('완료'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showSuccess('완료'));

    // 중복 호출이므로 새 항목이 추가되지 않고 하나만 유지된다.
    expect(result.current.toasts).toHaveLength(1);
    const id = result.current.toasts[0].id;

    // 두 번째 호출 시점(t=1000)에 타이머가 갱신되었으므로, 첫 호출 기준 3000ms(t=3000)가 지나도 남아있어야 한다.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(id);

    // 갱신된 타이머 기준 3000ms(t=4000)가 지나면 사라진다.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.toasts).toEqual([]);
  });

  it('동일한 오류가 반복 발생해도 중복으로 쌓이지 않고 기존 항목을 유지한다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showError('실패'));
    const id = result.current.toasts[0].id;
    act(() => result.current.showError('실패'));

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).toBe(id);
  });

  it('동일한 메시지의 토스트가 표시 중일 때 서로 다른 메시지의 토스트가 도착하면 둘 다 유지된다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showError('오류 A'));
    act(() => result.current.showError('오류 A'));
    act(() => result.current.showError('오류 B'));

    expect(result.current.toasts.map((t) => t.message)).toEqual(['오류 A', '오류 B']);
  });

  it('같은 문구라도 성공과 실패는 서로 다른 알림으로 취급해 둘 다 표시된다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('완료'));
    act(() => result.current.showError('완료'));

    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts[0]).toMatchObject({ kind: 'success', message: '완료' });
    expect(result.current.toasts[1]).toMatchObject({ kind: 'error', message: '완료' });
  });

  it('오류 토스트는 자동으로 사라지지 않고 dismiss(id)를 호출해야 제거된다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showError('실패'));
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.toasts).toHaveLength(1);

    const id = result.current.toasts[0].id;
    act(() => result.current.dismiss(id));
    expect(result.current.toasts).toEqual([]);
  });

  it('하나를 dismiss해도 다른 토스트의 타이머와 내용은 영향받지 않는다', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('A'));
    act(() => result.current.showSuccess('B'));

    const idA = result.current.toasts[0].id;
    act(() => result.current.dismiss(idA));
    expect(result.current.toasts.map((t) => t.message)).toEqual(['B']);

    // A를 지웠어도 B는 자신의 3000ms가 지나면 정상적으로 사라져야 한다(B의 타이머가 안 깨졌는지 확인).
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.toasts).toEqual([]);
  });

  it('최대 개수를 넘으면 가장 오래된 토스트부터 제거된다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showError('1'));
    act(() => result.current.showError('2'));
    act(() => result.current.showError('3'));
    act(() => result.current.showError('4'));

    expect(result.current.toasts.map((t) => t.message)).toEqual(['2', '3', '4']);
  });
});
