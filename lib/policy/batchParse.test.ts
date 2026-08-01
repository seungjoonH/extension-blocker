import { describe, expect, it } from 'vitest';
import { parseBatchItems, splitByComma, splitByLine } from './batchParse';

describe('splitByComma', () => {
  it('쉼표로 구분한다', () => {
    expect(splitByComma('exe,pdf,tar.gz')).toEqual(['exe', 'pdf', 'tar.gz']);
  });

  it('줄바꿈은 구분자로 인정하지 않는다(한 항목의 일부로 남는다)', () => {
    expect(splitByComma('exe\npdf')).toEqual(['exe\npdf']);
  });
});

describe('splitByLine', () => {
  it('\\n으로 구분한다', () => {
    expect(splitByLine('out\ntxt\ntar.gz')).toEqual(['out', 'txt', 'tar.gz']);
  });

  it('\\r\\n도 구분자로 인정한다', () => {
    expect(splitByLine('out\r\ntxt')).toEqual(['out', 'txt']);
  });

  it('빈 줄을 허용한다(이후 trim/빈 값 제거 단계에서 걸러진다)', () => {
    expect(splitByLine('out\n\ntxt')).toEqual(['out', '', 'txt']);
  });
});

describe('parseBatchItems', () => {
  it('trim, 빈 값 제거, 정규화, 입력 내부 중복 제거를 거쳐 정상 목록을 반환한다', () => {
    const result = parseBatchItems([' exe ', '', 'PDF', 'exe', 'tar.gz']);
    expect(result).toEqual({ ok: true, items: ['exe', 'pdf', 'tar.gz'] });
  });

  it('빈 배열이나 공백만 있는 입력은 빈 목록으로 성공 처리한다', () => {
    expect(parseBatchItems([' ', '  '])).toEqual({ ok: true, items: [] });
  });

  it('형식 오류 항목이 있으면 실패하고, 문제 항목(트림된 원문)을 모두 모아 반환한다', () => {
    const result = parseBatchItems(['exe', 'very-long-extension-name-over-20', 'my-ext']);
    expect(result).toEqual({
      ok: false,
      invalidItems: ['very-long-extension-name-over-20', 'my-ext'],
    });
  });

  it('20자를 초과하는 항목만 실패로 잡는다(단일 모드와 동일한 항목별 기준)', () => {
    const result = parseBatchItems(['exe', 'pdf', 'very-long-extension-name']);
    expect(result).toEqual({ ok: false, invalidItems: ['very-long-extension-name'] });
  });
});
