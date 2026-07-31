import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadSizeSection } from './UploadSizeSection';

describe('UploadSizeSection', () => {
  it('maxUploadSizeBytes prop이 외부에서 갱신되면 표시값도 다시 동기화된다', () => {
    const { rerender } = render(
      <UploadSizeSection maxUploadSizeBytes={10485760} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} />,
    );
    expect(screen.getByLabelText('업로드 최대 크기')).toHaveValue('10485760');

    rerender(<UploadSizeSection maxUploadSizeBytes={52428800} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} />);

    expect(screen.getByLabelText('업로드 최대 크기')).toHaveValue('52428800');
  });

  it('값을 변경하면 저장 요청을 보내고 성공하면 자동 소멸 토스트 콜백을 호출한다', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ maxUploadSizeBytes: 20971520 })));
    const onSaveSuccess = vi.fn();

    render(<UploadSizeSection maxUploadSizeBytes={10485760} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('업로드 최대 크기'), '20971520');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/policy/upload-size',
      expect.objectContaining({ method: 'PUT' }),
    );
    await vi.waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
  });

  it('저장에 실패하면 이전 값으로 되돌리고 닫기 가능한 토스트 콜백을 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const onSaveError = vi.fn();

    render(<UploadSizeSection maxUploadSizeBytes={10485760} onSaveSuccess={vi.fn()} onSaveError={onSaveError} />);
    const select = screen.getByLabelText('업로드 최대 크기') as HTMLSelectElement;
    await user.selectOptions(select, '20971520');

    await vi.waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(select).toHaveValue('10485760');
  });
});
