// components/ToastRegion.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToastRegion } from './ToastRegion';

describe('ToastRegion', () => {
  it('toast가 null이어도 role="status" 알림 영역은 계속 존재한다', () => {
    render(<ToastRegion toast={null} onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('null -> 토스트 -> null로 바뀌어도 같은 알림 영역 노드가 유지된다', () => {
    const { rerender } = render(<ToastRegion toast={null} onDismiss={vi.fn()} />);
    const region = screen.getByRole('status');

    rerender(<ToastRegion toast={{ kind: 'success', message: '저장되었습니다' }} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByText('저장되었습니다')).toBeInTheDocument();

    rerender(<ToastRegion toast={null} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.queryByText('저장되었습니다')).not.toBeInTheDocument();
  });

  it('오류 토스트에는 닫기 버튼을 표시한다', () => {
    render(<ToastRegion toast={{ kind: 'error', message: '저장 실패' }} onDismiss={vi.fn()} />);

    expect(screen.getByRole('button', { name: '알림 닫기' })).toBeInTheDocument();
  });

  it('성공 토스트에는 닫기 버튼을 표시하지 않는다', () => {
    render(<ToastRegion toast={{ kind: 'success', message: '저장 완료' }} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
  });
});
