import { describe, expect, it } from 'vitest';
import { pingClamAv, scanFile } from './client';

describe('ClamAV client', () => {
  it('clamd에 ping이 성공한다', async () => {
    const result = await pingClamAv();
    expect(result).toBe(true);
  });

  it('EICAR 테스트 문자열을 악성으로 탐지한다', async () => {
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    const result = await scanFile(eicar);
    expect(result.isInfected).toBe(true);
  });

  it('정상 파일은 감염되지 않은 것으로 판정한다', async () => {
    const clean = Buffer.from('hello world');
    const result = await scanFile(clean);
    expect(result.isInfected).toBe(false);
  });
});
