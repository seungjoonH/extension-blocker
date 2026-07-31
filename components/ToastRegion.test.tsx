// components/ToastRegion.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ToastRegion } from './ToastRegion';

describe('ToastRegion', () => {
  it('toast가 null이어도 role="status" 알림 영역은 계속 존재한다', () => {
    render(<ToastRegion toast={null} onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('null -> 토스트 -> null로 바뀌면 같은 알림 영역 노드는 유지된 채 퇴장 애니메이션 후 내용이 사라진다', async () => {
    const { rerender } = render(<ToastRegion toast={null} onDismiss={vi.fn()} />);
    const region = screen.getByRole('status');

    rerender(<ToastRegion toast={{ kind: 'success', message: '저장되었습니다' }} onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getByText('저장되었습니다')).toBeInTheDocument();

    rerender(<ToastRegion toast={null} onDismiss={vi.fn()} />);
    // 퇴장 애니메이션 재생 중에는 마지막 내용이 잠시 더 남아있다가, 애니메이션이
    // 끝나면 실제로 제거된다(레이아웃 이동 없이 서서히 사라지도록 하기 위함).
    expect(screen.getByRole('status')).toBe(region);
    await waitFor(() => expect(screen.queryByText('저장되었습니다')).not.toBeInTheDocument());
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
