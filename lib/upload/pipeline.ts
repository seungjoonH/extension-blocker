import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { validateFilename } from '@/lib/policy/filename';
import { isExtensionBlocked } from '@/lib/policy/match';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage, deleteFromStorage } from '@/lib/upload/storage';
import { logUploadResult } from '@/lib/logging/logger';
import { UploadError } from '@/lib/policy/errors';

export interface UploadPipelineInput {
  file: File;
  requestId: string;
}

export interface UploadPipelineResult {
  originalFilename: string;
  fileSizeBytes: number;
  normalizedExtension: string | null;
}

function extractExtension(filename: string): string | null {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) {
    return null;
  }
  return filename.slice(lastDot + 1).toLowerCase();
}

export async function runUploadPipeline(input: UploadPipelineInput): Promise<UploadPipelineResult> {
  const start = Date.now();
  const { file, requestId } = input;
  const fileSizeBytes = file.size;

  const filenameCheck = validateFilename(file.name);
  if (!filenameCheck.ok) {
    logUploadResult({ requestId, result: 'rejected', reason: 'INVALID_FILENAME', detail: filenameCheck.reason, durationMs: Date.now() - start });
    const message = filenameCheck.reason === 'EMPTY_FILENAME' ? '파일명이 비어 있습니다.' : '파일명이 너무 깁니다.';
    throw new UploadError(filenameCheck.reason, 400, message);
  }

  const supabase = createServiceRoleClient();
  const [{ data: extensions }, { data: settings }] = await Promise.all([
    supabase.from('extension_policy').select('name').eq('active', true),
    supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single(),
  ]);

  const blockedExtensions = (extensions ?? []).map((e) => e.name);
  if (isExtensionBlocked(file.name, blockedExtensions)) {
    logUploadResult({ requestId, result: 'rejected', reason: 'BLOCKED_EXTENSION', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('BLOCKED_EXTENSION', 400, `"${file.name}"은 차단된 확장자로 업로드할 수 없습니다.`);
  }

  const maxUploadSizeBytes = settings?.max_upload_size_bytes ?? 10485760;
  if (fileSizeBytes > maxUploadSizeBytes) {
    logUploadResult({ requestId, result: 'rejected', reason: 'FILE_SIZE_EXCEEDED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('FILE_SIZE_EXCEEDED', 400, `파일 크기가 현재 설정된 최대 크기(${maxUploadSizeBytes}바이트)를 초과했습니다.`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let scanResult: { isInfected: boolean };
  try {
    scanResult = await scanFile(buffer);
  } catch {
    logUploadResult({ requestId, result: 'failed', reason: 'CLAMAV_UNAVAILABLE', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('CLAMAV_UNAVAILABLE', 503, '파일 검사에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  if (scanResult.isInfected) {
    logUploadResult({ requestId, result: 'rejected', reason: 'CLAMAV_MALWARE_DETECTED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('CLAMAV_MALWARE_DETECTED', 400, '악성 파일로 탐지되어 업로드할 수 없습니다.');
  }

  const id = randomUUID();
  try {
    await saveToStorage(id, buffer);
  } catch {
    logUploadResult({ requestId, result: 'failed', reason: 'STORAGE_SAVE_FAILED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('STORAGE_SAVE_FAILED', 502, '일시적인 오류가 발생했습니다. 다시 시도해주세요.');
  }

  const normalizedExtension = extractExtension(file.name);
  const { error: insertError } = await supabase.from('uploads').insert({
    id,
    original_filename: file.name,
    normalized_extension: normalizedExtension,
    declared_mime_type: file.type || null,
    file_size_bytes: fileSizeBytes,
  });

  if (insertError) {
    const cleanup = await deleteFromStorage(id);
    logUploadResult({
      requestId,
      result: 'failed',
      reason: 'METADATA_SAVE_FAILED',
      fileSizeBytes,
      cleanupResult: cleanup.ok ? 'SUCCESS' : 'FAILED',
      cleanupErrorCode: cleanup.ok ? null : 'STORAGE_DELETE_FAILED',
      durationMs: Date.now() - start,
    });
    throw new UploadError('METADATA_SAVE_FAILED', 500, '일시적인 오류가 발생했습니다. 다시 시도해주세요.');
  }

  logUploadResult({ requestId, result: 'success', extension: normalizedExtension ?? undefined, fileSizeBytes, durationMs: Date.now() - start });

  return { originalFilename: file.name, fileSizeBytes, normalizedExtension };
}
