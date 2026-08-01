import { describe, expect, it } from 'vitest';
import { describeExtensionFormatError, normalizeExtensionInput } from './normalize';

describe('normalizeExtensionInput', () => {
  it('앞뒤 공백을 제거한다', () => {
    expect(normalizeExtensionInput('  sh  ')).toEqual({ ok: true, value: 'sh' });
  });

  it('맨 앞 마침표 하나를 제거한다', () => {
    expect(normalizeExtensionInput('.EXE')).toEqual({ ok: true, value: 'exe' });
  });

  it('대문자를 소문자로 변환한다', () => {
    expect(normalizeExtensionInput('TAR.GZ')).toEqual({ ok: true, value: 'tar.gz' });
  });

  it('빈 문자열은 EMPTY로 거부한다', () => {
    expect(normalizeExtensionInput('   ')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('20자를 초과하면 TOO_LONG으로 거부한다', () => {
    expect(normalizeExtensionInput('a'.repeat(21))).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('하이픈/언더스코어/유니코드는 INVALID_CHARACTERS로 거부한다', () => {
    expect(normalizeExtensionInput('my-ext')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
    expect(normalizeExtensionInput('my_ext')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
    expect(normalizeExtensionInput('한글확장자')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
  });

  it('연속된 마침표는 CONSECUTIVE_DOTS로 거부한다', () => {
    expect(normalizeExtensionInput('tar..gz')).toEqual({ ok: false, reason: 'CONSECUTIVE_DOTS' });
    expect(normalizeExtensionInput('tar...gz')).toEqual({ ok: false, reason: 'CONSECUTIVE_DOTS' });
  });

  it('마침표로 끝나면 INVALID_CHARACTERS로 거부한다', () => {
    expect(normalizeExtensionInput('tar.')).toEqual({ ok: false, reason: 'INVALID_CHARACTERS' });
  });
});

describe('describeExtensionFormatError', () => {
  it('CONSECUTIVE_DOTS는 전용 메시지를 반환한다', () => {
    expect(describeExtensionFormatError('CONSECUTIVE_DOTS')).toBe('연속된 마침표는 사용할 수 없습니다.');
  });

  it('그 외 사유는 공통 형식 오류 메시지를 반환한다', () => {
    expect(describeExtensionFormatError('EMPTY')).toBe('허용되지 않는 형식의 확장자입니다.');
    expect(describeExtensionFormatError('TOO_LONG')).toBe('허용되지 않는 형식의 확장자입니다.');
    expect(describeExtensionFormatError('INVALID_CHARACTERS')).toBe('허용되지 않는 형식의 확장자입니다.');
  });
});
