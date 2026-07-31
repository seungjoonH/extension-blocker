import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  it('한 번에 하나의 토스트만 유지한다', () => {
    const { result } = renderHook(() => useToast());

    act(() => result.current.showSuccess('첫 번째'));
    act(() => result.current.showError('두 번째'));

    expect(result.current.toast).toEqual({ kind: 'error', message: '두 번째' });
  });
});
