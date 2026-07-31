import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `clamscan`(NodeClam)을 모킹해 실제 clamd 없이도 client.ts의 판정 로직을
// 검증한다. client.test.ts는 실제 clamd와 통신하는 통합 테스트이므로 같은
// 파일에서 `clamscan`을 모킹하면 그 통합 테스트들이 더 이상 실제 clamd를
// 검증하지 못하게 된다 — 그래서 이 파일을 분리했다.
const initMock = vi.fn();
const scanStreamMock = vi.fn();
const pingMock = vi.fn();

vi.mock('clamscan', () => {
  class MockNodeClam {
    init(...args: unknown[]) {
      return initMock(...args);
    }
  }
  return { default: MockNodeClam };
});

describe('ClamAV client (모킹)', () => {
  beforeEach(() => {
    vi.resetModules();
    initMock.mockReset();
    scanStreamMock.mockReset();
    pingMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('clamd가 판정 불가(isInfected: null)로 응답하면 감염되지 않은 것으로 처리하지 않고 예외를 던진다', async () => {
    initMock.mockResolvedValue({ scanStream: scanStreamMock, ping: pingMock });
    scanStreamMock.mockResolvedValue({ isInfected: null });

    const { scanFile } = await import('./client');

    await expect(scanFile(Buffer.from('data'))).rejects.toThrow();
  });

  it('clamd가 감염되지 않았다고 명확히 응답하면 isInfected: false를 반환한다', async () => {
    initMock.mockResolvedValue({ scanStream: scanStreamMock, ping: pingMock });
    scanStreamMock.mockResolvedValue({ isInfected: false });

    const { scanFile } = await import('./client');

    await expect(scanFile(Buffer.from('data'))).resolves.toEqual({ isInfected: false });
  });

  it('clamd가 감염을 명확히 탐지하면 isInfected: true를 반환한다', async () => {
    initMock.mockResolvedValue({ scanStream: scanStreamMock, ping: pingMock });
    scanStreamMock.mockResolvedValue({ isInfected: true });

    const { scanFile } = await import('./client');

    await expect(scanFile(Buffer.from('data'))).resolves.toEqual({ isInfected: true });
  });

  it('초기화 실패가 캐시되어 영구적으로 재사용되지 않고, 다음 호출에서 재시도한다', async () => {
    initMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    initMock.mockResolvedValueOnce({ scanStream: scanStreamMock, ping: pingMock });
    pingMock.mockResolvedValue(true);

    const { pingClamAv } = await import('./client');

    // 첫 호출: clamd가 아직 기동 중이라 init이 실패 → false
    await expect(pingClamAv()).resolves.toBe(false);
    // 두 번째 호출: 캐시된 실패 Promise가 재사용되지 않고 init이 다시 시도되어 성공해야 함
    await expect(pingClamAv()).resolves.toBe(true);
    expect(initMock).toHaveBeenCalledTimes(2);
  });
});
