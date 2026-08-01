import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionBatchInput } from './CustomExtensionBatchInput';

function renderInput(overrides: Partial<Parameters<typeof CustomExtensionBatchInput>[0]> = {}) {
  const props = {
    input: '',
    setInput: vi.fn(),
    isSubmitting: false,
    errorMessage: null,
    canSubmit: false,
    handleSubmitText: vi.fn(),
    ...overrides,
  };
  render(<CustomExtensionBatchInput {...props} />);
  return props;
}

describe('CustomExtensionBatchInput', () => {
  it('입력이 없으면 등록 버튼이 비활성화된다', () => {
    renderInput({ canSubmit: false });
    expect(screen.getByRole('button', { name: '일괄 등록' })).toBeDisabled();
  });

  it('canSubmit이 true일 때 등록 버튼을 누르면 handleSubmitText를 호출한다', async () => {
    const user = userEvent.setup();
    const props = renderInput({ input: 'exe,pdf', canSubmit: true });

    await user.click(screen.getByRole('button', { name: '일괄 등록' }));

    expect(props.handleSubmitText).toHaveBeenCalledTimes(1);
  });

  it('제출 중에는 버튼 문구가 등록 중...으로 바뀌고 비활성화된다', () => {
    renderInput({ input: 'exe', canSubmit: false, isSubmitting: true });
    expect(screen.getByRole('button', { name: '등록 중...' })).toBeDisabled();
  });

  it('errorMessage가 있으면 플랫 목록 문구를 그대로 표시한다', () => {
    renderInput({ errorMessage: '올바르지 않은 항목이 있습니다: my-ext, 안녕' });
    expect(screen.getByRole('alert')).toHaveTextContent('올바르지 않은 항목이 있습니다: my-ext, 안녕');
  });
});
