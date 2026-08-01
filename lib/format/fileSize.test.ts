import { describe, expect, it } from 'vitest';
import { formatFileSizeMb } from './fileSize';

describe('formatFileSizeMb', () => {
  it('바이트를 소수 한 자리 MB로 표시한다', () => {
    expect(formatFileSizeMb(1048576)).toBe('1.0MB');
    expect(formatFileSizeMb(10485760)).toBe('10.0MB');
    expect(formatFileSizeMb(3244800)).toBe('3.1MB');
  });
});
