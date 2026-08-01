const BYTES_PER_MB = 1024 * 1024;

/** 업로드 정책·화면 표시용. 1MB = 1024²바이트 기준으로 소수 한 자리(예: 1.0MB, 3.1MB). */
export function formatFileSizeMb(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)}MB`;
}
