export interface UploadLogEntry {
  requestId: string;
  result: 'success' | 'rejected' | 'failed';
  reason?: string;
  detail?: string;
  extension?: string;
  fileSizeBytes?: number;
  durationMs: number;
  cleanupResult?: 'SUCCESS' | 'FAILED';
  cleanupErrorCode?: string | null;
}

export function logUploadResult(entry: UploadLogEntry): void {
  const record = {
    requestId: entry.requestId,
    result: entry.result,
    reason: entry.reason,
    detail: entry.detail,
    extension: entry.extension,
    fileSizeBytes: entry.fileSizeBytes,
    durationMs: entry.durationMs,
    cleanupResult: entry.cleanupResult,
    cleanupErrorCode: entry.cleanupErrorCode,
    createdAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(record));
}
