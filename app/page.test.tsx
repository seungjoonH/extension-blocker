import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from './page';

describe('메인 화면', () => {
  it('정책 조회 후 4개 섹션을 모두 렌더링한다', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          fixedExtensions: [{ name: 'exe', active: false }],
          customExtensions: [],
          maxUploadSizeBytes: 10485760,
        }),
      ),
    );

    render(<Page />);

    expect(await screen.findByText('고정 확장자')).toBeInTheDocument();
    expect(screen.getByLabelText('커스텀 확장자 입력')).toBeInTheDocument();
    expect(screen.getByLabelText('업로드 최대 크기')).toBeInTheDocument();
    expect(screen.getByLabelText('파일 선택')).toBeInTheDocument();
  });

  it('커스텀 확장자 입력이 고정 확장자와 겹치면 실제 화면에서 해당 고정 확장자 체크박스로 포커스가 이동하고 토스트가 표시된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/policy') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fixedExtensions: [{ name: 'exe', active: false }],
              customExtensions: [],
              maxUploadSizeBytes: 10485760,
            }),
          ),
        );
      }
      if (url === '/api/policy/custom-extensions') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ result: 'fixed_auto_activated', fixedExtension: { name: 'exe', active: true } }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<Page />);

    await user.type(await screen.findByLabelText('커스텀 확장자 입력'), 'exe');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByLabelText('exe')).toHaveFocus();
    expect(await screen.findByText(/고정 차단 목록에 자동으로 추가되었습니다/)).toBeInTheDocument();
  });
});
