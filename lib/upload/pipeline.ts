import { randomUUID } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server-client';
import { validateFilename } from '@/lib/policy/filename';
import { findBlockedExtension } from '@/lib/policy/match';
import { scanFile } from '@/lib/clamav/client';
import { saveToStorage, deleteFromStorage } from '@/lib/upload/storage';
import { logUploadResult } from '@/lib/logging/logger';
import { UploadError } from '@/lib/policy/errors';
import { formatFileSizeMb } from '@/lib/format/fileSize';

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

function sanitizeMimeType(mimeType: string): string | null {
  if (!mimeType) return null;
  // eslint-disable-next-line no-control-regex
  const stripped = mimeType.replace(/[\x00-\x1F\x7F]/g, '');
  return stripped.length > 0 ? stripped.slice(0, 255) : null;
}

export async function runUploadPipeline(input: UploadPipelineInput): Promise<UploadPipelineResult> {
  const start = Date.now();
  const { file, requestId } = input;
  const fileSizeBytes = file.size;

  const filenameCheck = validateFilename(file.name);
  if (!filenameCheck.ok) {
    logUploadResult({ requestId, result: 'rejected', reason: 'INVALID_FILENAME', detail: filenameCheck.reason, durationMs: Date.now() - start });
    const message =
      filenameCheck.reason === 'EMPTY_FILENAME'
        ? `"${file.name}"은 파일명이 비어 있어 업로드할 수 없습니다.`
        : `"${file.name}"은 파일명이 너무 길어(255바이트 초과) 업로드할 수 없습니다.`;
    throw new UploadError(filenameCheck.reason, 400, message);
  }

  const supabase = createServiceRoleClient();
  const [extensionsResult, settingsResult] = await Promise.all([
    supabase.from('extension_policy').select('name').eq('active', true),
    supabase.from('upload_settings').select('max_upload_size_bytes').eq('id', 1).single(),
  ]);

  if (extensionsResult.error || settingsResult.error || !settingsResult.data) {
    logUploadResult({ requestId, result: 'failed', reason: 'INTERNAL_ERROR', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('INTERNAL_ERROR', 500, '일시적인 오류가 발생했습니다. 다시 시도해주세요.');
  }

  const blockedExtensions = (extensionsResult.data ?? []).map((e) => e.name);
  const matchedExtension = findBlockedExtension(file.name, blockedExtensions);
  if (matchedExtension) {
    logUploadResult({ requestId, result: 'rejected', reason: 'BLOCKED_EXTENSION', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError('BLOCKED_EXTENSION', 400, `"${file.name}"은 차단된 확장자(${matchedExtension})로 업로드할 수 없습니다.`);
  }

  const maxUploadSizeBytes = settingsResult.data.max_upload_size_bytes;
  if (fileSizeBytes > maxUploadSizeBytes) {
    logUploadResult({ requestId, result: 'rejected', reason: 'FILE_SIZE_EXCEEDED', fileSizeBytes, durationMs: Date.now() - start });
    throw new UploadError(
      'FILE_SIZE_EXCEEDED',
      400,
      `"${file.name}"은 파일 크기가 현재 설정된 최대 크기(${formatFileSizeMb(maxUploadSizeBytes)})를 초과하여 업로드할 수 없습니다.`,
    );
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
    throw new UploadError('CLAMAV_MALWARE_DETECTED', 400, `"${file.name}"은 악성 파일로 탐지되어 업로드할 수 없습니다.`);
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
    declared_mime_type: sanitizeMimeType(file.type),
    file_size_bytes: fileSizeBytes,
  });

  if (insertError) {
    let cleanup: { ok: boolean };
    try {
      cleanup = await deleteFromStorage(id);
    } catch {
      cleanup = { ok: false };
    }
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
