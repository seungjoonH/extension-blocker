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
  console.log(JSON.stringify({ ...entry, createdAt: new Date().toISOString() }));
}
