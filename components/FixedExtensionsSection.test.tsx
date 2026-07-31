// components/FixedExtensionsSection.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FixedExtensionsSection } from './FixedExtensionsSection';

describe('FixedExtensionsSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('체크 후 500ms 뒤에만 저장 요청을 보낸다', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/policy/fixed-extensions/exe', expect.objectContaining({ method: 'PATCH' }));

    vi.useRealTimers();
  });

  it('저장에 성공하면 자동 소멸 토스트 콜백을 호출한다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));
    const onSaveSuccess = vi.fn();

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={onSaveSuccess}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSaveSuccess).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('저장에 실패하면 닫기 가능한 토스트 콜백을 호출하고 서버 상태를 다시 조회한다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));
    const onSaveError = vi.fn();
    const onResync = vi.fn();

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={onSaveError}
        onResync={onResync}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSaveError).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('Debounce 대기 중(저장 요청 전)에도 beforeunload 시 기본 확인 대화상자를 요청한다', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch');

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    expect(fetchSpy).not.toHaveBeenCalled();

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('저장이 완료되면 미저장 상태가 해제되어 beforeunload를 요청하지 않는다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'exe', active: true })));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('저장에 실패해 재동기화되어도 미저장 상태가 해제되어 beforeunload를 요청하지 않는다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }));

    render(
      <FixedExtensionsSection
        extensions={[{ name: 'exe', active: false }]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventDefaultSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('겹치는 시간에 서로 다른 확장자를 저장할 때 저장 중 표시가 각 행마다 독립적으로 유지된다', async () => {
    vi.useFakeTimers();
    let resolveExe!: (response: Response) => void;
    let resolveBat!: (response: Response) => void;
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).endsWith('/exe')) {
        return new Promise<Response>((resolve) => {
          resolveExe = resolve;
        });
      }
      return new Promise<Response>((resolve) => {
        resolveBat = resolve;
      });
    });

    render(
      <FixedExtensionsSection
        extensions={[
          { name: 'exe', active: false },
          { name: 'bat', active: false },
        ]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={vi.fn()}
      />,
    );

    const exeRow = screen.getByLabelText('exe').closest('label')!;
    const batRow = screen.getByLabelText('bat').closest('label')!;

    // t=0: exe 체크. 500ms 뒤(t=500) 저장 요청 발생 예정.
    fireEvent.click(screen.getByLabelText('exe'));

    // t=200: bat 체크. 500ms 뒤(t=700) 저장 요청 발생 예정. 두 저장 요청 구간이 겹친다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    fireEvent.click(screen.getByLabelText('bat'));

    // t=500: exe의 저장 요청이 시작된다(아직 응답 없음). bat은 아직 시작 전.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(within(exeRow).getByRole('status')).toHaveTextContent('저장 중');
    expect(within(batRow).queryByRole('status')).toBeNull();

    // t=700: bat의 저장 요청도 시작된다(아직 응답 없음). 두 요청이 동시에 진행 중이다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(within(exeRow).getByRole('status')).toHaveTextContent('저장 중');
    expect(within(batRow).getByRole('status')).toHaveTextContent('저장 중');

    // bat이 exe보다 먼저 응답을 받아도, exe의 저장 중 표시는 사라지지 않아야 한다(공유 스칼라 버그 방지).
    await act(async () => {
      resolveBat(new Response(JSON.stringify({ name: 'bat', active: true })));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(within(batRow).queryByRole('status')).toBeNull();
    expect(within(exeRow).getByRole('status')).toHaveTextContent('저장 중');

    // exe도 응답을 받으면 exe의 저장 중 표시도 사라진다.
    await act(async () => {
      resolveExe(new Response(JSON.stringify({ name: 'exe', active: true })));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(within(exeRow).queryByRole('status')).toBeNull();

    vi.useRealTimers();
  });

  it('한 확장자의 저장 실패로 재동기화되어도 다른 확장자의 미저장 낙관적 상태는 보존된다', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockImplementation((input) => {
      if (String(input).endsWith('/exe')) {
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      // bat 저장 요청은 이 테스트 안에서 완료되지 않는다(미저장 상태를 유지하기 위함).
      return new Promise<Response>(() => {});
    });
    const onResync = vi.fn();

    const { rerender } = render(
      <FixedExtensionsSection
        extensions={[
          { name: 'exe', active: false },
          { name: 'bat', active: false },
        ]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={onResync}
      />,
    );

    // exe를 체크하고 500ms 뒤 저장이 실패하도록 한다.
    fireEvent.click(screen.getByLabelText('exe'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onResync).toHaveBeenCalledTimes(1);

    // exe 저장 실패 처리 직후, bat을 체크한다. bat의 Debounce 타이머는 아직 발화하지 않아
    // bat은 미저장(unsaved) 상태로 남아 있다.
    fireEvent.click(screen.getByLabelText('bat'));
    expect((screen.getByLabelText('bat') as HTMLInputElement).checked).toBe(true);

    // onResync()로 촉발된 상위 refetch 결과가 extensions prop으로 흘러 들어온 상황을 재현한다.
    // 서버에는 아직 bat의 변경이 반영되지 않았으므로 bat은 여전히 active:false로 내려온다.
    rerender(
      <FixedExtensionsSection
        extensions={[
          { name: 'exe', active: false },
          { name: 'bat', active: false },
        ]}
        onSaveSuccess={vi.fn()}
        onSaveError={vi.fn()}
        onResync={onResync}
      />,
    );

    // bat은 미저장 상태였으므로 낙관적 체크 상태(true)가 재동기화로 되돌아가지 않아야 한다.
    expect((screen.getByLabelText('bat') as HTMLInputElement).checked).toBe(true);
    // exe는 더 이상 미저장 상태가 아니므로 서버 값(false)으로 정상 동기화된다.
    expect((screen.getByLabelText('exe') as HTMLInputElement).checked).toBe(false);

    vi.useRealTimers();
  });
});
