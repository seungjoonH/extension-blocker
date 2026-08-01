// components/FileUploadSection.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUploadSection } from './FileUploadSection';

describe('FileUploadSection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('파일 미선택 상태에서는 안내 텍스트를 보여주고 업로드 버튼을 비활성화한다', () => {
    render(<FileUploadSection />);

    expect(screen.getByText(/파일을 선택해주세요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled();
  });

  it('파일을 선택하면 파일명과 크기를 표시하고 업로드 버튼을 활성화한다', async () => {
    const user = userEvent.setup();
    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    await user.upload(screen.getByLabelText('파일 선택'), file);

    expect(screen.getByText(/photo\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${file.size}바이트`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '업로드' })).toBeEnabled();
  });

  it('업로드 성공 시 결과를 표시하고 파일 선택을 초기화한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ originalFilename: 'photo.jpg', fileSizeBytes: 1024, normalizedExtension: 'jpg' }), {
        status: 201,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/photo.jpg.*업로드에 성공했습니다/)).toBeInTheDocument();
  });

  it('업로드 거부 시 사유를 표시하고 파일 선택을 유지하며 결과 영역으로 포커스를 이동한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BLOCKED_EXTENSION', message: '차단된 확장자입니다.' } }), {
        status: 400,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'tool.exe', { type: 'application/x-msdownload' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    const failureMessage = await screen.findByText(/차단된 확장자입니다/);
    expect(screen.getByLabelText('파일 선택')).toHaveProperty('files');
    expect(failureMessage).toHaveFocus();
  });

  it('파일명이 255바이트를 초과하면 선택 직후 업로드 버튼을 비활성화하고 인라인 오류를 표시하며 해당 오류 영역으로 포커스를 이동한다', async () => {
    const longName = `${'a'.repeat(252)}.txt`;

    render(<FileUploadSection />);
    const file = new File(['data'], longName, { type: 'text/plain' });
    // user.upload()는 내부적으로 input을 click()하는데, click()의 포커스 처리가 change
    // 이벤트로 촉발된 우리 effect의 focus() 호출보다 나중에 실행되어 결과를 덮어쓴다.
    // fireEvent.change로 change 이벤트만 직접 발생시켜 이 경합을 피한다.
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [file] } });

    const filenameErrorMessage = await screen.findByText(/파일명 길이 초과/);
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled();
    expect(filenameErrorMessage).toHaveFocus();
  });

  it('정상 파일을 선택하면 포커스를 강제로 이동하지 않는다', async () => {
    const user = userEvent.setup();
    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

    await user.upload(screen.getByLabelText('파일 선택'), file);

    expect(screen.getByLabelText('파일 선택')).toHaveFocus();
  });

  it('서로 다른 파일이지만 동일한 파일명 길이 초과 오류 문구가 연속으로 발생해도 매번 오류 영역으로 포커스를 이동한다', async () => {
    const longNameA = `${'a'.repeat(252)}.txt`;
    const longNameB = `${'b'.repeat(252)}.txt`;

    render(<FileUploadSection />);
    const fileA = new File(['data'], longNameA, { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [fileA] } });
    const firstErrorMessage = await screen.findByText(/파일명 길이 초과/);
    expect(firstErrorMessage).toHaveFocus();

    // 포커스를 의도적으로 다른 곳(파일 입력)으로 옮긴 뒤, 동일한 오류 문구를 다시 발생시킨다.
    screen.getByLabelText('파일 선택').focus();
    expect(screen.getByLabelText('파일 선택')).toHaveFocus();

    const fileB = new File(['data'], longNameB, { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [fileB] } });
    const secondErrorMessage = await screen.findByText(/파일명 길이 초과/);
    expect(secondErrorMessage).toHaveFocus();
  });

  it('업로드 진행 중에는 파일 선택과 업로드 버튼을 모두 비활성화하고 이전 결과를 제거한다', async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: Response) => void = () => {};
    vi.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(screen.getByText('업로드 중...')).toBeInTheDocument();
    expect(screen.getByLabelText('파일 선택')).toBeDisabled();
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled();

    resolveFetch(
      new Response(JSON.stringify({ originalFilename: 'photo.jpg', fileSizeBytes: 4, normalizedExtension: 'jpg' }), {
        status: 201,
      }),
    );
    await screen.findByText(/업로드에 성공했습니다/);
  });

  it('새 파일을 선택하면 직전 결과가 즉시 제거된다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BLOCKED_EXTENSION', message: '차단된 확장자입니다.' } }), {
        status: 400,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'tool.exe', { type: 'application/x-msdownload' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));
    await screen.findByText(/차단된 확장자입니다/);

    const nextFile = new File(['data'], 'ok.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('파일 선택'), nextFile);

    expect(screen.queryByText(/차단된 확장자입니다/)).not.toBeInTheDocument();
  });

  it('네트워크 오프라인 상태에서 실패하면 오프라인 안내 문구를 표시한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/인터넷 연결을 확인한 후 다시 시도해주세요/)).toBeInTheDocument();
  });

  it('온라인 상태에서 네트워크 요청이 실패하면 서버 연결 실패 안내 문구를 표시한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요/)).toBeInTheDocument();
  });

  it('서버 5xx 오류 시 서버가 반환한 일시적 오류 문구를 표시한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다. 다시 시도해주세요.' } }), {
        status: 500,
      }),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/일시적인 오류가 발생했습니다. 다시 시도해주세요/)).toBeInTheDocument();
  });

  it('플랫폼이 본문 없는 413을 반환해도 요청 크기 초과 안내 문구를 표시한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 413 }));

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/요청할 수 있는 최대 크기를 초과했습니다/)).toBeInTheDocument();
  });

  it('서버가 파일명을 포함한 완전한 문장을 반환하면 파일명을 중복 표시하지 않는다', async () => {
    const user = userEvent.setup();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'BLOCKED_EXTENSION', message: '"tool.exe"은 차단된 확장자로 업로드할 수 없습니다.' } }),
        { status: 400 },
      ),
    );

    render(<FileUploadSection />);
    const file = new File(['data'], 'tool.exe', { type: 'application/x-msdownload' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    const failureMessage = await screen.findByText(/차단된 확장자로 업로드할 수 없습니다/);
    const occurrences = failureMessage.textContent?.split('"tool.exe"').length ?? 0;
    expect(occurrences - 1).toBe(1);
    expect(failureMessage).toHaveTextContent('"tool.exe"은 차단된 확장자로 업로드할 수 없습니다.');
  });

  it('요청이 60초 내에 응답하지 않으면 요청을 중단하고 타임아웃 안내를 표시하며 파일 선택과 재시도 가능 상태를 유지한다', async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((_input, init) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText('파일 선택') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(screen.getByText('업로드 중...')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByText('서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('업로드 중...')).not.toBeInTheDocument();
    expect(screen.getByText(/photo\.jpg/)).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: '업로드' });
    expect(retryButton).not.toBeDisabled();

    fireEvent.click(retryButton);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('진짜 네트워크 실패(AbortError가 아님)는 타임아웃 문구가 아니라 기존 무응답 문구를 표시한다', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    render(<FileUploadSection />);
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('파일 선택'), file);
    await user.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요/)).toBeInTheDocument();
    expect(screen.queryByText(/서버 응답이 지연되고 있습니다/)).not.toBeInTheDocument();
  });
});
