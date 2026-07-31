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
    vi.clearAllMocks();
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
    expect(result.fileSizeBytes).toBe(Buffer.byteLength('binary-data'));

    // uploads 테이블은 service_role에 insert/delete만 부여되어 있고 select는
    // 의도적으로 부여되어 있지 않다(0003_uploads.sql, Task 5). 따라서 select로
    // 저장된 행을 직접 조회해 재검증할 수 없다 — insert가 실패했다면
    // runUploadPipeline이 METADATA_SAVE_FAILED를 던지고 위 await가 reject되므로,
    // 여기까지 도달했다는 사실 자체가 실제 insert 성공을 증명한다.
    // 테스트가 남긴 행은 원본 파일명으로 정리한다(테스트 정리 용도로만 쓰이는
    // delete 권한 사용, 프로덕션 코드는 delete를 호출하지 않음).
    await supabase.from('uploads').delete().eq('original_filename', 'photo.jpg');
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
