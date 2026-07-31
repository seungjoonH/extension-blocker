import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/clamav/client', () => ({ scanFile: vi.fn() }));
vi.mock('@/lib/upload/storage', () => ({ saveToStorage: vi.fn(), deleteFromStorage: vi.fn() }));
vi.mock('@/lib/logging/logger', () => ({ logUploadResult: vi.fn() }));

import { runUploadPipeline } from './pipeline';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage } from '@/lib/upload/storage';
import { createServiceRoleClient } from '@/lib/supabase/server-client';

function makeFile(name: string, content: string, type = 'text/plain') {
  return new File([content], name, { type });
}

describe('runUploadPipeline', () => {
  const supabase = createServiceRoleClient();

  beforeEach(async () => {
    vi.mocked(scanFile).mockResolvedValue({ isInfected: false });
    vi.mocked(saveToStorage).mockResolvedValue(undefined);
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  afterEach(async () => {
    await supabase.from('extension_policy').update({ active: false }).eq('kind', 'fixed');
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 10485760 }).eq('id', 1);
  });

  it('정상 파일은 저장하고 메타데이터를 반환한다', async () => {
    const result = await runUploadPipeline({ file: makeFile('photo.jpg', 'binary-data'), requestId: 'req-ok' });
    expect(result.originalFilename).toBe('photo.jpg');
    expect(result.normalizedExtension).toBe('jpg');
  });

  it('빈 파일명은 EMPTY_FILENAME으로 거부한다', async () => {
    await expect(
      runUploadPipeline({ file: makeFile('', 'data'), requestId: 'req-empty' }),
    ).rejects.toMatchObject({ code: 'EMPTY_FILENAME' });
  });

  it('차단된 확장자는 BLOCKED_EXTENSION으로 거부한다', async () => {
    await supabase.from('extension_policy').update({ active: true }).eq('name', 'exe');
    await expect(
      runUploadPipeline({ file: makeFile('tool.exe', 'data'), requestId: 'req-blocked' }),
    ).rejects.toMatchObject({ code: 'BLOCKED_EXTENSION' });
  });

  it('정책 크기를 초과하면 FILE_SIZE_EXCEEDED로 거부한다', async () => {
    await supabase.from('upload_settings').update({ max_upload_size_bytes: 1048576 }).eq('id', 1);
    const big = 'a'.repeat(1048577);
    await expect(
      runUploadPipeline({ file: makeFile('big.txt', big), requestId: 'req-big' }),
    ).rejects.toMatchObject({ code: 'FILE_SIZE_EXCEEDED' });
  });

  it('ClamAV가 악성으로 탐지하면 CLAMAV_MALWARE_DETECTED로 거부한다', async () => {
    vi.mocked(scanFile).mockResolvedValue({ isInfected: true });
    await expect(
      runUploadPipeline({ file: makeFile('virus.txt', 'data'), requestId: 'req-virus' }),
    ).rejects.toMatchObject({ code: 'CLAMAV_MALWARE_DETECTED' });
  });

  it('ClamAV 연결이 실패하면 CLAMAV_UNAVAILABLE로 거부한다', async () => {
    vi.mocked(scanFile).mockRejectedValue(new Error('connection refused'));
    await expect(
      runUploadPipeline({ file: makeFile('clean.txt', 'data'), requestId: 'req-clamdown' }),
    ).rejects.toMatchObject({ code: 'CLAMAV_UNAVAILABLE' });
  });
});
