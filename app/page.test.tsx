import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
    let policyCallCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/policy') {
        policyCallCount += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fixedExtensions: [{ name: 'exe', active: policyCallCount > 1 }],
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
    expect(await screen.findByLabelText('exe')).toBeChecked();
  });

  it('고정 확장자 저장이 실패해 onResync가 발생해도 화면 전체가 로딩 상태로 되돌아가지 않고 다섯 섹션이 계속 표시된다', async () => {
    const user = userEvent.setup();
    let policyCallCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/policy') {
        policyCallCount += 1;
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
      if (url === '/api/policy/fixed-extensions/exe' && init?.method === 'PATCH') {
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<Page />);

    const checkbox = await screen.findByLabelText('exe');
    await user.click(checkbox);

    await vi.waitFor(() => expect(policyCallCount).toBeGreaterThan(1), { timeout: 2000 });

    expect(screen.getByText('고정 확장자')).toBeInTheDocument();
    expect(screen.getByLabelText('커스텀 확장자 입력')).toBeInTheDocument();
    expect(screen.getByLabelText('업로드 최대 크기')).toBeInTheDocument();
    expect(screen.getByLabelText('파일 선택')).toBeInTheDocument();
    expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument();
  });

  it('일괄 입력 모드로 전환하면 단일 입력이 사라지고 일괄 입력 영역과 .extignore 버튼이 나타난다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
      ),
    );

    render(<Page />);
    await screen.findByLabelText('커스텀 확장자 입력');

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));

    expect(screen.queryByLabelText('커스텀 확장자 입력')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/일괄 입력\(쉼표로 구분/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '.extignore 내보내기' })).toBeInTheDocument();
  });

  it('모드를 전환하면 입력값이 초기화된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
      ),
    );

    render(<Page />);
    const singleInput = await screen.findByLabelText('커스텀 확장자 입력');
    await user.type(singleInput, 'sh');

    await user.click(screen.getByRole('radio', { name: '일괄 입력' }));
    await user.click(screen.getByRole('radio', { name: '단일 입력' }));

    expect(await screen.findByLabelText('커스텀 확장자 입력')).toHaveValue('');
  });

  it('고정 확장자 저장이 진행 중이면 초기화 버튼이 비활성화되고, 저장이 끝나면 다시 활성화된다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null });
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/policy') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ fixedExtensions: [{ name: 'exe', active: false }], customExtensions: [], maxUploadSizeBytes: 10485760 }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ name: 'exe', active: true })));
    });

    render(<Page />);
    await screen.findByLabelText('exe');

    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();

    await user.click(screen.getByLabelText('exe'));
    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole('button', { name: '확장자 정책 초기화' })).not.toBeDisabled();
    vi.useRealTimers();
  });
});
