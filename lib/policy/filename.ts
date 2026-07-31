const MAX_FILENAME_BYTES = 255;

export type FilenameValidationResult =
  | { ok: true }
  | { ok: false; reason: 'EMPTY_FILENAME' | 'FILENAME_TOO_LONG' };

export function validateFilename(filename: string): FilenameValidationResult {
  if (filename.length === 0) {
    return { ok: false, reason: 'EMPTY_FILENAME' };
  }

  const byteLength = new TextEncoder().encode(filename).length;
  if (byteLength > MAX_FILENAME_BYTES) {
    return { ok: false, reason: 'FILENAME_TOO_LONG' };
  }

  return { ok: true };
}
