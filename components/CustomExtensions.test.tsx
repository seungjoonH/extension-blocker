// components/CustomExtensions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtension, useCustomExtensions } from './useCustomExtensions';
import { CustomExtensionInput } from './CustomExtensionInput';
import { CustomExtensionList } from './CustomExtensionList';

// page.tsx가 훅 하나를 호출해 입력부(CustomExtensionInput)와 목록부(CustomExtensionList)에
// 상태를 나눠 내려주는 방식을 그대로 재현하는 테스트용 조합 컴포넌트.
function TestHarness(props: {
  extensions: CustomExtension[];
  onSaveSuccess: (message: string) => void;
  onSaveError: (message: string) => void;
  onResync: () => void;
}) {
  const state = useCustomExtensions(props);
  return (
    <div>
      <CustomExtensionInput {...state} />
      <CustomExtensionList {...state} />
    </div>
  );
}

describe('커스텀 확장자 입력/목록', () => {
  it('extensions prop이 외부에서 갱신되면(다른 영역의 재조회 등) 목록도 다시 동기화된다', () => {
    const { rerender } = render(
      <TestHarness extensions={[{ id: '1', name: 'sh' }]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />,
    );
    expect(screen.getByText('sh')).toBeInTheDocument();
    expect(screen.queryByText('bak')).not.toBeInTheDocument();

    rerender(
      <TestHarness
        extensions={[
          { id: '1', name: 'sh' },
          { id: '2', name: 'bak' },
        ]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    expect(screen.getByText('sh')).toBeInTheDocument();
    expect(screen.getByText('bak')).toBeInTheDocument();
  });

  it('빈 입력이면 추가 버튼이 비활성화된다', () => {
    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('정상 입력 후 추가 버튼을 클릭하면 목록에 반영되고 입력값이 초기화되며 성공 토스트를 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'custom_created', customExtension: { id: '1', name: 'sh' } }), { status: 201 }),
    );
    const onSaveSuccess = vi.fn();

    render(<TestHarness extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={vi.fn()} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');

    await user.type(input, 'sh');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('sh')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
  });

  it('입력 필드에서 Enter를 누르면 클릭과 동일하게 추가된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'custom_created', customExtension: { id: '1', name: 'sh' } }), { status: 201 }),
    );
    const onSaveSuccess = vi.fn();

    render(<TestHarness extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={vi.fn()} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');

    await user.type(input, 'sh{Enter}');

    expect(await screen.findByText('sh')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
  });

  it('허용되지 않는 문자를 입력하면 제출 없이도 즉시 인라인 오류가 표시되고 추가 버튼이 비활성화된다', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch');
    fetchSpy.mockClear();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'my-ext');

    expect(screen.getByText('허용되지 않는 형식의 확장자입니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('연속된 마침표를 입력하면 제출 없이도 전용 메시지가 즉시 표시된다', async () => {
    const user = userEvent.setup();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'tar..gz');

    expect(screen.getByText('연속된 마침표는 사용할 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('복합 확장자를 입력하는 중(마침표로 끝나는 상태)에는 아직 오류를 표시하지 않는다', async () => {
    const user = userEvent.setup();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'tar.');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('빈 입력에서 Enter를 눌러도 추가되지 않는다', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(global, 'fetch');
    // fetchSpy는 global.fetch에 대한 스파이라 이전 테스트의 호출 이력이 남아 있을 수 있으므로,
    // 이 테스트의 동작만 확인하기 위해 렌더 직후 호출 이력을 초기화한다.
    fetchSpy.mockClear();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');

    await user.click(input);
    await user.keyboard('{Enter}');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('고정 확장자가 비활성 상태에서 겹치면 목록에 추가하지 않고 자동 활성화 안내 토스트를 호출하며 해당 고정 확장자로 포커스를 이동한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'fixed_auto_activated', fixedExtension: { name: 'exe', active: true } }), {
        status: 200,
      }),
    );
    const onSaveSuccess = vi.fn();
    const onResync = vi.fn();

    render(
      <div>
        <input id="fixed-exe" type="checkbox" aria-label="exe" />
        <TestHarness extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={onResync} />
      </div>,
    );
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'exe');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByLabelText('exe')).toHaveFocus();
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('exe')).not.toBeInTheDocument();
  });

  it('고정 확장자가 이미 활성 상태에서 겹치면 상태 변경 없이 안내 토스트만 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'fixed_already_active', fixedExtension: { name: 'exe', active: true } }), {
        status: 200,
      }),
    );
    const onSaveSuccess = vi.fn();
    const onResync = vi.fn();

    render(<TestHarness extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={onResync} />);
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'exe');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await vi.waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('exe')).not.toBeInTheDocument();
    expect(onResync).not.toHaveBeenCalled();
  });

  it('형식 오류처럼 입력값 문제는 인라인 오류로 표시하고 입력 필드로 포커스를 이동하며 토스트는 호출하지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'DUPLICATE_EXTENSION', message: '이미 등록된 확장자입니다.' } }), {
        status: 409,
      }),
    );
    const onSaveError = vi.fn();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={onSaveError} onResync={vi.fn()} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');
    await user.type(input, 'sh');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('이미 등록된 확장자입니다.')).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(input).toHaveValue('sh');
    expect(onSaveError).not.toHaveBeenCalled();
  });

  it('네트워크/서버 오류처럼 기술적 실패는 인라인이 아니라 토스트 콜백으로 안내한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' } }),
        { status: 500 },
      ),
    );
    const onSaveError = vi.fn();

    render(<TestHarness extensions={[]} onSaveSuccess={vi.fn()} onSaveError={onSaveError} onResync={vi.fn()} />);
    await user.type(screen.getByLabelText('커스텀 확장자 입력'), 'sh');
    await user.click(screen.getByRole('button', { name: '추가' }));

    await vi.waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('삭제 실패 시 목록을 유지하고 삭제 버튼을 다시 활성화하며 토스트 콜백을 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const onSaveError = vi.fn();

    render(
      <TestHarness extensions={[{ id: '1', name: 'sh' }]} onSaveSuccess={vi.fn()} onSaveError={onSaveError} onResync={vi.fn()} />,
    );

    const deleteButton = screen.getByRole('button', { name: 'sh 삭제' });
    await user.click(deleteButton);

    await vi.waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(screen.getByText('sh')).toBeInTheDocument();
    expect(deleteButton).not.toBeDisabled();
  });

  it('삭제에 성공하면 다음 항목의 삭제 버튼으로 포커스를 이동한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    render(
      <TestHarness
        extensions={[
          { id: '1', name: 'sh' },
          { id: '2', name: 'bak' },
        ]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'sh 삭제' }));

    expect(await screen.findByRole('button', { name: 'bak 삭제' })).toHaveFocus();
  });

  it('마지막 항목을 삭제하면 입력 필드로 포커스를 이동한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    render(
      <TestHarness extensions={[{ id: '1', name: 'sh' }]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'sh 삭제' }));

    await vi.waitFor(() => expect(screen.getByLabelText('커스텀 확장자 입력')).toHaveFocus());
  });

  it('목록이 200개에 도달하면 추가 버튼은 비활성화되고 최대 개수 안내가 인라인으로 표시된다', () => {
    const extensions = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `ext${i}` }));

    render(<TestHarness extensions={extensions} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);

    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
    expect(
      screen.getByText('최대 200개까지 등록할 수 있습니다. 기존 항목을 삭제한 후 다시 추가해주세요.'),
    ).toBeInTheDocument();
  });

  it('삭제 요청이 진행 중인 동안 해당 삭제 버튼에 로딩 상태가 표시된다', async () => {
    const user = userEvent.setup();
    let resolveDelete!: (response: Response) => void;
    vi.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(
      <TestHarness extensions={[{ id: '1', name: 'sh' }]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />,
    );

    const deleteButton = screen.getByRole('button', { name: 'sh 삭제' });
    await user.click(deleteButton);

    expect(deleteButton).toHaveAttribute('aria-busy', 'true');
    expect(deleteButton).toBeDisabled();

    resolveDelete(new Response(null, { status: 204 }));
    await vi.waitFor(() => expect(screen.queryByText('sh')).not.toBeInTheDocument());
  });
});
