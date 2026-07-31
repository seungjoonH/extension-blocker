// components/CustomExtensionsSection.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomExtensionsSection } from './CustomExtensionsSection';

describe('CustomExtensionsSection', () => {
  it('빈 입력이면 추가 버튼이 비활성화된다', () => {
    render(<CustomExtensionsSection extensions={[]} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);
    expect(screen.getByRole('button', { name: '추가' })).toBeDisabled();
  });

  it('정상 입력 후 추가하면 목록에 반영되고 입력값이 초기화되며 성공 토스트를 호출한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'custom_created', customExtension: { id: '1', name: 'sh' } }), { status: 201 }),
    );
    const onSaveSuccess = vi.fn();

    render(<CustomExtensionsSection extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={vi.fn()} />);
    const input = screen.getByLabelText('커스텀 확장자 입력');

    await user.type(input, 'sh');
    await user.click(screen.getByRole('button', { name: '추가' }));

    expect(await screen.findByText('sh')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);
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
        <CustomExtensionsSection extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={onResync} />
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

    render(<CustomExtensionsSection extensions={[]} onSaveSuccess={onSaveSuccess} onSaveError={vi.fn()} onResync={onResync} />);
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

    render(<CustomExtensionsSection extensions={[]} onSaveSuccess={vi.fn()} onSaveError={onSaveError} onResync={vi.fn()} />);
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

    render(<CustomExtensionsSection extensions={[]} onSaveSuccess={vi.fn()} onSaveError={onSaveError} onResync={vi.fn()} />);
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
      <CustomExtensionsSection
        extensions={[{ id: '1', name: 'sh' }]}
        onSaveSuccess={vi.fn()}
        onSaveError={onSaveError}
        onResync={vi.fn()}
      />,
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
      <CustomExtensionsSection
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
      <CustomExtensionsSection
        extensions={[{ id: '1', name: 'sh' }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'sh 삭제' }));

    await vi.waitFor(() => expect(screen.getByLabelText('커스텀 확장자 입력')).toHaveFocus());
  });

  it('목록이 200개에 도달하면 추가 버튼은 비활성화되고 최대 개수 안내가 인라인으로 표시된다', () => {
    const extensions = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `ext${i}` }));

    render(<CustomExtensionsSection extensions={extensions} onSaveSuccess={vi.fn()} onSaveError={vi.fn()} onResync={vi.fn()} />);

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
      <CustomExtensionsSection
        extensions={[{ id: '1', name: 'sh' }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    const deleteButton = screen.getByRole('button', { name: 'sh 삭제' });
    await user.click(deleteButton);

    expect(deleteButton).toHaveTextContent('삭제 중');
    expect(deleteButton).toBeDisabled();

    resolveDelete(new Response(null, { status: 204 }));
    await vi.waitFor(() => expect(screen.queryByText('sh')).not.toBeInTheDocument());
  });
});
