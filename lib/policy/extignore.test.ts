import { describe, expect, it } from 'vitest';
import { buildExtignoreContent } from './extignore';

describe('buildExtignoreContent', () => {
  it('활성 고정 확장자(알파벳순) 다음에 커스텀 확장자(알파벳순)를 줄바꿈으로 이어붙인다', () => {
    const content = buildExtignoreContent({
      fixedExtensions: [
        { name: 'exe', active: true },
        { name: 'bat', active: false },
        { name: 'js', active: true },
      ],
      customExtensions: [{ name: 'tar.gz' }, { name: 'sh' }],
    });

    expect(content).toBe('exe\njs\nsh\ntar.gz');
  });

  it('비활성 고정 확장자는 제외한다', () => {
    const content = buildExtignoreContent({
      fixedExtensions: [{ name: 'exe', active: false }],
      customExtensions: [],
    });

    expect(content).toBe('');
  });
});
