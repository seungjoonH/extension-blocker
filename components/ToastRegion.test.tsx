// components/ToastRegion.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastRegion } from './ToastRegion';

describe('ToastRegion', () => {
  it('toasts가 빈 배열이어도 role="status" 알림 영역은 계속 존재한다', () => {
    render(<ToastRegion toasts={[]} onDismiss={vi.fn()} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('여러 토스트가 동시에 각각 별도 항목으로 표시된다', () => {
    render(
      <ToastRegion
        toasts={[
          { id: 1, kind: 'success', message: 'A 저장됨' },
          { id: 2, kind: 'error', message: 'B 실패' },
          { id: 3, kind: 'success', message: 'C 저장됨' },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('A 저장됨')).toBeInTheDocument();
    expect(screen.getByText('B 실패')).toBeInTheDocument();
    expect(screen.getByText('C 저장됨')).toBeInTheDocument();
  });

  it('배열에서 항목이 하나 빠져도(id 기준) 다른 토스트는 그대로 유지된다', async () => {
    const { rerender } = render(
      <ToastRegion
        toasts={[
          { id: 1, kind: 'success', message: 'A' },
          { id: 2, kind: 'success', message: 'B' },
        ]}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();

    // id 1(A)만 배열에서 사라지고 id 2(B)는 그대로 남는다.
    rerender(<ToastRegion toasts={[{ id: 2, kind: 'success', message: 'B' }]} onDismiss={vi.fn()} />);

    // 퇴장 애니메이션 동안 A는 잠시 더 남아있다가 사라지고, B는 처음부터 끝까지 계속 존재한다.
    expect(screen.getByText('B')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('A')).not.toBeInTheDocument());
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('같은 메시지 문자열이어도 id가 다르면 별개의 항목으로 취급한다', () => {
    render(
      <ToastRegion
        toasts={[
          { id: 1, kind: 'error', message: '저장에 실패했습니다.' },
          { id: 2, kind: 'error', message: '저장에 실패했습니다.' },
        ]}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getAllByText('저장에 실패했습니다.')).toHaveLength(2);
  });

  it('오류 토스트에는 닫기 버튼을 표시하고, 클릭하면 해당 id로 onDismiss를 호출한다', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    render(<ToastRegion toasts={[{ id: 7, kind: 'error', message: '저장 실패' }]} onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });

  it('성공 토스트에는 닫기 버튼을 표시하지 않는다', () => {
    render(<ToastRegion toasts={[{ id: 1, kind: 'success', message: '저장 완료' }]} onDismiss={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
  });
});
