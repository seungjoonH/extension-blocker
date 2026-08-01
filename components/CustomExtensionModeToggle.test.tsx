import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionModeToggle } from './CustomExtensionModeToggle';

describe('CustomExtensionModeToggle', () => {
  it('현재 모드 버튼에 aria-checked=true를 표시한다', () => {
    render(<CustomExtensionModeToggle mode="single" onModeChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '단일 입력' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '일괄 입력' })).toHaveAttribute('aria-checked', 'false');
  });

  it('다른 모드를 클릭하면 onModeChange를 호출한다', async () => {
    const user = userEvent.setup();
    const onModeChange = vi.fn();
    render(<CustomExtensionModeToggle mode="single" onModeChange={onModeChange} />);

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));

    expect(onModeChange).toHaveBeenCalledWith('batch');
  });
});
