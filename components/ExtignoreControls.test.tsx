import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExtignoreControls } from './ExtignoreControls';

const policy = {
  fixedExtensions: [{ name: 'exe', active: true }],
  customExtensions: [{ name: 'sh' }],
};

describe('ExtignoreControls', () => {
  it('파일을 선택하면 onImportFile을 호출한다', async () => {
    const user = userEvent.setup();
    const onImportFile = vi.fn();
    render(<ExtignoreControls policy={policy} onImportFile={onImportFile} isSubmitting={false} />);

    const file = new File(['out\ntxt'], '.extignore', { type: 'text/plain' });
    const input = screen.getByLabelText('.extignore 파일 선택', { selector: 'input' });
    await user.upload(input, file);

    expect(onImportFile).toHaveBeenCalledWith(file);
  });

  it('내보내기 버튼을 누르면 다운로드를 트리거한다', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExtignoreControls policy={policy} onImportFile={vi.fn()} isSubmitting={false} />);
    await user.click(screen.getByRole('button', { name: '.extignore 내보내기' }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('isSubmitting이 true면 가져오기 버튼이 비활성화된다', () => {
    render(<ExtignoreControls policy={policy} onImportFile={vi.fn()} isSubmitting={true} />);
    expect(screen.getByRole('button', { name: '.extignore 가져오기' })).toBeDisabled();
  });
});
