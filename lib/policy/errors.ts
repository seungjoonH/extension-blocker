export type UploadErrorCode =
  | 'INVALID_MULTIPART_REQUEST'
  | 'FILE_REQUIRED'
  | 'MULTIPLE_FILES_NOT_ALLOWED'
  | 'REQUEST_TOO_LARGE'
  | 'EMPTY_FILENAME'
  | 'FILENAME_TOO_LONG'
  | 'BLOCKED_EXTENSION'
  | 'FILE_SIZE_EXCEEDED'
  | 'CLAMAV_MALWARE_DETECTED'
  | 'CLAMAV_UNAVAILABLE'
  | 'STORAGE_SAVE_FAILED'
  | 'METADATA_SAVE_FAILED'
  | 'INTERNAL_ERROR';

export class UploadError extends Error {
  constructor(
    public readonly code: UploadErrorCode,
    public readonly status: number,
    public readonly userMessage: string,
  ) {
    super(code);
    this.name = 'UploadError';
  }
}
