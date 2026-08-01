import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPolicyButton } from './ResetPolicyButton';

function renderButton(overrides: Partial<Parameters<typeof ResetPolicyButton>[0]> = {}) {
  const props = {
    disabled: false,
    onSaveSuccess: vi.fn(),
    onSaveError: vi.fn(),
    onResync: vi.fn(),
    ...overrides,
  };
  render(<ResetPolicyButton {...props} />);
  return props;
}

describe('ResetPolicyButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('disabled가 true면 버튼이 비활성화된다', () => {
    renderButton({ disabled: true });
    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).toBeDisabled();
  });

  it('확인 대화상자에서 취소하면 요청을 보내지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    renderButton();
    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('확인하면 초기화 API를 호출하고 성공 시 재조회와 성공 토스트를 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ deletedCustomCount: 2, deactivatedFixedCount: 1 }), { status: 200 }),
    );
    const { onSaveSuccess, onResync } = renderButton();

    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    expect(await screen.findByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it('실패하면 오류 토스트만 호출하고 재조회하지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const { onSaveError, onResync } = renderButton();

    await user.click(screen.getByRole('button', { name: '확장자 정책 초기화' }));

    await vi.waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(onResync).not.toHaveBeenCalled();
  });
});
