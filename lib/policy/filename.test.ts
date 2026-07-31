import { describe, expect, it } from 'vitest';
import { validateFilename } from './filename';

describe('validateFilename', () => {
  it('정상 파일명은 통과한다', () => {
    expect(validateFilename('report.pdf')).toEqual({ ok: true });
  });

  it('빈 파일명은 EMPTY_FILENAME이다', () => {
    expect(validateFilename('')).toEqual({ ok: false, reason: 'EMPTY_FILENAME' });
  });

  it('UTF-8 기준 255바이트를 초과하면 FILENAME_TOO_LONG이다', () => {
    const longAscii = 'a'.repeat(256);
    expect(validateFilename(longAscii)).toEqual({ ok: false, reason: 'FILENAME_TOO_LONG' });
  });

  it('한글은 문자당 3바이트로 계산한다', () => {
    const koreanName = '가'.repeat(85) + '.txt'; // 85 * 3 = 255바이트 + 4바이트 > 255
    expect(validateFilename(koreanName)).toEqual({ ok: false, reason: 'FILENAME_TOO_LONG' });

    const withinLimit = '가'.repeat(80) + '.txt'; // 80 * 3 + 4 = 244바이트
    expect(validateFilename(withinLimit)).toEqual({ ok: true });
  });
});
