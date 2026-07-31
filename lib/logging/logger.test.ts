import { describe, expect, it, vi } from 'vitest';
import { logUploadResult, type UploadLogEntry } from './logger';

describe('logUploadResult', () => {
  it('구조화된 필드만 기록하고 파일 내용/경로는 포함하지 않는다', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logUploadResult({
      requestId: 'req-1',
      result: 'rejected',
      reason: 'BLOCKED_EXTENSION',
      extension: 'exe',
      fileSizeBytes: 1024,
      durationMs: 12,
      storageKey: 'uploads/should-not-appear',
      fileContent: 'binary-data-should-not-appear',
    } as UploadLogEntry & { storageKey: string; fileContent: string });

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.requestId).toBe('req-1');
    expect(logged.reason).toBe('BLOCKED_EXTENSION');
    expect(logged).not.toHaveProperty('storageKey');
    expect(logged).not.toHaveProperty('fileContent');

    spy.mockRestore();
  });
});
