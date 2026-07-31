// @vitest-environment node
//
// jsdom 환경의 File/FormData는 undici(Node 내장 fetch)가 Request.formData()로
// multipart를 다시 파싱할 때 만들어내는 File과 별개의 realm에 속해
// `instanceof File`이 항상 false가 된다(실제로 이 파일에서 재현 확인함).
// route.ts는 실제 배포 환경(Node.js 런타임)에서 그대로 동작하므로, 이 파일만
// node 환경으로 전환해 실제 런타임과 같은 File/Request 구현을 사용한다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

describe('POST /api/uploads 요청 형식', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('file 필드가 실제 파일이 아니면 FILE_REQUIRED로 거부한다', async () => {
    const formData = new FormData();
    formData.append('file', 'not-a-file');
    const request = new Request('http://localhost/api/uploads', { method: 'POST', body: formData });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('FILE_REQUIRED');
  });

  it('FILE_REQUIRED 거부를 INVALID_UPLOAD_REQUEST/FILE_REQUIRED로 로그에 기록한다', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const formData = new FormData();
    formData.append('file', 'not-a-file');
    const request = new Request('http://localhost/api/uploads', { method: 'POST', body: formData });

    await POST(request);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.result).toBe('rejected');
    expect(logged.reason).toBe('INVALID_UPLOAD_REQUEST');
    expect(logged.detail).toBe('FILE_REQUIRED');
  });

  it('Content-Length가 서버 절대 상한을 초과하면 REQUEST_TOO_LARGE로 거부하고 로그에 기록한다', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { 'content-length': '99999999999' },
      body: new FormData(),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error.code).toBe('REQUEST_TOO_LARGE');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.result).toBe('rejected');
    expect(logged.reason).toBe('REQUEST_TOO_LARGE');
  });

  it('둘 이상의 파일이 전달되면 MULTIPLE_FILES_NOT_ALLOWED로 거부하고 로그에 기록한다', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const formData = new FormData();
    formData.append('file', new File(['a'], 'a.txt'));
    formData.append('file', new File(['b'], 'b.txt'));
    const request = new Request('http://localhost/api/uploads', { method: 'POST', body: formData });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('MULTIPLE_FILES_NOT_ALLOWED');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.reason).toBe('INVALID_UPLOAD_REQUEST');
    expect(logged.detail).toBe('MULTIPLE_FILES_NOT_ALLOWED');
  });
});
